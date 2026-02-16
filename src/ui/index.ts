import './style.css';

export { DatabaseSettings } from './components/database-settings';
export { DatabaseUnlock } from './components/database-unlock';
export { StoragePicker } from './components/storage-picker';
export { SyncIndicator } from './components/sync-indicator';
export { ThemeProvider } from './components/theme-provider';
export { createClxUI } from './clxui';
export type {
  ClxUI,
  ClxUIOptions,
  ClxUIDialogCloseResult,
  OpenDatabaseSettingsOptions,
  OpenDatabaseUnlockOptions,
  OpenStoragePickerOptions,
  ShowSyncIndicatorOptions,
} from './clxui';
export type { ClxUIDatabaseClient } from './types';
export type {
  DatabaseUnlockProps,
  DatabaseUnlockSubmission,
  DatabaseUnlockOperation,
} from './components/database-unlock';
export type { ThemeMode, ThemeProviderProps } from './components/theme-provider';
export type {
  FileSystemAccessStorageSelection,
  OpfsStorageSelection,
  StoragePickerBackendType,
  StoragePickerSelection,
  WebDAVStorageSelection,
} from './components/storage-picker';
