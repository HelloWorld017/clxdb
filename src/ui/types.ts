import type { ClxDBEvents, StorageBackend, SyncState } from '@/types';

export interface ClxUIDatabaseClient {
  storage: StorageBackend;
  getState: () => SyncState;
  on: <K extends keyof ClxDBEvents>(event: K, listener: ClxDBEvents[K]) => () => void;
  sync: () => Promise<void>;
  updateMasterPassword(oldPassword: string, newPassword: string): Promise<void>;
  updateQuickUnlockPassword(masterPassword: string, quickUnlockPin: string): Promise<void>;
  removeRegisteredDevice(deviceId: string): Promise<void>;
  getCurrentDeviceId?: () => Promise<string | null>;
}
