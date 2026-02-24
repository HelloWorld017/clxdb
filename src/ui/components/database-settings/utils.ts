import type { StorageOverview } from './types';
import type { StorageBackend, StorageBackendMetadata } from '@/types';

export const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export const formatDeviceId = (deviceId: string) =>
  deviceId.length > 18 ? `${deviceId.slice(0, 10)}...${deviceId.slice(-6)}` : deviceId;

export const formatLastUsedAt = (value: number) => {
  if (!Number.isFinite(value)) {
    return 'Unknown';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown';
  }

  return parsed.toLocaleString();
};

export const resolveStorageMetadata = (storage: StorageBackend): StorageBackendMetadata | null => {
  try {
    return storage.getMetadata?.() ?? null;
  } catch {
    return null;
  }
};

export const getStorageOverview = (metadata: StorageBackendMetadata | null): StorageOverview => {
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

  if (metadata.kind === 's3') {
    const providerLabel =
      metadata.provider === 'r2'
        ? 'Cloudflare R2'
        : metadata.provider === 'minio'
          ? 'MinIO'
          : 'Amazon S3';
    const bucketPath = metadata.prefix ? `${metadata.bucket}/${metadata.prefix}` : metadata.bucket;

    return {
      backendLabel: providerLabel,
      detailLabel: 'Bucket / Prefix',
      detailValue: bucketPath,
      description: `Your database reads and writes through an S3-compatible endpoint (${metadata.endpoint}, ${metadata.region}).`,
    };
  }

  const providerLabel =
    metadata.provider === 'opfs' ? 'Origin Private File System' : 'FileSystem Access API';

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
