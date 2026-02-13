import { FileSystemBackend } from './filesystem';
import { WebDAVBackend } from './webdav';
import type { StorageBackend, StorageConfig } from '../types';

export function createStorageBackend(config: StorageConfig): StorageBackend {
  switch (config.type) {
    case 'webdav':
      return new WebDAVBackend({
        url: config.url,
        auth: config.auth,
      });

    case 'filesystem-access':
      return new FileSystemBackend(config.handle);

    default:
      throw new Error(`Unknown storage type: ${(config as StorageConfig).type}`);
  }
}
