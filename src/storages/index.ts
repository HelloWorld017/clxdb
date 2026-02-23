import { FileSystemBackend } from './filesystem';
import { WebDAVBackend } from './webdav';
import type { FileSystemConfig } from './filesystem';
import type { WebDAVConfig } from './webdav';
import type { StorageBackend } from '../types';

export type StorageConfig = WebDAVConfig | FileSystemConfig;

export function createStorageBackend(config: StorageConfig): StorageBackend {
  switch (config.kind) {
    case 'webdav':
      return new WebDAVBackend(config);

    case 'filesystem':
      return new FileSystemBackend(config);

    default:
      throw new Error(`Unknown storage type: ${(config as StorageConfig).kind}`);
  }
}

export const deserializeStorageBackend = async (
  serializedStorage: unknown
): Promise<StorageBackend | null> =>
  WebDAVBackend.deserialize(serializedStorage) ||
  (await FileSystemBackend.deserialize(serializedStorage));
