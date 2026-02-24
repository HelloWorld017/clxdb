import type { StorageConfig } from '@/storages';

export interface StoragePickerConfigChange {
  config: StorageConfig | null;
  isValid: boolean;
  validationMessage: string | null;
  debounceKey: string;
}

export type OnStoragePickerConfigChange = (change: StoragePickerConfigChange) => void;
