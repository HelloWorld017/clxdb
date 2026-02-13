import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { inspectClxDBStatus } from '@/core/utils/inspect';
import { DevicesTab } from './devices-tab';
import { EncryptionTab } from './encryption-tab';
import { ExportTab } from './export-tab';
import { OverviewTab } from './overview-tab';
import { classes, getErrorMessage, getStorageOverview, resolveStorageMetadata } from './utils';
import type { DatabaseSettingsProps, SettingsTab, TabOption } from './types';
import type { ClxDBStatus } from '@/core/utils/inspect';

export const TAB_OPTIONS: TabOption[] = [
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

  const inspectionSequenceRef = useRef(0);

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

  const handleUpdateMasterPassword = useCallback(
    async (oldPassword: string, newPassword: string) => {
      await client.updateMasterPassword(oldPassword, newPassword);
      await refreshStatus();
    },
    [client, refreshStatus]
  );

  const handleUpdateQuickUnlockPin = useCallback(
    async (masterPassword: string, quickUnlockPin: string) => {
      await client.updateQuickUnlockPassword(masterPassword, quickUnlockPin);
      await refreshStatus();
    },
    [client, refreshStatus]
  );

  const handleRemoveDevice = useCallback(
    async (deviceId: string) => {
      await client.removeRegisteredDevice(deviceId);
      await refreshStatus();
    },
    [client, refreshStatus]
  );

  const controlsLocked = disabled || isInspecting;
  const registeredDeviceCount = status?.registeredDeviceKeys.length ?? 0;

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
              <OverviewTab
                status={status}
                registeredDeviceCount={registeredDeviceCount}
                storageOverview={storageOverview}
              />
            )}

            {activeTab === 'encryption' && (
              <EncryptionTab
                status={status}
                disabled={controlsLocked}
                onUpdateMasterPassword={handleUpdateMasterPassword}
                onUpdateQuickUnlockPin={handleUpdateQuickUnlockPin}
              />
            )}

            {activeTab === 'devices' && (
              <DevicesTab
                status={status}
                currentDeviceId={currentDeviceId}
                disabled={controlsLocked}
                onRemoveDevice={handleRemoveDevice}
              />
            )}

            {activeTab === 'export' && <ExportTab />}
          </div>
        </div>
      </div>
    </section>
  );
}

export type { DatabaseSettingsClient, DatabaseSettingsProps } from './types';
