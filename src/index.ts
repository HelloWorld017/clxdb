export { createClxDB, generateNewClxDB, inspectClxDBStatus } from '@/core';
export { createStorageBackend, deserializeStorageBackend } from '@/storages';

export type { ClxDB, ClxDBStatus } from '@/core';

export type {
  DatabaseBackend,
  StorageBackend,
  ShardDocument,
  DatabaseDocument,
  DocumentsMergeRule,
  ClxDBCrypto,
  ClxDBClientOptions,
  ClxDBOptions,
  SyncState,
  StoredBlob,
} from '@/types';

export type { StorageConfig } from '@/storages';
