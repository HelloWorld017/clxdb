import { FileSystemBackend } from './filesystem';
import { S3Backend } from './s3';
import { WebDAVBackend } from './webdav';
import type { FileSystemConfig } from './filesystem';
import type { S3Config } from './s3';
import type { WebDAVConfig } from './webdav';
import type { StorageBackend } from '../types';

export type StorageConfig = WebDAVConfig | FileSystemConfig | S3Config;

export function createStorageBackend(config: StorageConfig): StorageBackend {
  switch (config.kind) {
    case 'webdav':
      return new WebDAVBackend(config);

    case 'filesystem':
      return new FileSystemBackend(config);

    case 's3':
      return new S3Backend(config);

    default:
      throw new Error(`Unknown storage type: ${(config as StorageConfig).kind}`);
  }
}

export const deserializeStorageBackend = async (
  serializedStorage: unknown
): Promise<StorageBackend | null> =>
  WebDAVBackend.deserialize(serializedStorage) ||
  S3Backend.deserialize(serializedStorage) ||
  (await FileSystemBackend.deserialize(serializedStorage));
