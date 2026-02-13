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
      <h3 className="text-lg font-semibold text-zinc-900">Connection overview</h3>
      <p className="mt-1 text-sm text-zinc-600">
        Confirm where this database is connected before changing credentials or devices.
      </p>
    </div>

    <div className="grid gap-4 lg:grid-cols-2">
      <article className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-zinc-500 uppercase">
          Storage Backend
        </p>
        <p className="mt-2 text-lg font-semibold text-zinc-900">{storageOverview.backendLabel}</p>
        <p className="mt-1 text-sm leading-relaxed text-zinc-600">{storageOverview.description}</p>

        <div className="mt-4 rounded-xl border border-zinc-200 bg-white px-3 py-2.5">
          <p className="text-xs text-zinc-500">{storageOverview.detailLabel}</p>
          <p
            className="mt-1 font-[ui-monospace,monospace] text-sm font-medium break-all
              text-zinc-800"
          >
            {storageOverview.detailValue}
          </p>
        </div>
      </article>

      <article className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-zinc-500 uppercase">
          Database State
        </p>

        <div className="mt-3 space-y-2 text-sm">
          <div className="flex flex-col gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-2">
            <span className="text-xs text-zinc-500">UUID</span>
            <span
              className="max-w-[55%] truncate font-[ui-monospace,monospace] font-medium
                text-zinc-800"
              title={status?.uuid ?? 'Not available'}
            >
              {status?.uuid ?? 'Not available'}
            </span>
          </div>
          <div className="flex flex-col gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-2">
            <span className="text-xs text-zinc-500">Encryption</span>
            <span className="font-medium text-zinc-800">
              {status?.isEncrypted ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <div className="flex flex-col gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-2">
            <span className="text-xs text-zinc-500">Registered devices</span>
            <span className="font-medium text-zinc-800">{registeredDeviceCount}</span>
          </div>
        </div>
      </article>
    </div>
  </div>
);
