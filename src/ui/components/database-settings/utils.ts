import type { StorageOverview } from './types';
import type { StorageBackend, StorageBackendMetadata } from '@/types';
import type { ClxUITranslate } from '@/ui/i18n';

export const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export const formatDeviceId = (deviceId: string) =>
  deviceId.length > 18 ? `${deviceId.slice(0, 10)}...${deviceId.slice(-6)}` : deviceId;

export const formatLastUsedAt = (
  value: number,
  { locale, unknownLabel }: { locale: string; unknownLabel: string }
) => {
  if (!Number.isFinite(value)) {
    return unknownLabel;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return unknownLabel;
  }

  return parsed.toLocaleString(locale);
};

export const resolveStorageMetadata = (storage: StorageBackend): StorageBackendMetadata | null => {
  try {
    return storage.getMetadata?.() ?? null;
  } catch {
    return null;
  }
};

export const getStorageOverview = (
  metadata: StorageBackendMetadata | null,
  t: ClxUITranslate
): StorageOverview => {
  if (!metadata) {
    return {
      backendLabel: t('storageOverview.custom.backendLabel'),
      detailLabel: t('storageOverview.custom.detailLabel'),
      detailValue: t('storageOverview.custom.detailValue'),
      description: t('storageOverview.custom.description'),
    };
  }

  if (metadata.kind === 'webdav') {
    return {
      backendLabel: t('storageOverview.webdav.backendLabel'),
      detailLabel: t('storageOverview.webdav.detailLabel'),
      detailValue: metadata.endpoint,
      description: t('storageOverview.webdav.description'),
    };
  }

  if (metadata.kind === 's3') {
    const providerLabel =
      metadata.provider === 'r2'
        ? t('storageOverview.s3.provider.r2')
        : metadata.provider === 'minio'
          ? t('storageOverview.s3.provider.minio')
          : t('storageOverview.s3.provider.s3');
    const bucketPath = metadata.prefix ? `${metadata.bucket}/${metadata.prefix}` : metadata.bucket;

    return {
      backendLabel: providerLabel,
      detailLabel: t('storageOverview.s3.detailLabel'),
      detailValue: bucketPath,
      description: t('storageOverview.s3.description', {
        endpoint: metadata.endpoint,
        region: metadata.region,
      }),
    };
  }

  const providerLabel =
    metadata.provider === 'opfs'
      ? t('storageOverview.filesystem.opfs.backendLabel')
      : t('storageOverview.filesystem.access.backendLabel');

  return {
    backendLabel: providerLabel,
    detailLabel: t('storageOverview.filesystem.detailLabel'),
    detailValue: metadata.directoryName,
    description:
      metadata.provider === 'opfs'
        ? t('storageOverview.filesystem.opfs.description')
        : t('storageOverview.filesystem.access.description'),
  };
};
