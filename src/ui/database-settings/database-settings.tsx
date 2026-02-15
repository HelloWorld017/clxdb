import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { inspectClxDBStatus } from '@/core/utils/inspect';
import { classes } from '@/utils/classes';
import { DevicesTab } from './devices-tab';
import { EncryptionTab } from './encryption-tab';
import { ExportTab } from './export-tab';
import { DevicesIcon, EncryptionIcon, ExportIcon, OverviewIcon } from './icons';
import { OverviewTab } from './overview-tab';
import { getErrorMessage, getStorageOverview, resolveStorageMetadata } from './utils';
import type { DatabaseSettingsProps, SettingsTab, TabOption } from './types';
import type { ClxDBStatus } from '@/core/utils/inspect';

export const TAB_OPTIONS: TabOption[] = [
  { id: 'overview', label: 'Overview', icon: <OverviewIcon /> },
  { id: 'encryption', label: 'Encryption', icon: <EncryptionIcon /> },
  { id: 'devices', label: 'Devices', icon: <DevicesIcon /> },
  { id: 'export', label: 'Export', icon: <ExportIcon /> },
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
  const registeredCurrentDevice = !!status?.registeredDeviceKeys.find(
    ({ deviceId }) => deviceId === currentDeviceId
  );

  return (
    <section
      className={classes(
        `border-default-200 bg-default-50/85 relative isolate mx-auto flex h-150 w-full max-w-4xl
        flex-col overflow-hidden rounded-[2rem] border`,
        className
      )}
    >
      <header
        className="mb-3 flex flex-none flex-wrap items-start justify-between gap-4 px-8 py-6
          sm:mb-4"
      >
        <p className="text-default-500 text-xs font-semibold tracking-[0.2em] uppercase">
          Database Settings
        </p>
      </header>

      <div className="grid min-h-0 flex-1 gap-1 md:grid-cols-[13rem_minmax(0,1fr)]">
        <aside className="p-4 pt-0">
          <div className="grid grid-cols-2 md:grid-cols-1">
            {TAB_OPTIONS.map(option => {
              const isActive = activeTab === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setActiveTab(option.id)}
                  className={classes(
                    `flex items-center gap-3 rounded-xl border border-transparent px-3 py-2
                    text-left font-medium transition-colors duration-200`,
                    isActive
                      ? 'border-default-100 bg-default-100 text-default-900'
                      : `text-default-700 hover:border-default-50 hover:bg-default-100
                        dark:hover:bg-default-50/30`
                  )}
                >
                  <span
                    className={classes(
                      'flex flex-none rounded-md p-1.5 transition-colors duration-200',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-default-100 dark:bg-default-100/80'
                    )}
                  >
                    {option.icon}
                  </span>
                  <p className="text-sm">{option.label}</p>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="h-full min-h-0 p-4 pt-0">
          <div
            className="border-default-200 bg-surface/85 h-full overflow-y-auto rounded-2xl border
              p-5 sm:p-6"
          >
            {isInspecting && (
              <div
                className="border-default-200 bg-default-100 text-default-600 mb-4 inline-flex
                  items-center gap-2 rounded-lg border px-3 py-2 text-sm"
              >
                <span className="bg-default-500 h-2.5 w-2.5 animate-pulse rounded-full" />
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
                registeredCurrentDevice={registeredCurrentDevice}
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
