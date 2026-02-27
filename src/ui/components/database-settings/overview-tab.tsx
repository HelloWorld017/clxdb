import { _t, useI18n } from '@/ui/i18n';
import type { StorageOverview } from './types';
import type { ClxDBStatus } from '@/core/utils/inspect';

export interface OverviewTabProps {
  status: ClxDBStatus | null;
  registeredDeviceCount: number;
  registeredCurrentDevice: boolean;
  storageOverview: StorageOverview;
}

export const OverviewTab = ({
  status,
  registeredDeviceCount,
  registeredCurrentDevice,
  storageOverview,
}: OverviewTabProps) => {
  const { t } = useI18n();

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-default-900">
          <_t>{['overviewTab.title']}</_t>
        </h3>
        <p className="mt-1 text-sm text-default-600">
          <_t>{['overviewTab.description']}</_t>
        </p>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-default-200 bg-default-50/80 p-4">
          <p className="text-[11px] font-semibold tracking-[0.16em] text-default-500 uppercase">
            <_t>{['overviewTab.storageBackend.title']}</_t>
          </p>
          <p className="mt-2 text-lg font-semibold text-default-900">
            {storageOverview.backendLabel}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-default-600">
            {storageOverview.description}
          </p>

          <div className="mt-4 rounded-xl border border-default-200 bg-surface px-3 py-2.5">
            <p className="text-xs text-default-500">{storageOverview.detailLabel}</p>
            <p className="mt-1 font-monospace text-sm font-medium break-all text-default-800">
              {storageOverview.detailValue}
            </p>
          </div>
        </article>

        <article className="rounded-2xl border border-default-200 bg-default-50/80 p-4">
          <p className="text-[11px] font-semibold tracking-[0.16em] text-default-500 uppercase">
            <_t>{['overviewTab.databaseState.title']}</_t>
          </p>

          <div className="mt-3 space-y-2 text-sm">
            <div
              className="flex flex-col gap-1 rounded-lg border border-default-200 bg-surface px-3
                py-2"
            >
              <span className="text-xs text-default-500">
                <_t>{['overviewTab.uuid.label']}</_t>
              </span>
              <span
                className="truncate font-monospace font-medium text-default-800"
                title={status?.uuid ?? t('overviewTab.uuid.unavailable')}
              >
                {status?.uuid ?? t('overviewTab.uuid.unavailable')}
              </span>
            </div>
            <div
              className="flex items-center justify-between gap-1 rounded-lg border
                border-default-200 bg-surface px-3 py-2"
            >
              <span className="text-xs text-default-500">
                <_t>{['overviewTab.encryption.label']}</_t>
              </span>
              <span className="font-medium text-default-800">
                {status?.isEncrypted
                  ? t('overviewTab.encryption.enabled')
                  : t('overviewTab.encryption.disabled')}
              </span>
            </div>
            <div
              className="flex items-center justify-between gap-1 rounded-lg border
                border-default-200 bg-surface px-3 py-2"
            >
              <span className="text-xs text-default-500">
                <_t>{['overviewTab.deviceCurrent.label']}</_t>
              </span>
              <span className="font-medium text-default-800">
                {registeredCurrentDevice
                  ? t('overviewTab.deviceCurrent.registered')
                  : t('overviewTab.deviceCurrent.notRegistered')}
              </span>
            </div>
            <div
              className="flex items-center justify-between gap-1 rounded-lg border
                border-default-200 bg-surface px-3 py-2"
            >
              <span className="text-xs text-default-500">
                <_t>{['overviewTab.registeredDevices.label']}</_t>
              </span>
              <span className="font-medium text-default-800">{registeredDeviceCount}</span>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
};
