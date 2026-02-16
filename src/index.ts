import { ClxDB } from '@/core/clxdb';

export const createClxDB = (...args: ConstructorParameters<typeof ClxDB>) => new ClxDB(...args);
export { generateNewClxDB } from '@/core/utils/generate';
export { inspectClxDBStatus } from '@/core/utils/inspect';

export { createStorageBackend } from '@/storages';
export { createClxUI } from '@/ui';

export type { ClxDB };
export type { ClxDBStatus } from '@/core/utils/inspect';

export type {
  DatabaseBackend,
  StorageBackend,
  ClxDBCrypto,
  ClxDBClientOptions,
  ClxDBOptions,
} from '@/types';

export type {
  ClxUI,
  ClxUIOptions,
  DatabaseUnlockOperation,
  FileSystemAccessStorageSelection,
  OpfsStorageSelection,
  WebDAVStorageSelection,
  StoragePickerSelection,
} from '@/ui';
