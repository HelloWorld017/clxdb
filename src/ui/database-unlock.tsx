import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { inspectClxDBStatus } from '@/core/utils/inspect';
import type { ClxDBStatus } from '@/core/utils/inspect';
import type { ClxDBClientOptions, StorageBackend } from '@/types';
import type { SubmitEvent } from 'react';

export type DatabaseUnlockSubmission =
  | {
      mode: 'create';
      masterPassword: string;
      quickUnlockPin: string;
      status: ClxDBStatus;
    }
  | {
      mode: 'quick-unlock';
      quickUnlockPin: string;
      status: ClxDBStatus;
    }
  | {
      mode: 'master-recovery';
      masterPassword: string;
      quickUnlockPin: string;
      status: ClxDBStatus;
    };

export interface DatabaseUnlockProps {
  storage: StorageBackend;
  onSubmit: (submission: DatabaseUnlockSubmission) => Promise<void> | void;
  options?: ClxDBClientOptions;
  onStatusChange?: (status: ClxDBStatus) => void;
  className?: string;
  disabled?: boolean;
  title?: string;
  description?: string;
}

type UnlockMode =
  | 'inspecting'
  | 'create'
  | 'quick-unlock'
  | 'master-recovery'
  | 'unsupported'
  | 'inspection-error';

const classes = (...values: Array<string | null | undefined | false>) =>
  values.filter(Boolean).join(' ');

const formatDeviceId = (value: string) =>
  value.length > 16 ? `${value.slice(0, 10)}...${value.slice(-4)}` : value;

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

const PIN_MIN_LENGTH = 4;

const getInspectErrorMessage = (error: unknown) => {
  const fallback = 'Unable to inspect storage metadata. Check connectivity and try again.';
  return error instanceof Error ? error.message : fallback;
};

const getSubmitErrorMessage = (error: unknown) => {
  const fallback = 'Unlock request failed. Verify credentials and retry.';
  return error instanceof Error ? error.message : fallback;
};

const resolveMode = (
  status: ClxDBStatus | null,
  isInspecting: boolean,
  inspectError: string | null
): UnlockMode => {
  if (isInspecting) {
    return 'inspecting';
  }

  if (inspectError) {
    return 'inspection-error';
  }

  if (!status) {
    return 'inspection-error';
  }

  if (!status.hasDatabase) {
    return 'create';
  }

  if (!status.isEncrypted) {
    return 'unsupported';
  }

  if (status.hasUsableDeviceKey) {
    return 'quick-unlock';
  }

  return 'master-recovery';
};

type StatusPillProps = {
  label: string;
  value: string;
  healthy: boolean;
};

const StatusPill = ({ label, value, healthy }: StatusPillProps) => (
  <div
    className={classes(
      'rounded-xl border px-3 py-2 transition-colors duration-200',
      healthy
        ? 'border-zinc-300 bg-white/70 text-zinc-800'
        : 'border-zinc-200 bg-zinc-100/70 text-zinc-500'
    )}
  >
    <p className="text-[10px] font-semibold tracking-[0.16em] uppercase">{label}</p>
    <p className="mt-1 text-sm font-medium">{value}</p>
  </div>
);

