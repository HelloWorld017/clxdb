import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { inspectClxDBStatus } from '@/core/utils/inspect';
import { PIN_LENGTH, PinInput, createEmptyPin, isCompletePin, pinToString } from './pin-input';
import type { ClxDBStatus } from '@/core/utils/inspect';
import type { ClxDBClientOptions, StorageBackend, StorageBackendMetadata } from '@/types';
import type { SubmitEvent } from 'react';

type SettingsTab = 'overview' | 'encryption' | 'devices' | 'export';

type TabOption = {
  id: SettingsTab;
  label: string;
  description: string;
};

const TAB_OPTIONS: TabOption[] = [
  {
    id: 'overview',
    label: 'Overview',
    description: 'Storage and runtime status',
  },
  {
    id: 'encryption',
    label: 'Encryption',
    description: 'Master password and PIN',
  },
  {
    id: 'devices',
    label: 'Devices',
    description: 'Trusted quick-unlock devices',
  },
  {
    id: 'export',
    label: 'Export',
    description: 'JSON backup and restore',
  },
];

const classes = (...values: Array<string | null | undefined | false>) =>
  values.filter(Boolean).join(' ');

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const formatDeviceId = (deviceId: string) =>
  deviceId.length > 18 ? `${deviceId.slice(0, 10)}...${deviceId.slice(-6)}` : deviceId;

const formatLastUsedAt = (value: number) => {
  if (!Number.isFinite(value)) {
    return 'Unknown';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown';
  }

  return parsed.toLocaleString();
};

const resolveStorageMetadata = (storage: StorageBackend): StorageBackendMetadata | null => {
  try {
    return storage.getMetadata?.() ?? null;
  } catch {
    return null;
  }
};

const getStorageOverview = (metadata: StorageBackendMetadata | null) => {
  if (!metadata) {
    return {
      backendLabel: 'Custom backend',
      detailLabel: 'Connection details',
      detailValue: 'Not exposed by this storage adapter',
      description:
        'This storage adapter does not provide self-describing metadata. Connection details are managed by the host app.',
    };
  }

  if (metadata.kind === 'webdav') {
    return {
      backendLabel: 'WebDAV',
      detailLabel: 'Endpoint',
      detailValue: metadata.endpoint,
      description: 'Your database reads and writes through a remote WebDAV endpoint.',
    };
  }

  const providerLabel =
    metadata.provider === 'opfs' ? 'Origin Private File System (OPFS)' : 'FileSystem Access API';

  return {
    backendLabel: providerLabel,
    detailLabel: 'Directory',
    detailValue: metadata.directoryName,
    description:
      metadata.provider === 'opfs'
        ? 'Your database is stored in browser-managed private storage for this origin.'
        : 'Your database is stored in a user-selected local directory.',
  };
};

export interface DatabaseSettingsClient {
  updateMasterPassword(oldPassword: string, newPassword: string): Promise<void>;
  updateQuickUnlockPassword(masterPassword: string, quickUnlockPin: string): Promise<void>;
  removeRegisteredDevice(deviceId: string): Promise<void>;
  getCurrentDeviceId?: () => Promise<string | null>;
}

export interface DatabaseSettingsProps {
  storage: StorageBackend;
  client: DatabaseSettingsClient;
  options?: ClxDBClientOptions;
  className?: string;
  disabled?: boolean;
}

