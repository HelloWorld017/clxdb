import type { ClxDBClientOptions, StorageBackend } from '@/types';
import type { ReactNode } from 'react';

export type SettingsTab = 'overview' | 'encryption' | 'devices' | 'export';

export interface TabOption {
  id: SettingsTab;
  label: string;
  icon: ReactNode;
}

export interface StorageOverview {
  backendLabel: string;
  detailLabel: string;
  detailValue: string;
  description: string;
}

export interface DatabaseSettingsClient {
  updateMasterPassword(oldPassword: string, newPassword: string): Promise<void>;
  updateQuickUnlockPassword(masterPassword: string, quickUnlockPin: string): Promise<void>;
  removeRegisteredDevice(deviceId: string): Promise<void>;
  getCurrentDeviceId?: () => Promise<string | null>;
}

export interface DatabaseSettingsProps {
  storage: StorageBackend;
  client: DatabaseSettingsClient;
  options?: ClxDBClientOptions;
  className?: string;
  disabled?: boolean;
}
