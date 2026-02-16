import { useState } from 'react';
import { formatDeviceId, formatLastUsedAt, getErrorMessage } from './utils';
import type { ClxDBStatus } from '@/core/utils/inspect';

export interface DevicesTabProps {
  status: ClxDBStatus | null;
  currentDeviceId: string | null;
  disabled: boolean;
  onRemoveDevice: (deviceId: string) => Promise<void>;
}

export const DevicesTab = ({
  status,
  currentDeviceId,
  disabled,
  onRemoveDevice,
}: DevicesTabProps) => {
  const [removingDeviceId, setRemovingDeviceId] = useState<string | null>(null);
  const [deviceError, setDeviceError] = useState<string | null>(null);

  const registeredDevices = status?.registeredDeviceKeys ?? [];

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
      await onRemoveDevice(deviceId);
    } catch (error) {
      setDeviceError(getErrorMessage(error, 'Unable to remove this device. Please try again.'));
    } finally {
      setRemovingDeviceId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-default-900">Trusted devices</h3>
        <p className="mt-1 text-sm text-default-600">
          Remove device keys that should no longer unlock this database.
        </p>
      </div>

      {!status?.hasDatabase ? (
        <p
          className="rounded-xl border border-default-300 bg-default-100 px-3 py-2 text-sm
            text-default-700"
        >
          No database detected for this storage backend yet.
        </p>
      ) : status.isEncrypted ? (
        <>
          {deviceError && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {deviceError}
            </p>
          )}

          {registeredDevices.length === 0 ? (
            <p
              className="rounded-xl border border-dashed border-default-300 bg-default-50 px-3 py-4
                text-sm text-default-500"
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
                    className="rounded-xl border border-default-200 bg-default-50/70 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-default-900">
                          {device.deviceName}
                        </p>
                        <p className="font-monospace mt-1 text-xs text-default-500">
                          ID: {formatDeviceId(device.deviceId)}
                        </p>
                        <p className="mt-1 text-xs text-default-500">
                          Last used: {formatLastUsedAt(device.lastUsedAt)}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {isCurrentDevice && (
                          <span
                            className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5
                              py-1 text-[11px] font-semibold text-emerald-700"
                          >
                            This device
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => void handleRemoveDevice(device.deviceId)}
                          disabled={disabled || isRemoving || isCurrentDevice}
                          className="inline-flex items-center justify-center rounded-lg border
                            border-default-300 bg-surface px-3 py-1.5 text-xs font-semibold
                            text-default-700 transition-colors duration-200 hover:border-red-300
                            hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed
                            disabled:border-default-200 disabled:bg-default-100
                            disabled:text-default-400"
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
  );
};
