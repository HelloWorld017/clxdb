import { MANIFEST_PATH } from '@/constants';
import { manifestSchema } from '@/schemas';
import { CryptoManager } from '../managers/crypto-manager';
import { normalizeOptions } from './options';
import type { ClxDBOptions, StorageBackend } from '@/types';

export interface ClxDBStatus {
  uuid: string | null;
  hasDatabase: boolean;
  isEncrypted: boolean;
  hasRegisteredDeviceKey: boolean;
  hasUsableDeviceKey: boolean;
  registeredDeviceKeys: {
    deviceId: string;
    deviceName: string;
    lastUsedAt: number;
  }[];
}

export const inspectClxDBStatus = async (
  storage: StorageBackend,
  options: ClxDBOptions
): Promise<ClxDBStatus> => {
  const stat = await storage.stat(MANIFEST_PATH);
  if (!stat) {
    return {
      uuid: null,
      hasDatabase: false,
      isEncrypted: false,
      hasRegisteredDeviceKey: false,
      hasUsableDeviceKey: false,
      registeredDeviceKeys: [],
    };
  }

  const content = await storage.read(MANIFEST_PATH);
  const parsed = JSON.parse(new TextDecoder().decode(content)) as unknown;
  const manifestResult = manifestSchema.safeParse(parsed);
  if (!manifestResult.success) {
    throw new Error(`Invalid manifest format: ${manifestResult.error.message}`);
  }

  const manifest = manifestResult.data;
  if (!manifest.crypto) {
    return {
      uuid: manifest.uuid,
      hasDatabase: true,
      isEncrypted: false,
      hasRegisteredDeviceKey: false,
      hasUsableDeviceKey: false,
      registeredDeviceKeys: [],
    };
  }

  const registeredDeviceKeys = Object.entries(manifest.crypto.deviceKey)
    .map(([deviceId, deviceKeyInfo]) => ({
      deviceId,
      deviceName: deviceKeyInfo.deviceName,
      lastUsedAt: deviceKeyInfo.lastUsedAt,
    }))
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt);

  const hasRegisteredDeviceKey = registeredDeviceKeys.length > 0;
  const hasUsableDeviceKey = await CryptoManager.hasUsableDeviceKey(
    manifest.crypto.deviceKey,
    normalizeOptions(options)
  );

  return {
    uuid: manifest.uuid,
    hasDatabase: true,
    isEncrypted: true,
    hasRegisteredDeviceKey,
    hasUsableDeviceKey,
    registeredDeviceKeys,
  };
};
