import {
  CACHE_DEVICE_KEY_STORE_KEY,
  CRYPTO_AUTH_ALGORITHM,
  CRYPTO_DERIVATION_ALGORITHM,
  CRYPTO_DERIVATION_MASTER_ALGORITHM,
  CRYPTO_DERIVATION_MASTER_ITERATIONS,
  CRYPTO_ENCRYPTION_ALGORITHM,
  CRYPTO_ENCRYPTION_AUTH_TAG_SIZE,
  CRYPTO_ENCRYPTION_IV_SIZE,
  CRYPTO_HASH_ALGORITHM,
} from '@/constants';
import { deviceKeyStoreSchema } from '@/schemas';
import { getFriendlyDeviceName } from '@/utils/device-name';
import { stableJSONSerialize } from '@/utils/json';
import type { CacheManager } from './cache-manager';
import type { ManifestManager } from './manifest-manager';
import type { Manifest, ClxDBCrypto, DeviceKeyStore, ManifestDeviceKeyRegistry } from '@/types';

const toArrayBackedUint8 = (bytes: Uint8Array): Uint8Array<ArrayBuffer> => {
  if (bytes.buffer instanceof ArrayBuffer) {
    return bytes as Uint8Array<ArrayBuffer>;
  }

  return new Uint8Array(bytes);
};

export interface RegisteredDevice {
  deviceId: string;
  deviceName: string;
  lastUsedAt: number;
}

const encrypt = async (key: CryptoKey, plaintext: Uint8Array) => {
  const input = toArrayBackedUint8(plaintext);
  const iv = crypto.getRandomValues(new Uint8Array(CRYPTO_ENCRYPTION_IV_SIZE));
  const ciphertext = await crypto.subtle.encrypt(
    { name: CRYPTO_ENCRYPTION_ALGORITHM, iv },
    key,
    input
  );

  const output = new Uint8Array(iv.length + ciphertext.byteLength);
  output.set(iv, 0);
  output.set(new Uint8Array(ciphertext), iv.length);

  return output;
};

const decrypt = async (key: CryptoKey, input: Uint8Array) => {
  const iv = input.slice(0, CRYPTO_ENCRYPTION_IV_SIZE);
  const ciphertext = input.slice(CRYPTO_ENCRYPTION_IV_SIZE);
  const plaintext = await crypto.subtle.decrypt(
    { name: CRYPTO_ENCRYPTION_ALGORITHM, iv },
    key,
    ciphertext
  );

  return new Uint8Array(plaintext);
};

const importRootKey = (plaintext: Uint8Array) =>
  crypto.subtle.importKey(
    'raw',
    toArrayBackedUint8(plaintext),
    CRYPTO_DERIVATION_ALGORITHM,
    false,
    ['deriveKey']
  );

const importDeviceKey = (plaintext: Uint8Array) =>
  crypto.subtle.importKey(
    'raw',
    toArrayBackedUint8(plaintext),
    CRYPTO_DERIVATION_ALGORITHM,
    false,
    ['deriveKey']
  );