export function DatabaseSettings({
  storage,
  client,
  options,
  className,
  disabled = false,
}: DatabaseSettingsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('overview');

  const [status, setStatus] = useState<ClxDBStatus | null>(null);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
  const [isInspecting, setIsInspecting] = useState(true);
  const [inspectError, setInspectError] = useState<string | null>(null);

  const [currentMasterPassword, setCurrentMasterPassword] = useState('');
  const [newMasterPassword, setNewMasterPassword] = useState('');
  const [confirmMasterPassword, setConfirmMasterPassword] = useState('');
  const [isUpdatingMasterPassword, setIsUpdatingMasterPassword] = useState(false);
  const [masterPasswordError, setMasterPasswordError] = useState<string | null>(null);
  const [masterPasswordSuccess, setMasterPasswordSuccess] = useState<string | null>(null);

  const [pinMasterPassword, setPinMasterPassword] = useState('');
  const [newPinDigits, setNewPinDigits] = useState<string[]>(() => createEmptyPin());
  const [confirmPinDigits, setConfirmPinDigits] = useState<string[]>(() => createEmptyPin());
  const [isUpdatingPin, setIsUpdatingPin] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSuccess, setPinSuccess] = useState<string | null>(null);

  const [removingDeviceId, setRemovingDeviceId] = useState<string | null>(null);
  const [deviceError, setDeviceError] = useState<string | null>(null);

  const inspectionSequenceRef = useRef(0);
  const baseId = useId();

  const storageMetadata = useMemo(() => resolveStorageMetadata(storage), [storage]);
  const storageOverview = useMemo(() => getStorageOverview(storageMetadata), [storageMetadata]);

  const refreshStatus = useCallback(async () => {
    const sequence = ++inspectionSequenceRef.current;
    setIsInspecting(true);
    setInspectError(null);

    try {
      const currentDevicePromise = client.getCurrentDeviceId
        ? client.getCurrentDeviceId()
        : Promise.resolve<string | null>(null);

      const [nextStatus, nextCurrentDeviceId] = await Promise.all([
        inspectClxDBStatus(storage, options),
        currentDevicePromise,
      ]);

      if (sequence !== inspectionSequenceRef.current) {
        return;
      }

      setStatus(nextStatus);
      setCurrentDeviceId(nextCurrentDeviceId);
    } catch (error) {
      if (sequence !== inspectionSequenceRef.current) {
        return;
      }

      setStatus(null);
      setCurrentDeviceId(null);
      setInspectError(
        getErrorMessage(error, 'Failed to inspect database metadata. Check connection and retry.')
      );
    } finally {
      if (sequence === inspectionSequenceRef.current) {
        setIsInspecting(false);
      }
    }
  }, [client, options, storage]);

  useEffect(() => {
    void refreshStatus();
    return () => {
      inspectionSequenceRef.current += 1;
    };
  }, [refreshStatus]);

  const controlsLocked = disabled || isInspecting;
  const registeredDevices = status?.registeredDeviceKeys ?? [];

  const validateMasterPasswordForm = () => {
    if (!currentMasterPassword) {
      return 'Enter your current master password.';
    }

    if (!newMasterPassword) {
      return 'Enter a new master password.';
    }

    if (newMasterPassword !== confirmMasterPassword) {
      return 'New master password and confirmation do not match.';
    }

    if (currentMasterPassword === newMasterPassword) {
      return 'Use a different password from your current one.';
    }

    return null;
  };

  const validatePinForm = () => {
    if (!pinMasterPassword) {
      return 'Enter your master password to change quick unlock PIN.';
    }

    if (!isCompletePin(newPinDigits) || !isCompletePin(confirmPinDigits)) {
      return `Enter all ${PIN_LENGTH} digits for both PIN fields.`;
    }

    if (pinToString(newPinDigits) !== pinToString(confirmPinDigits)) {
      return 'PIN confirmation does not match.';
    }

    return null;
  };

  const handleMasterPasswordSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (controlsLocked || isUpdatingMasterPassword) {
      return;
    }

    const validationError = validateMasterPasswordForm();
    if (validationError) {
      setMasterPasswordError(validationError);
      setMasterPasswordSuccess(null);
      return;
    }

    setMasterPasswordError(null);
    setMasterPasswordSuccess(null);
    setIsUpdatingMasterPassword(true);

    try {
      await client.updateMasterPassword(currentMasterPassword, newMasterPassword);
      setCurrentMasterPassword('');
      setNewMasterPassword('');
      setConfirmMasterPassword('');
      setMasterPasswordSuccess('Master password updated successfully.');
      await refreshStatus();
    } catch (error) {
      setMasterPasswordError(
        getErrorMessage(error, 'Unable to update master password. Please try again.')
      );
    } finally {
      setIsUpdatingMasterPassword(false);
    }
  };

  const handlePinSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (controlsLocked || isUpdatingPin) {
      return;
    }

    const validationError = validatePinForm();
    if (validationError) {
      setPinError(validationError);
      setPinSuccess(null);
      return;
    }

    setPinError(null);
    setPinSuccess(null);
    setIsUpdatingPin(true);

    try {
      await client.updateQuickUnlockPassword(pinMasterPassword, pinToString(newPinDigits));
      setPinMasterPassword('');
      setNewPinDigits(createEmptyPin());
      setConfirmPinDigits(createEmptyPin());
      setPinSuccess('Quick unlock PIN updated for this device.');
      await refreshStatus();
    } catch (error) {
      setPinError(getErrorMessage(error, 'Unable to update quick unlock PIN. Please try again.'));
    } finally {
      setIsUpdatingPin(false);
    }
  };

  const handleRemoveDevice = async (deviceId: string) => {
    if (disabled || removingDeviceId) {
      return;
    }

    const shouldRemove =
      typeof window === 'undefined'
        ? true
        : window.confirm(
            'Remove this device from quick unlock access? It will need master password recovery to unlock again.'
          );

    if (!shouldRemove) {
      return;
    }

    setDeviceError(null);
    setRemovingDeviceId(deviceId);

    try {
      await client.removeRegisteredDevice(deviceId);
      await refreshStatus();
    } catch (error) {
      setDeviceError(getErrorMessage(error, 'Unable to remove this device. Please try again.'));
    } finally {
      setRemovingDeviceId(null);
    }
  };

  const statusBadgeLabel =
    !status || !status.hasDatabase
      ? 'No database'
      : status.isEncrypted
        ? 'Encrypted'
        : 'Unencrypted';

  const statusBadgeClass =
    !status || !status.hasDatabase
      ? 'border-zinc-300 bg-zinc-100 text-zinc-600'
      : status.isEncrypted
        ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
        : 'border-amber-300 bg-amber-50 text-amber-800';

  return (
    <section
      className={classes(
        `relative isolate mx-auto w-full max-w-4xl overflow-hidden rounded-[2rem] border
        border-zinc-200 bg-gradient-to-br from-zinc-50 via-zinc-100/70 to-stone-100/80 p-5
        font-['Space_Grotesk','Manrope','sans-serif'] shadow-[0_34px_70px_-48px_rgba(24,24,27,0.45)]
        backdrop-blur-sm sm:p-8`,
        className
      )}
    >
      <div
        className="pointer-events-none absolute -top-20 -left-20 h-52 w-52 rounded-full
          bg-zinc-300/30 blur-3xl"
      />
      <div
        className="pointer-events-none absolute -right-20 -bottom-16 h-52 w-52 rounded-full
          bg-stone-300/35 blur-3xl"
      />

      <div className="relative">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4 sm:mb-7">
          <div className="max-w-2xl space-y-2">
            <p className="text-xs font-semibold tracking-[0.2em] text-zinc-500 uppercase">
              Database Settings
            </p>
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
              Manage your database from one place
            </h2>
            <p className="text-sm leading-relaxed text-zinc-600">
              Review storage, rotate credentials, manage trusted devices, and prepare backup flows.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={classes(
                'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold',
                statusBadgeClass
              )}
            >
              {statusBadgeLabel}
            </span>

            <button
              type="button"
              onClick={() => {
                if (!controlsLocked) {
                  void refreshStatus();
                }
              }}
              disabled={controlsLocked}
              className="inline-flex items-center justify-center rounded-xl border border-zinc-300
                bg-white px-3.5 py-2 text-xs font-semibold tracking-wide text-zinc-700 uppercase
                transition-colors duration-200 hover:border-zinc-400 hover:bg-zinc-100
                disabled:cursor-not-allowed disabled:border-zinc-200 disabled:bg-zinc-100
                disabled:text-zinc-400"
            >
              Refresh
            </button>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-[13rem_minmax(0,1fr)]">
          <aside className="rounded-2xl border border-zinc-200 bg-white/80 p-3">
            <p className="text-[11px] font-semibold tracking-[0.16em] text-zinc-500 uppercase">
              Tabs
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-1">
              {TAB_OPTIONS.map(option => {
                const isActive = activeTab === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setActiveTab(option.id)}
                    className={classes(
                      'rounded-xl border px-3 py-2 text-left transition-colors duration-200',
                      isActive
                        ? 'border-zinc-900 bg-zinc-900 text-zinc-100'
                        : `border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400
                          hover:bg-zinc-50`
                    )}
                  >
                    <p className="text-sm font-semibold">{option.label}</p>
                    <p
                      className={classes(
                        'mt-0.5 text-[11px] leading-relaxed',
                        isActive ? 'text-zinc-300' : 'text-zinc-500'
                      )}
                    >
                      {option.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="rounded-2xl border border-zinc-200 bg-white/85 p-5 sm:p-6">
            {isInspecting && (
              <div
                className="mb-4 inline-flex items-center gap-2 rounded-lg border border-zinc-200
                  bg-zinc-100 px-3 py-2 text-sm text-zinc-600"
              >
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-zinc-500" />
                Refreshing database metadata...
              </div>
            )}

            {inspectError && (
              <p
                className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm
                  text-red-700"
              >
                {inspectError}
              </p>
            )}

            {activeTab === 'overview' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-zinc-900">Connection overview</h3>
                  <p className="mt-1 text-sm text-zinc-600">
                    Confirm where this database is connected before changing credentials or devices.
                  </p>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <article className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4">
                    <p
                      className="text-[11px] font-semibold tracking-[0.16em] text-zinc-500
                        uppercase"
                    >
                      Storage Backend
                    </p>
                    <p className="mt-2 text-lg font-semibold text-zinc-900">
                      {storageOverview.backendLabel}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-zinc-600">
                      {storageOverview.description}
                    </p>

                    <div className="mt-4 rounded-xl border border-zinc-200 bg-white px-3 py-2.5">
                      <p className="text-xs font-medium text-zinc-500">
                        {storageOverview.detailLabel}
                      </p>
                      <p
                        className="mt-1 font-['IBM_Plex_Mono','ui-monospace','monospace'] text-xs
                          font-medium break-all text-zinc-800"
                      >
                        {storageOverview.detailValue}
                      </p>
                    </div>
                  </article>

                  <article className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4">
                    <p
                      className="text-[11px] font-semibold tracking-[0.16em] text-zinc-500
                        uppercase"
                    >
                      Database State
                    </p>

                    <div className="mt-3 space-y-2 text-sm">
                      <div
                        className="flex items-center justify-between gap-3 rounded-lg bg-white px-3
                          py-2"
                      >
                        <span className="text-zinc-500">UUID</span>
                        <span
                          className="max-w-[55%] truncate text-right
                            font-['IBM_Plex_Mono','ui-monospace','monospace'] text-zinc-800"
                          title={status?.uuid ?? 'Not available'}
                        >
                          {status?.uuid ?? 'Not available'}
                        </span>
                      </div>
                      <div
                        className="flex items-center justify-between gap-3 rounded-lg bg-white px-3
                          py-2"
                      >
                        <span className="text-zinc-500">Manifest</span>
                        <span className="font-medium text-zinc-800">
                          {status?.hasDatabase ? 'Present' : 'Missing'}
                        </span>
                      </div>
                      <div
                        className="flex items-center justify-between gap-3 rounded-lg bg-white px-3
                          py-2"
                      >
                        <span className="text-zinc-500">Encryption</span>
                        <span className="font-medium text-zinc-800">
                          {status?.isEncrypted ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                      <div
                        className="flex items-center justify-between gap-3 rounded-lg bg-white px-3
                          py-2"
                      >
                        <span className="text-zinc-500">Quick unlock on this device</span>
                        <span className="font-medium text-zinc-800">
                          {status?.hasUsableDeviceKey ? 'Available' : 'Unavailable'}
                        </span>
                      </div>
                      <div
                        className="flex items-center justify-between gap-3 rounded-lg bg-white px-3
                          py-2"
                      >
                        <span className="text-zinc-500">Registered devices</span>
                        <span className="font-medium text-zinc-800">
                          {registeredDevices.length}
                        </span>
                      </div>
                    </div>
                  </article>
                </div>
              </div>
            )}

            {activeTab === 'encryption' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-zinc-900">Encryption credentials</h3>
                  <p className="mt-1 text-sm text-zinc-600">
                    Rotate your master password and refresh this device PIN without recreating the
                    database.
                  </p>
                </div>

                {!status?.hasDatabase ? (
                  <p
                    className="rounded-xl border border-zinc-300 bg-zinc-100 px-3 py-2 text-sm
                      text-zinc-700"
                  >
                    No database detected for this storage backend yet.
                  </p>
                ) : status.isEncrypted ? (
                  <>
                    <form
                      onSubmit={handleMasterPasswordSubmit}
                      className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4"
                    >
                      <div className="mb-3">
                        <p className="text-sm font-semibold text-zinc-900">
                          Change master password
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                          This updates the encryption key wrapping metadata for all devices.
                        </p>
                      </div>

                      <div className="grid gap-3">
                        <label
                          className="text-xs font-semibold tracking-wide text-zinc-600 uppercase"
                          htmlFor={`${baseId}-current-master-password`}
                        >
                          Current master password
                          <input
                            id={`${baseId}-current-master-password`}
                            type="password"
                            value={currentMasterPassword}
                            onChange={event => setCurrentMasterPassword(event.target.value)}
                            disabled={controlsLocked || isUpdatingMasterPassword}
                            autoComplete="current-password"
                            className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3
                              py-2.5 text-sm font-normal text-zinc-800 transition-colors
                              duration-200 outline-none focus:border-zinc-500
                              disabled:cursor-not-allowed disabled:border-zinc-200
                              disabled:bg-zinc-100"
                          />
                        </label>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <label
                            className="text-xs font-semibold tracking-wide text-zinc-600 uppercase"
                            htmlFor={`${baseId}-new-master-password`}
                          >
                            New master password
                            <input
                              id={`${baseId}-new-master-password`}
                              type="password"
                              value={newMasterPassword}
                              onChange={event => setNewMasterPassword(event.target.value)}
                              disabled={controlsLocked || isUpdatingMasterPassword}
                              autoComplete="new-password"
                              className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3
                                py-2.5 text-sm font-normal text-zinc-800 transition-colors
                                duration-200 outline-none focus:border-zinc-500
                                disabled:cursor-not-allowed disabled:border-zinc-200
                                disabled:bg-zinc-100"
                            />
                          </label>

                          <label
                            className="text-xs font-semibold tracking-wide text-zinc-600 uppercase"
                            htmlFor={`${baseId}-confirm-master-password`}
                          >
                            Confirm new password
                            <input
                              id={`${baseId}-confirm-master-password`}
                              type="password"
                              value={confirmMasterPassword}
                              onChange={event => setConfirmMasterPassword(event.target.value)}
                              disabled={controlsLocked || isUpdatingMasterPassword}
                              autoComplete="new-password"
                              className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3
                                py-2.5 text-sm font-normal text-zinc-800 transition-colors
                                duration-200 outline-none focus:border-zinc-500
                                disabled:cursor-not-allowed disabled:border-zinc-200
                                disabled:bg-zinc-100"
                            />
                          </label>
                        </div>
                      </div>

                      {masterPasswordError && (
                        <p
                          className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2
                            text-sm text-red-700"
                        >
                          {masterPasswordError}
                        </p>
                      )}

                      {masterPasswordSuccess && (
                        <p
                          className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3
                            py-2 text-sm text-emerald-700"
                        >
                          {masterPasswordSuccess}
                        </p>
                      )}

                      <button
                        type="submit"
                        disabled={controlsLocked || isUpdatingMasterPassword}
                        className="mt-4 inline-flex items-center justify-center rounded-xl
                          bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-zinc-100
                          transition-colors duration-200 hover:bg-zinc-800
                          disabled:cursor-not-allowed disabled:bg-zinc-300"
                      >
                        {isUpdatingMasterPassword ? 'Updating...' : 'Update master password'}
                      </button>
                    </form>

                    <form
                      onSubmit={handlePinSubmit}
                      className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4"
                    >
                      <div className="mb-2">
                        <p className="text-sm font-semibold text-zinc-900">
                          Change quick unlock PIN
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                          This updates local quick-unlock credentials for this device.
                        </p>
                      </div>

                      <label
                        className="text-xs font-semibold tracking-wide text-zinc-600 uppercase"
                        htmlFor={`${baseId}-pin-master-password`}
                      >
                        Master password
                        <input
                          id={`${baseId}-pin-master-password`}
                          type="password"
                          value={pinMasterPassword}
                          onChange={event => setPinMasterPassword(event.target.value)}
                          disabled={controlsLocked || isUpdatingPin}
                          autoComplete="current-password"
                          className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3
                            py-2.5 text-sm font-normal text-zinc-800 transition-colors duration-200
                            outline-none focus:border-zinc-500 disabled:cursor-not-allowed
                            disabled:border-zinc-200 disabled:bg-zinc-100"
                        />
                      </label>

                      <PinInput
                        idPrefix={`${baseId}-new-pin`}
                        label="New quick unlock PIN"
                        hint="Use a PIN you can remember. It only unlocks this device."
                        digits={newPinDigits}
                        disabled={controlsLocked || isUpdatingPin}
                        className="my-5"
                        onChange={setNewPinDigits}
                      />

                      <PinInput
                        idPrefix={`${baseId}-confirm-pin`}
                        label="Confirm quick unlock PIN"
                        hint="Enter the same 6-digit PIN again."
                        digits={confirmPinDigits}
                        disabled={controlsLocked || isUpdatingPin}
                        className="my-5"
                        onChange={setConfirmPinDigits}
                      />

                      {pinError && (
                        <p
                          className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm
                            text-red-700"
                        >
                          {pinError}
                        </p>
                      )}

                      {pinSuccess && (
                        <p
                          className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2
                            text-sm text-emerald-700"
                        >
                          {pinSuccess}
                        </p>
                      )}

                      <button
                        type="submit"
                        disabled={controlsLocked || isUpdatingPin}
                        className="mt-4 inline-flex items-center justify-center rounded-xl
                          bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-zinc-100
                          transition-colors duration-200 hover:bg-zinc-800
                          disabled:cursor-not-allowed disabled:bg-zinc-300"
                      >
                        {isUpdatingPin ? 'Updating...' : 'Update quick unlock PIN'}
                      </button>
                    </form>
                  </>
                ) : (
                  <p
                    className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm
                      text-amber-800"
                  >
                    This database is not encrypted. Encryption credential controls are unavailable.
                  </p>
                )}
              </div>
            )}

            {activeTab === 'devices' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-zinc-900">Trusted devices</h3>
                  <p className="mt-1 text-sm text-zinc-600">
                    Remove device keys that should no longer unlock this database.
                  </p>
                </div>

                {!status?.hasDatabase ? (
                  <p
                    className="rounded-xl border border-zinc-300 bg-zinc-100 px-3 py-2 text-sm
                      text-zinc-700"
                  >
                    No database detected for this storage backend yet.
                  </p>
                ) : status.isEncrypted ? (
                  <>
                    {deviceError && (
                      <p
                        className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm
                          text-red-700"
                      >
                        {deviceError}
                      </p>
                    )}

                    {registeredDevices.length === 0 ? (
                      <p
                        className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-3
                          py-4 text-sm text-zinc-500"
                      >
                        No registered quick-unlock devices yet.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {registeredDevices.map(device => {
                          const isCurrentDevice = device.deviceId === currentDeviceId;
                          const isRemoving = removingDeviceId === device.deviceId;

                          return (
                            <article
                              key={device.deviceId}
                              className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-zinc-900">
                                    {device.deviceName}
                                  </p>
                                  <p
                                    className="mt-1
                                      font-['IBM_Plex_Mono','ui-monospace','monospace'] text-xs
                                      text-zinc-500"
                                  >
                                    ID: {formatDeviceId(device.deviceId)}
                                  </p>
                                  <p className="mt-1 text-xs text-zinc-500">
                                    Last used: {formatLastUsedAt(device.lastUsedAt)}
                                  </p>
                                </div>

                                <div className="flex items-center gap-2">
                                  {isCurrentDevice && (
                                    <span
                                      className="rounded-full border border-emerald-300
                                        bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold
                                        text-emerald-700"
                                    >
                                      This device
                                    </span>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => void handleRemoveDevice(device.deviceId)}
                                    disabled={disabled || isRemoving || isCurrentDevice}
                                    className="inline-flex items-center justify-center rounded-lg
                                      border border-zinc-300 bg-white px-3 py-1.5 text-xs
                                      font-semibold text-zinc-700 transition-colors duration-200
                                      hover:border-red-300 hover:bg-red-50 hover:text-red-700
                                      disabled:cursor-not-allowed disabled:border-zinc-200
                                      disabled:bg-zinc-100 disabled:text-zinc-400"
                                  >
                                    {isRemoving ? 'Removing...' : 'Remove'}
                                  </button>
                                </div>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  <p
                    className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm
                      text-amber-800"
                  >
                    Device registry is only available for encrypted databases.
                  </p>
                )}
              </div>
            )}

            {activeTab === 'export' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-zinc-900">Export and import</h3>
                  <p className="mt-1 text-sm text-zinc-600">
                    Prepare JSON backup workflows. Action wiring is intentionally left to your app.
                  </p>
                </div>

                <article className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4">
                  <p className="text-sm font-semibold text-zinc-900">JSON export</p>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                    Download the current database state as a JSON payload for manual backup and
                    audit.
                  </p>

                  <button
                    type="button"
                    disabled
                    className="mt-4 inline-flex items-center justify-center rounded-xl border
                      border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-500"
                  >
                    Export JSON (UI only)
                  </button>
                </article>

                <article className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4">
                  <p className="text-sm font-semibold text-zinc-900">JSON import</p>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                    Restore database data from an exported JSON file in a future implementation.
                  </p>

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      type="file"
                      accept="application/json"
                      disabled
                      className="block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2
                        text-xs text-zinc-500 file:mr-3 file:rounded-lg file:border-0
                        file:bg-zinc-900 file:px-3 file:py-1.5 file:text-xs file:font-semibold
                        file:text-zinc-100"
                    />
                    <button
                      type="button"
                      disabled
                      className="inline-flex items-center justify-center rounded-xl border
                        border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-500"
                    >
                      Import JSON (UI only)
                    </button>
                  </div>
                </article>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
