import './style.css';

export { DatabaseSettings } from './components/database-settings';
export { DatabaseUnlock } from './components/database-unlock';
export { StoragePicker } from './components/storage-picker';
export { SyncIndicator } from './components/sync-indicator';
export { ThemeProvider } from './components/theme-provider';
export { createClxUI } from './clxui';
export type {
  ClxUI,
  ClxUIDialogCloseResult,
  OpenDatabaseSettingsOptions,
  OpenDatabaseUnlockOptions,
  OpenStoragePickerOptions,
  ShowSyncIndicatorOptions,
} from './clxui';
export type { DatabaseSettingsClient, DatabaseSettingsProps } from './components/database-settings';
export type { DatabaseUnlockProps, DatabaseUnlockSubmission } from './components/database-unlock';
export type {
  SyncIndicatorClient,
  SyncIndicatorHorizontalPosition,
  SyncIndicatorProps,
  SyncIndicatorVerticalPosition,
} from './components/sync-indicator';
export type { ThemeMode, ThemeProviderProps } from './components/theme-provider';
export type {
  FileSystemAccessStorageSelection,
  OpfsStorageSelection,
  StoragePickerBackendType,
  StoragePickerSelection,
  WebDAVStorageSelection,
} from './components/storage-picker';
