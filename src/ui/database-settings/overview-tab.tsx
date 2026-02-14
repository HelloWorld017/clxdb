import type { StorageOverview } from './types';
import type { ClxDBStatus } from '@/core/utils/inspect';

export interface OverviewTabProps {
  status: ClxDBStatus | null;
  registeredDeviceCount: number;
  storageOverview: StorageOverview;
}

export const OverviewTab = ({
  status,
  registeredDeviceCount,
  storageOverview,
}: OverviewTabProps) => (
  <div className="space-y-4">
    <div>
      <h3 className="text-default-900 text-lg font-semibold">Connection overview</h3>
      <p className="text-default-600 mt-1 text-sm">
        Confirm where this database is connected before changing credentials or devices.
      </p>
    </div>

    <div className="grid gap-4 lg:grid-cols-2">
      <article className="border-default-200 bg-default-50/80 rounded-2xl border p-4">
        <p className="text-default-500 text-[11px] font-semibold tracking-[0.16em] uppercase">
          Storage Backend
        </p>
        <p className="text-default-900 mt-2 text-lg font-semibold">
          {storageOverview.backendLabel}
        </p>
        <p className="text-default-600 mt-1 text-sm leading-relaxed">
          {storageOverview.description}
        </p>

        <div className="border-default-200 bg-surface mt-4 rounded-xl border px-3 py-2.5">
          <p className="text-default-500 text-xs">{storageOverview.detailLabel}</p>
          <p
            className="text-default-800 mt-1 font-[ui-monospace,monospace] text-sm font-medium
              break-all"
          >
            {storageOverview.detailValue}
          </p>
        </div>
      </article>

      <article className="border-default-200 bg-default-50/80 rounded-2xl border p-4">
        <p className="text-default-500 text-[11px] font-semibold tracking-[0.16em] uppercase">
          Database State
        </p>

        <div className="mt-3 space-y-2 text-sm">
          <div
            className="border-default-200 bg-surface flex flex-col gap-1 rounded-lg border px-3
              py-2"
          >
            <span className="text-default-500 text-xs">UUID</span>
            <span
              className="text-default-800 max-w-[55%] truncate font-[ui-monospace,monospace]
                font-medium"
              title={status?.uuid ?? 'Not available'}
            >
              {status?.uuid ?? 'Not available'}
            </span>
          </div>
          <div
            className="border-default-200 bg-surface flex flex-col gap-1 rounded-lg border px-3
              py-2"
          >
            <span className="text-default-500 text-xs">Encryption</span>
            <span className="text-default-800 font-medium">
              {status?.isEncrypted ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <div
            className="border-default-200 bg-surface flex flex-col gap-1 rounded-lg border px-3
              py-2"
          >
            <span className="text-default-500 text-xs">Registered devices</span>
            <span className="text-default-800 font-medium">{registeredDeviceCount}</span>
          </div>
        </div>
      </article>
    </div>
  </div>
);