const deriveMasterKey = async (password: string, salt: Uint8Array<ArrayBuffer>) => {
  const encoder = new TextEncoder();
  const masterPassword = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    CRYPTO_DERIVATION_MASTER_ALGORITHM,
    false,
    ['deriveKey']
  );

  const masterKey = await crypto.subtle.deriveKey(
    {
      name: CRYPTO_DERIVATION_MASTER_ALGORITHM,
      salt,
      iterations: CRYPTO_DERIVATION_MASTER_ITERATIONS,
      hash: CRYPTO_HASH_ALGORITHM,
    },
    masterPassword,
    { name: CRYPTO_ENCRYPTION_ALGORITHM, length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  return masterKey;
};

const deriveQuickUnlockKey = async (password: string, deviceKeyStore: DeviceKeyStore) => {
  const encoder = new TextEncoder();
  const quickUnlockKey = await crypto.subtle.deriveKey(
    {
      name: CRYPTO_DERIVATION_ALGORITHM,
      salt: new Uint8Array(0),
      info: encoder.encode(`encryption:quick_unlock/${password}`),
      hash: CRYPTO_HASH_ALGORITHM,
    },
    deviceKeyStore.key,
    { name: CRYPTO_ENCRYPTION_ALGORITHM, length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  return quickUnlockKey;
};

const deriveShardKey = async (rootKey: CryptoKey, shardHash: string) => {
  const encoder = new TextEncoder();
  const shardKey = await crypto.subtle.deriveKey(
    {
      name: CRYPTO_DERIVATION_ALGORITHM,
      salt: new Uint8Array(0),
      info: encoder.encode(`encryption:shard/${shardHash}`),
      hash: CRYPTO_HASH_ALGORITHM,
    },
    rootKey,
    { name: CRYPTO_ENCRYPTION_ALGORITHM, length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  return shardKey;
};

const deriveBlobKey = async (rootKey: CryptoKey, digest: string) => {
  const encoder = new TextEncoder();
  const blobKey = await crypto.subtle.deriveKey(
    {
      name: CRYPTO_DERIVATION_ALGORITHM,
      salt: new Uint8Array(0),
      info: encoder.encode(`encryption:blob/${digest}`),
      hash: CRYPTO_HASH_ALGORITHM,
    },
    rootKey,
    { name: CRYPTO_ENCRYPTION_ALGORITHM, length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  return blobKey;
};

const deriveSigningKey = async (rootKey: CryptoKey) => {
  const encoder = new TextEncoder();
  const signingKey = await crypto.subtle.deriveKey(
    {
      name: CRYPTO_DERIVATION_ALGORITHM,
      salt: new Uint8Array(0),
      info: encoder.encode('sign:manifest'),
      hash: CRYPTO_HASH_ALGORITHM,
    },
    rootKey,
    { name: CRYPTO_AUTH_ALGORITHM, hash: CRYPTO_HASH_ALGORITHM, length: 256 },
    false,
    ['sign', 'verify']
  );

  return signingKey;
};

const getManifestForSign = (manifest: Manifest): Uint8Array<ArrayBuffer> => {
  const encoder = new TextEncoder();
  const manifestForSign = stableJSONSerialize({
    ...manifest,
    crypto: {
      ...manifest.crypto,
      signature: '',
    },
  });

  return encoder.encode(manifestForSign);
};

const signManifest = async (signingKey: CryptoKey, manifest: Manifest) =>
  ({
    ...manifest,
    crypto: {
      ...manifest.crypto!,
      signature: new Uint8Array(
        await crypto.subtle.sign(CRYPTO_AUTH_ALGORITHM, signingKey, getManifestForSign(manifest))
      ).toBase64(),
    },
  }) satisfies Manifest;

const verifyManifest = async (signingKey: CryptoKey, manifest: Manifest) => {
  const result = await crypto.subtle.verify(
    CRYPTO_AUTH_ALGORITHM,
    signingKey,
    Uint8Array.fromBase64(manifest.crypto!.signature),
    getManifestForSign(manifest)
  );

  if (!result) {
    throw new Error('Manifest is tampered!');
  }
};

export class CryptoManager {
  private crypto: ClxDBCrypto;
  private manifestManager: ManifestManager;
  private cacheManager: CacheManager;
  private rootKey: CryptoKey | null | undefined = undefined;

  constructor(crypto: ClxDBCrypto, manifestManager: ManifestManager, cacheManager: CacheManager) {
    this.crypto = crypto;
    this.manifestManager = manifestManager;
    this.cacheManager = cacheManager;
  }

  static async getStoredDeviceKey(cacheManager: CacheManager): Promise<DeviceKeyStore | null> {
    return cacheManager.readIndexedDB(CACHE_DEVICE_KEY_STORE_KEY, deviceKeyStoreSchema);
  }

  static async hasUsableDeviceKey(
    deviceKeyRegistry: ManifestDeviceKeyRegistry,
    cacheManager: CacheManager
  ): Promise<boolean> {
    const deviceKeyStore = await this.getStoredDeviceKey(cacheManager);
    if (!deviceKeyStore) {
      return false;
    }

    return !!deviceKeyRegistry[deviceKeyStore.deviceId]?.key;
  }

  async getCurrentDeviceId(): Promise<string | null> {
    const deviceKeyStore = await CryptoManager.getStoredDeviceKey(this.cacheManager);
    return deviceKeyStore?.deviceId ?? null;
  }

  getRegisteredDevices(): RegisteredDevice[] {
    const manifest = this.manifestManager.getLastManifest();
    if (!manifest.crypto) {
      return [];
    }

    return Object.entries(manifest.crypto.deviceKey)
      .map(([deviceId, deviceKeyInfo]) => ({
        deviceId,
        deviceName: deviceKeyInfo.deviceName,
        lastUsedAt: deviceKeyInfo.lastUsedAt,
      }))
      .sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  }

  async removeRegisteredDevice(deviceId: string) {
    const currentDeviceId = await this.getCurrentDeviceId();

    return async (manifest: Manifest) => {
      if (!manifest.crypto || !this.rootKey) {
        throw new Error('Attempting to open unencrypted database');
      }

      if (!manifest.crypto.deviceKey[deviceId]) {
        throw new Error('Device not found');
      }

      const nextDeviceKey = { ...manifest.crypto.deviceKey };
      delete nextDeviceKey[deviceId];

      const signingKey = await deriveSigningKey(this.rootKey);
      const newManifest = await signManifest(signingKey, {
        ...manifest,
        crypto: {
          ...manifest.crypto,
          deviceKey: nextDeviceKey,
          nonce: crypto.randomUUID(),
          timestamp: Date.now(),
          signature: '',
        },
      });

      return {
        manifest: newManifest,
        commit: async () => {
          if (currentDeviceId === deviceId) {
            await this.cacheManager.removeIndexedDB(CACHE_DEVICE_KEY_STORE_KEY);
          }
        },
      };
    };
  }

  async finalizeManifest(manifest: Manifest): Promise<Manifest> {
    if (!this.rootKey) {
      return manifest;
    }

    if (!manifest.crypto) {
      throw new Error('Attempting to sign unencrypted database');
    }

    const signingKey = await deriveSigningKey(this.rootKey);
    return signManifest(signingKey, {
      ...manifest,
      crypto: {
        ...manifest.crypto,
        nonce: crypto.randomUUID(),
        timestamp: Date.now(),
        signature: '',
      },
    });
  }

  async signInitialManifest(manifest: Manifest): Promise<Manifest> {
    if (this.crypto.kind === 'none') {
      this.rootKey = null;
      return manifest;
    }

    if (this.crypto.kind !== 'master') {
      throw new Error('Master password is needed to create a new manifest');
    }

    const salt = crypto.getRandomValues(new Uint8Array(32));
    const masterKey = await deriveMasterKey(this.crypto.password, salt);
    const rootKeyRaw = crypto.getRandomValues(new Uint8Array(32));
    const rootKeyEncrypted = await encrypt(masterKey, rootKeyRaw);

    this.rootKey = await importRootKey(rootKeyRaw);
    rootKeyRaw.fill(0);

    const signingKey = await deriveSigningKey(this.rootKey);
    const newManifest = await signManifest(signingKey, {
      ...manifest,
      crypto: {
        masterKey: rootKeyEncrypted.toBase64(),
        masterKeySalt: salt.toBase64(),
        deviceKey: {},
        nonce: crypto.randomUUID(),
        timestamp: Date.now(),
        signature: '',
      },
    });

    return newManifest;
  }

  async initialize() {
    const manifest = this.manifestManager.getLastManifest();

    if (!manifest.crypto) {
      if (this.crypto.kind === 'none') {
        this.rootKey = null;
        return;
      }

      throw new Error('Attempting to open unencrypted database');
    }

    if (this.crypto.kind === 'none') {
      throw new Error('Attempting to open encrypted database without crypto configuration');
    }

    if (this.crypto.kind === 'master') {
      const masterKey = await deriveMasterKey(
        this.crypto.password,
        Uint8Array.fromBase64(manifest.crypto.masterKeySalt)
      );

      const rootKeyEncrypted = Uint8Array.fromBase64(manifest.crypto.masterKey);
      const rootKeyRaw = await decrypt(masterKey, rootKeyEncrypted);
      this.rootKey = await importRootKey(rootKeyRaw);
      this.crypto.password = '';
      rootKeyRaw.fill(0);

      const signingKey = await deriveSigningKey(this.rootKey);
      await verifyManifest(signingKey, manifest);
      return;
    }

    if (this.crypto.kind === 'quick-unlock') {
      const deviceKeyStore = await CryptoManager.getStoredDeviceKey(this.cacheManager);

      const deviceKeyRegistry = manifest.crypto.deviceKey;
      const deviceKeyInfo = deviceKeyStore ? deviceKeyRegistry[deviceKeyStore.deviceId] : undefined;
      if (!deviceKeyStore || !deviceKeyInfo) {
        throw new Error('No deviceKey exist');
      }

      const rootKeyEncrypted = Uint8Array.fromBase64(deviceKeyInfo.key);
      const quickUnlockKey = await deriveQuickUnlockKey(this.crypto.password, deviceKeyStore);
      const rootKeyRaw = await decrypt(quickUnlockKey, rootKeyEncrypted);
      this.rootKey = await importRootKey(rootKeyRaw);
      this.crypto.password = '';
      rootKeyRaw.fill(0);

      const signingKey = await deriveSigningKey(this.rootKey);
      await verifyManifest(signingKey, manifest);
      return;
    }
  }

  async updateMasterPassword(oldPassword: string, newPassword: string) {
    const salt = crypto.getRandomValues(new Uint8Array(32));
    const masterKey = await deriveMasterKey(newPassword, salt);

    const lastManifest = this.manifestManager.getLastManifest();
    if (!lastManifest.crypto) {
      throw new Error('Attempting to open unencrypted database');
    }

    const oldSalt = Uint8Array.fromBase64(lastManifest.crypto.masterKeySalt);
    const oldMasterKey = await deriveMasterKey(oldPassword, oldSalt);

    return async (manifest: Manifest) => {
      if (!manifest.crypto || !this.rootKey) {
        throw new Error('Attempting to open unencrypted database');
      }

      const rootKeyRaw = await decrypt(
        oldMasterKey,
        Uint8Array.fromBase64(manifest.crypto.masterKey)
      );

      const rootKeyEncrypted = await encrypt(masterKey, rootKeyRaw);
      rootKeyRaw.fill(0);

      const signingKey = await deriveSigningKey(this.rootKey);
      const newManifest = await signManifest(signingKey, {
        ...manifest,
        crypto: {
          masterKey: rootKeyEncrypted.toBase64(),
          masterKeySalt: salt.toBase64(),
          deviceKey: {},
          nonce: crypto.randomUUID(),
          timestamp: Date.now(),
          signature: '',
        },
      });

      return { manifest: newManifest, commit: () => {} };
    };
  }

  async updateQuickUnlockPassword(masterPassword: string, quickUnlockPassword: string) {
    const lastManifest = this.manifestManager.getLastManifest();
    if (!lastManifest.crypto) {
      throw new Error('Attempting to open unencrypted database');
    }

    const salt = Uint8Array.fromBase64(lastManifest.crypto.masterKeySalt);
    const masterKey = await deriveMasterKey(masterPassword, salt);

    return async (manifest: Manifest) => {
      if (!manifest.crypto || !this.rootKey) {
        throw new Error('Attempting to open unencrypted database');
      }

      const deviceKeyStore = await CryptoManager.getStoredDeviceKey(this.cacheManager);

      const deviceId = deviceKeyStore?.deviceId ?? crypto.randomUUID();
      const deviceKeyRaw = crypto.getRandomValues(new Uint8Array(32));
      const deviceKey = await importDeviceKey(deviceKeyRaw);
      deviceKeyRaw.fill(0);

      const newDeviceKeyStore = { deviceId, key: deviceKey };
      const quickUnlockKey = await deriveQuickUnlockKey(quickUnlockPassword, newDeviceKeyStore);

      const rootKeyRaw = await decrypt(masterKey, Uint8Array.fromBase64(manifest.crypto.masterKey));
      const rootKeyEncrypted = await encrypt(quickUnlockKey, rootKeyRaw);
      rootKeyRaw.fill(0);

      const deviceName = await getFriendlyDeviceName();
      const lastUsedAt = Date.now();

      const signingKey = await deriveSigningKey(this.rootKey);
      const newManifest = await signManifest(signingKey, {
        ...manifest,
        crypto: {
          ...manifest.crypto,
          deviceKey: {
            ...manifest.crypto.deviceKey,
            [deviceId]: {
              key: rootKeyEncrypted.toBase64(),
              deviceName,
              lastUsedAt,
            },
          },
          nonce: crypto.randomUUID(),
          timestamp: Date.now(),
          signature: '',
        },
      });

      return {
        manifest: newManifest,
        commit: () =>
          this.cacheManager.writeIndexedDB(CACHE_DEVICE_KEY_STORE_KEY, newDeviceKeyStore),
      };
    };
  }

  async touchCurrentDeviceKey() {
    if (!this.rootKey) {
      return null;
    }

    const deviceKeyStore = await CryptoManager.getStoredDeviceKey(this.cacheManager);
    if (!deviceKeyStore) {
      return null;
    }

    const manifest = this.manifestManager.getLastManifest();
    if (!manifest.crypto) {
      return null;
    }

    const deviceName = await getFriendlyDeviceName();
    const lastUsedAt = Date.now();

    const currentDeviceKeyInfo = manifest.crypto.deviceKey[deviceKeyStore.deviceId];
    if (!currentDeviceKeyInfo) {
      return null;
    }

    const device = {
      ...currentDeviceKeyInfo,
      deviceName,
      lastUsedAt,
    };

    return (manifest: Manifest) => {
      if (!manifest.crypto) {
        return manifest;
      }

      const newCrypto = {
        ...manifest.crypto,
        deviceKey: {
          ...manifest.crypto.deviceKey,
          [deviceKeyStore.deviceId]: device,
        },
      };

      return {
        ...manifest,
        crypto: newCrypto,
      };
    };
  }

  async encryptShardPart(shardHash: string) {
    if (!this.rootKey) {
      return (part: Uint8Array) => part;
    }

    const shardKey = await deriveShardKey(this.rootKey, shardHash);
    return (part: Uint8Array) => encrypt(shardKey, part);
  }

  async decryptShardPart(shardHash: string) {
    if (!this.rootKey) {
      return (part: Uint8Array) => part;
    }

    const shardKey = await deriveShardKey(this.rootKey, shardHash);
    return (part: Uint8Array) => decrypt(shardKey, part);
  }

  isEncryptionEnabled(): boolean {
    return !!this.rootKey;
  }

  async encryptBlobChunk(digest: string) {
    if (!this.rootKey) {
      return (chunk: Uint8Array) => chunk;
    }

    const blobKey = await deriveBlobKey(this.rootKey, digest);
    return (chunk: Uint8Array) => encrypt(blobKey, chunk);
  }

  async decryptBlobChunk(digest: string) {
    if (!this.rootKey) {
      return (chunk: Uint8Array) => chunk;
    }

    const blobKey = await deriveBlobKey(this.rootKey, digest);
    return (chunk: Uint8Array) => decrypt(blobKey, chunk);
  }

  getBlobChunkSize(originalSize: number): number {
    if (!this.rootKey) {
      return originalSize;
    }

    return originalSize + CRYPTO_ENCRYPTION_IV_SIZE + CRYPTO_ENCRYPTION_AUTH_TAG_SIZE;
  }

  getShardPartSize(originalSize: number): number {
    if (!this.rootKey) {
      return originalSize;
    }

    return originalSize + CRYPTO_ENCRYPTION_IV_SIZE + CRYPTO_ENCRYPTION_AUTH_TAG_SIZE;
  }
}
