import { ClxDB } from '@/core/clxdb';

export const createClxDB = (...args: ConstructorParameters<typeof ClxDB>) => new ClxDB(...args);
export { generateNewClxDB } from '@/core/utils/generate';
export { inspectClxDBStatus } from '@/core/utils/inspect';

export { createStorageBackend } from '@/storages';
export { createClxBlobs } from '@/blobs';

export type { ClxDB };
export type { ClxDBStatus } from '@/core/utils/inspect';

export type {
  DatabaseBackend,
  StorageBackend,
  ShardDocument,
  DatabaseDocument,
  ClxDBCrypto,
  ClxDBClientOptions,
  ClxDBOptions,
} from '@/types';
export type { ClxBlobs, ClxBlobsParams } from '@/blobs';