export function DatabaseUnlock({
  storage,
  onSubmit,
  options,
  onStatusChange,
  className,
  disabled = false,
  title = 'Database Access Control',
  description = 'Inspect this storage backend and continue with the correct unlock path for your encrypted ClxDB instance.',
}: DatabaseUnlockProps) {
  const [status, setStatus] = useState<ClxDBStatus | null>(null);
  const [isInspecting, setIsInspecting] = useState(true);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [masterPassword, setMasterPassword] = useState('');
  const [quickUnlockPin, setQuickUnlockPin] = useState('');

  const inspectionSequenceRef = useRef(0);
  const baseId = useId();

  const mode = useMemo(
    () => resolveMode(status, isInspecting, inspectError),
    [status, isInspecting, inspectError]
  );

  const inspect = useCallback(async () => {
    const sequence = ++inspectionSequenceRef.current;
    setIsInspecting(true);
    setInspectError(null);
    setSubmitError(null);

    try {
      const nextStatus = await inspectClxDBStatus(storage, options);
      if (sequence !== inspectionSequenceRef.current) {
        return;
      }

      setStatus(nextStatus);
      onStatusChange?.(nextStatus);
    } catch (error) {
      if (sequence !== inspectionSequenceRef.current) {
        return;
      }

      setStatus(null);
      setInspectError(getInspectErrorMessage(error));
    } finally {
      if (sequence === inspectionSequenceRef.current) {
        setIsInspecting(false);
      }
    }
  }, [options, onStatusChange, storage]);

  useEffect(() => {
    void inspect();
    return () => {
      inspectionSequenceRef.current += 1;
    };
  }, [inspect]);

  const submitLabel =
    mode === 'create'
      ? 'Create Encrypted Database'
      : mode === 'quick-unlock'
        ? 'Unlock with PIN'
        : mode === 'master-recovery'
          ? 'Unlock and Enroll PIN'
          : 'Continue';

  const modeTitle =
    mode === 'inspecting'
      ? 'Inspecting backend metadata'
      : mode === 'create'
        ? 'Create a new encrypted database'
        : mode === 'quick-unlock'
          ? 'Quick unlock available'
          : mode === 'master-recovery'
            ? 'Recover with master password'
            : mode === 'unsupported'
              ? 'Unsupported database state'
              : 'Inspection failed';

  const modeDescription =
    mode === 'inspecting'
      ? 'Reading manifest and local device-key cache. This determines your unlock flow.'
      : mode === 'create'
        ? 'No manifest was found. Set a master password and local quick unlock PIN to bootstrap encryption.'
        : mode === 'quick-unlock'
          ? 'A valid local device key exists. Enter your PIN to derive the quick unlock key.'
          : mode === 'master-recovery'
            ? 'This device cannot use quick unlock yet. Enter master password once and enroll a new local PIN.'
            : mode === 'unsupported'
              ? 'The existing database is not encrypted. This UI handles encrypted create/unlock flows only.'
              : 'Metadata inspection could not be completed. Retry after checking storage credentials.';

  const requiresMaster = mode === 'create' || mode === 'master-recovery';
  const requiresPin = mode === 'create' || mode === 'quick-unlock' || mode === 'master-recovery';

  const controlsLocked = disabled || isSubmitting || isInspecting;

  const validateForm = () => {
    if (!status) {
      return 'Database status is unavailable. Run inspection again.';
    }

    if (requiresMaster && masterPassword.length === 0) {
      return 'Enter your master password.';
    }

    if (requiresPin) {
      if (quickUnlockPin.length === 0) {
        return 'Enter your quick unlock PIN.';
      }

      if (quickUnlockPin.length < PIN_MIN_LENGTH) {
        return `Quick unlock PIN must be at least ${PIN_MIN_LENGTH} characters.`;
      }
    }

    return null;
  };

  const handleRefresh = () => {
    if (controlsLocked) {
      return;
    }

    void inspect();
  };

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (controlsLocked || !status) {
      return;
    }

    if (!['create', 'quick-unlock', 'master-recovery'].includes(mode)) {
      return;
    }

    const validationError = validateForm();
    if (validationError) {
      setSubmitError(validationError);
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      if (mode === 'create') {
        await onSubmit({
          mode,
          masterPassword,
          quickUnlockPin,
          status,
        });
      }

      if (mode === 'quick-unlock') {
        await onSubmit({
          mode,
          quickUnlockPin,
          status,
        });
      }

      if (mode === 'master-recovery') {
        await onSubmit({
          mode,
          masterPassword,
          quickUnlockPin,
          status,
        });
      }

      setMasterPassword('');
      setQuickUnlockPin('');
      await inspect();
    } catch (error) {
      setSubmitError(getSubmitErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const registeredDeviceKeys = status?.registeredDeviceKeys ?? [];
  const showRegisteredDeviceKeys =
    (mode === 'quick-unlock' || mode === 'master-recovery') && registeredDeviceKeys.length > 0;

  const formVisible = mode === 'create' || mode === 'quick-unlock' || mode === 'master-recovery';

  const summaryHasDatabase = status?.hasDatabase ?? false;
  const summaryEncrypted = status?.isEncrypted ?? false;
  const summaryQuickUnlock = status?.hasUsableDeviceKey ?? false;

  return (
    <section
      className={classes(
        `relative isolate mx-auto w-full max-w-3xl overflow-hidden rounded-[2rem] border
        border-zinc-200 bg-zinc-50/85 p-6 shadow-[0_34px_70px_-48px_rgba(24,24,27,0.45)]
        backdrop-blur-sm sm:p-8`,
        className
      )}
    >
      <div
        className="pointer-events-none absolute -top-20 -left-20 h-52 w-52 rounded-full
          bg-zinc-300/40 blur-3xl"
      />
      <div
        className="pointer-events-none absolute -right-24 -bottom-20 h-56 w-56 rounded-full
          bg-stone-300/35 blur-3xl"
      />

      <div className="relative">
        <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold tracking-[0.18em] text-zinc-500 uppercase">
              Encryption Onboarding
            </p>
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
              {title}
            </h2>
            <p className="max-w-2xl text-sm leading-relaxed text-zinc-600">{description}</p>
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={controlsLocked}
            className="inline-flex items-center justify-center rounded-xl border border-zinc-300
              bg-white px-3.5 py-2 text-xs font-semibold tracking-wide text-zinc-700 uppercase
              transition-colors duration-200 hover:border-zinc-400 hover:bg-zinc-100
              disabled:cursor-not-allowed disabled:border-zinc-200 disabled:bg-zinc-100
              disabled:text-zinc-400"
          >
            Re-scan
          </button>
        </header>

        <div className="grid gap-3 sm:grid-cols-3">
          <StatusPill
            label="Manifest"
            value={summaryHasDatabase ? 'Found' : 'Missing'}
            healthy={summaryHasDatabase}
          />
          <StatusPill
            label="Encryption"
            value={summaryEncrypted ? 'Enabled' : 'Disabled'}
            healthy={summaryEncrypted}
          />
          <StatusPill
            label="Quick Unlock"
            value={summaryQuickUnlock ? 'Usable' : 'Unavailable'}
            healthy={summaryQuickUnlock}
          />
        </div>

        <div className="mt-5 rounded-2xl border border-zinc-200 bg-white/75 p-5 sm:p-6">
          <p className="text-xs font-semibold tracking-[0.16em] text-zinc-500 uppercase">
            Current Step
          </p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight text-zinc-900">{modeTitle}</h3>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600">{modeDescription}</p>

          {status?.uuid ? (
            <p
              className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs
                text-zinc-500"
            >
              Database UUID: <span className="font-mono text-zinc-700">{status.uuid}</span>
            </p>
          ) : null}

          {mode === 'inspecting' && (
            <div
              className="mt-5 inline-flex items-center gap-2 rounded-lg border border-zinc-200
                bg-zinc-100 px-3 py-2 text-sm text-zinc-600"
            >
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-zinc-500" />
              Inspecting storage state...
            </div>
          )}

          {mode === 'inspection-error' && inspectError && (
            <p
              className="mt-5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm
                text-red-700"
            >
              {inspectError}
            </p>
          )}

          {mode === 'unsupported' && (
            <p
              className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm
                text-amber-800"
            >
              This backend appears to host an unencrypted database. Use a non-encrypted open flow or
              migrate the manifest to encrypted mode.
            </p>
          )}

          {formVisible && (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {requiresMaster && (
                <label
                  className="block text-sm font-semibold text-zinc-800"
                  htmlFor={`${baseId}-master`}
                >
                  Master Password
                  <input
                    id={`${baseId}-master`}
                    type="password"
                    value={masterPassword}
                    onChange={event => setMasterPassword(event.target.value)}
                    autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
                    disabled={controlsLocked}
                    placeholder="Enter your master password"
                    className="mt-2 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-2.5
                      text-sm text-zinc-800 transition-colors duration-200 outline-none
                      placeholder:text-zinc-400 focus:border-zinc-500 focus:bg-white
                      disabled:cursor-not-allowed disabled:border-zinc-200 disabled:bg-zinc-100"
                  />
                </label>
              )}

              {requiresPin && (
                <label
                  className="block text-sm font-semibold text-zinc-800"
                  htmlFor={`${baseId}-pin`}
                >
                  {mode === 'master-recovery' ? 'New Quick Unlock PIN' : 'Quick Unlock PIN'}
                  <input
                    id={`${baseId}-pin`}
                    type="password"
                    value={quickUnlockPin}
                    onChange={event => setQuickUnlockPin(event.target.value)}
                    autoComplete={mode === 'quick-unlock' ? 'current-password' : 'new-password'}
                    inputMode="numeric"
                    disabled={controlsLocked}
                    placeholder="At least 4 characters"
                    className="mt-2 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-2.5
                      text-sm text-zinc-800 transition-colors duration-200 outline-none
                      placeholder:text-zinc-400 focus:border-zinc-500 focus:bg-white
                      disabled:cursor-not-allowed disabled:border-zinc-200 disabled:bg-zinc-100"
                  />
                  <span className="mt-1 block text-xs font-normal text-zinc-500">
                    This PIN stays local to this device and is used to derive your quick unlock key.
                  </span>
                </label>
              )}

              {showRegisteredDeviceKeys && (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold tracking-[0.16em] text-zinc-500 uppercase">
                      Registered Devices
                    </p>
                    <span className="text-xs text-zinc-500">{registeredDeviceKeys.length}</span>
                  </div>

                  <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                    {registeredDeviceKeys.map(device => (
                      <div
                        key={device.deviceId}
                        className="rounded-lg border border-zinc-200 bg-white px-3 py-2"
                      >
                        <p className="text-sm font-medium text-zinc-800">{device.deviceName}</p>
                        <p className="text-xs text-zinc-500">
                          Device ID: {formatDeviceId(device.deviceId)}
                        </p>
                        <p className="text-xs text-zinc-500">
                          Last activity: {formatLastUsedAt(device.lastUsedAt)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {submitError && (
                <p
                  className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm
                    text-red-700"
                >
                  {submitError}
                </p>
              )}

              <button
                type="submit"
                disabled={controlsLocked}
                className="inline-flex w-full items-center justify-center rounded-xl bg-zinc-900
                  px-4 py-2.5 text-sm font-semibold text-zinc-100 transition-colors duration-200
                  hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
              >
                {isSubmitting ? 'Applying...' : submitLabel}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
