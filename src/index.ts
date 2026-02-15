import { ClxDB } from '@/core/clxdb';

export const createClxDB = (...args: ConstructorParameters<typeof ClxDB>) => new ClxDB(...args);
export { generateNewClxDB } from '@/core/utils/generate';
export { inspectClxDBStatus } from '@/core/utils/inspect';

export { createStorageBackend } from '@/storages';
export {
  DatabaseSettings,
  DatabaseUnlock,
  StoragePicker,
  SyncIndicator,
  ThemeProvider,
} from '@/ui';
export type { ClxDBStatus } from '@/core/utils/inspect';
export type {
  DatabaseBackend,
  StorageBackend,
  ClxDBCrypto,
  ClxDBClientOptions,
  ClxDBOptions,
} from '@/types';
export type {
  DatabaseSettingsClient,
  DatabaseSettingsProps,
  DatabaseUnlockProps,
  DatabaseUnlockSubmission,
  FileSystemAccessStorageSelection,
  OpfsStorageSelection,
  StoragePickerBackendType,
  StoragePickerSelection,
  SyncIndicatorClient,
  SyncIndicatorHorizontalPosition,
  SyncIndicatorProps,
  SyncIndicatorVerticalPosition,
  ThemeMode,
  ThemeProviderProps,
  WebDAVStorageSelection,
} from '@/ui';
