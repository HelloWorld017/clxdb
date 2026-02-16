import type { StorageBackend } from '@/types';

export interface DatabaseClient {
  storage: StorageBackend;
  updateMasterPassword(oldPassword: string, newPassword: string): Promise<void>;
  updateQuickUnlockPassword(masterPassword: string, quickUnlockPin: string): Promise<void>;
  removeRegisteredDevice(deviceId: string): Promise<void>;
  getCurrentDeviceId?: () => Promise<string | null>;
}
