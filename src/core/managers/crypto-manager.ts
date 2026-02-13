import { deviceKeyStoreSchema } from '@/schemas';
import { readIndexedDB, writeIndexedDB } from '@/utils/indexeddb';
import type { ManifestManager } from './manifest-manager';
import type { Manifest, ClxDBCrypto, ClxDBOptions, DeviceKeyStore } from '@/types';

const AES_ALGORITHM = 'AES-GCM';
const HASH_ALGORITHM = 'SHA-256';
const PBKDF2_ITERATIONS = 1_500_000;
const IV_SIZE = 12;
const AUTH_TAG_SIZE = 16;
const DEVICE_KEY_STORE_KEY = 'device_key';

const encrypt = async (key: CryptoKey, plaintext: Uint8Array<ArrayBuffer>) => {
  const iv = crypto.getRandomValues(new Uint8Array(IV_SIZE));
  const ciphertext = await crypto.subtle.encrypt({ name: AES_ALGORITHM, iv }, key, plaintext);

  const output = new Uint8Array(iv.length + ciphertext.byteLength);
  output.set(iv, 0);
  output.set(new Uint8Array(ciphertext), iv.length);

  return output;
};

const decrypt = async (key: CryptoKey, input: Uint8Array) => {
  const iv = input.slice(0, IV_SIZE);
  const ciphertext = input.slice(IV_SIZE);
  const plaintext = await crypto.subtle.decrypt({ name: AES_ALGORITHM, iv }, key, ciphertext);

  return new Uint8Array(plaintext);
};

const importRootKey = (plaintext: Uint8Array<ArrayBuffer>) =>
  crypto.subtle.importKey('raw', plaintext, 'HKDF', false, ['deriveKey']);

const importDeviceKey = (plaintext: Uint8Array<ArrayBuffer>) =>
  crypto.subtle.importKey('raw', plaintext, 'HKDF', false, ['deriveKey']);

const deriveMasterKey = async (password: string, salt: Uint8Array<ArrayBuffer>) => {
  const encoder = new TextEncoder();
  const masterPassword = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const masterKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: HASH_ALGORITHM,
    },
    masterPassword,
    { name: AES_ALGORITHM, length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  return masterKey;
};

const deriveQuickUnlockKey = async (password: string, deviceKeyStore: DeviceKeyStore) => {
  const encoder = new TextEncoder();
  const quickUnlockKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      salt: new Uint8Array(0),
      info: encoder.encode(`encryption:quick_unlock/${password}`),
      hash: HASH_ALGORITHM,
    },
    deviceKeyStore.key,
    { name: AES_ALGORITHM, length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  return quickUnlockKey;
};

const deriveShardKey = async (rootKey: CryptoKey, shardHash: string) => {
  const encoder = new TextEncoder();
  const shardKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      salt: new Uint8Array(0),
      info: encoder.encode(`encryption:shard/${shardHash}`),
      hash: HASH_ALGORITHM,
    },
    rootKey,
    { name: AES_ALGORITHM, length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  return shardKey;
};

const deriveSigningKey = async (rootKey: CryptoKey) => {
  const encoder = new TextEncoder();
  const signingKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      salt: new Uint8Array(0),
      info: encoder.encode('sign:manifest'),
      hash: HASH_ALGORITHM,
    },
    rootKey,
    { name: 'HMAC', hash: HASH_ALGORITHM, length: 256 },
    false,
    ['sign', 'verify']
  );

  return signingKey;
};

const getManifestForSign = (manifest: Manifest): Uint8Array<ArrayBuffer> => {
  const encoder = new TextEncoder();
  const manifestForSign = JSON.stringify({
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
        await crypto.subtle.sign('HMAC', signingKey, getManifestForSign(manifest))
      ).toBase64(),
    },
  }) satisfies Manifest;

const verifyManifest = async (signingKey: CryptoKey, manifest: Manifest) => {
  const result = await crypto.subtle.verify(
    'HMAC',
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
  private options: ClxDBOptions;
  private rootKey: CryptoKey | null | undefined = undefined;

  constructor(crypto: ClxDBCrypto, options: ClxDBOptions) {
    this.crypto = crypto;
    this.options = options;
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

  async initializeManifest(manifest: Manifest): Promise<Manifest> {
    if (this.crypto.kind === 'none') {
      this.rootKey = null;
      return manifest;
    }

    const salt = crypto.getRandomValues(new Uint8Array(32));
    const masterKey = await deriveMasterKey(this.crypto.password, salt);
    const rootKeyRaw = crypto.getRandomValues(new Uint8Array(32));
    const rootKeyEncryptedByMaster = await encrypt(masterKey, rootKeyRaw);

    let deviceKeyRegistry: Record<string, string> = {};
    if (this.crypto.kind === 'quick-unlock') {
      const deviceId = crypto.randomUUID();
      const deviceKeyRaw = crypto.getRandomValues(new Uint8Array(32));
      const deviceKey = await importDeviceKey(deviceKeyRaw);
      deviceKeyRaw.fill(0);

      const deviceKeyStore = { deviceId, key: deviceKey };
      const quickUnlockKey = await deriveQuickUnlockKey(this.crypto.password, deviceKeyStore);
      const rootKeyEncryptedByQuickUnlock = await encrypt(quickUnlockKey, rootKeyRaw);
      await writeIndexedDB(DEVICE_KEY_STORE_KEY, this.options, deviceKeyStore);

      deviceKeyRegistry = {
        [deviceId]: rootKeyEncryptedByQuickUnlock.toBase64(),
      };
    }

    this.rootKey = await importRootKey(rootKeyRaw);
    this.crypto.password = '';
    rootKeyRaw.fill(0);

    const signingKey = await deriveSigningKey(this.rootKey);
    const newManifest = await signManifest(signingKey, {
      ...manifest,
      crypto: {
        masterKey: rootKeyEncryptedByMaster.toBase64(),
        masterKeySalt: salt.toBase64(),
        deviceKey: deviceKeyRegistry,
        nonce: crypto.randomUUID(),
        timestamp: Date.now(),
        signature: '',
      },
    });

    return newManifest;
  }

  async openManifest(manifestManager: ManifestManager) {
    const manifest = manifestManager.getLastManifest();

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
      const deviceKeyStore = await readIndexedDB(
        DEVICE_KEY_STORE_KEY,
        this.options,
        deviceKeyStoreSchema
      );

      const deviceKeyRegistry = manifest.crypto.deviceKey;
      if (!deviceKeyStore || !deviceKeyRegistry[deviceKeyStore.deviceId]) {
        throw new Error('No deviceKey exist');
      }

      const rootKeyEncrypted = Uint8Array.fromBase64(deviceKeyRegistry[deviceKeyStore.deviceId]);
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

  async updateMasterPassword(
    manifestManager: ManifestManager,
    oldPassword: string,
    newPassword: string
  ) {
    const salt = crypto.getRandomValues(new Uint8Array(32));
    const masterKey = await deriveMasterKey(newPassword, salt);

    const lastManifest = manifestManager.getLastManifest();
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

  async updateQuickUnlockPassword(
    manifestManager: ManifestManager,
    masterPassword: string,
    quickUnlockPassword: string
  ) {
    const lastManifest = manifestManager.getLastManifest();
    if (!lastManifest.crypto) {
      throw new Error('Attempting to open unencrypted database');
    }

    const salt = Uint8Array.fromBase64(lastManifest.crypto.masterKeySalt);
    const masterKey = await deriveMasterKey(masterPassword, salt);

    return async (manifest: Manifest) => {
      if (!manifest.crypto || !this.rootKey) {
        throw new Error('Attempting to open unencrypted database');
      }

      const deviceKeyStore = await readIndexedDB(
        DEVICE_KEY_STORE_KEY,
        this.options,
        deviceKeyStoreSchema
      );

      const deviceId = deviceKeyStore?.deviceId ?? crypto.randomUUID();
      const deviceKeyRaw = crypto.getRandomValues(new Uint8Array(32));
      const deviceKey = await importDeviceKey(deviceKeyRaw);
      deviceKeyRaw.fill(0);

      const newDeviceKeyStore = { deviceId, key: deviceKey };
      const quickUnlockKey = await deriveQuickUnlockKey(quickUnlockPassword, newDeviceKeyStore);

      const rootKeyRaw = await decrypt(masterKey, Uint8Array.fromBase64(manifest.crypto.masterKey));
      const rootKeyEncrypted = await encrypt(quickUnlockKey, rootKeyRaw);
      rootKeyRaw.fill(0);

      const signingKey = await deriveSigningKey(this.rootKey);
      const newManifest = await signManifest(signingKey, {
        ...manifest,
        crypto: {
          ...manifest.crypto,
          deviceKey: {
            ...manifest.crypto.deviceKey,
            [deviceId]: rootKeyEncrypted.toBase64(),
          },
          nonce: crypto.randomUUID(),
          timestamp: Date.now(),
          signature: '',
        },
      });

      return {
        manifest: newManifest,
        commit: () => writeIndexedDB(DEVICE_KEY_STORE_KEY, this.options, newDeviceKeyStore),
      };
    };
  }

  async encryptShardPart(shardHash: string) {
    if (!this.rootKey) {
      return (part: Uint8Array<ArrayBuffer>) => part;
    }

    const shardKey = await deriveShardKey(this.rootKey, shardHash);
    return (part: Uint8Array<ArrayBuffer>) => encrypt(shardKey, part);
  }

  async decryptShardPart(shardHash: string) {
    if (!this.rootKey) {
      return (part: Uint8Array<ArrayBuffer>) => part;
    }

    const shardKey = await deriveShardKey(this.rootKey, shardHash);
    return (part: Uint8Array<ArrayBuffer>) => decrypt(shardKey, part);
  }

  getShardPartSize(originalSize: number): number {
    if (!this.rootKey) {
      return originalSize;
    }

    return originalSize + IV_SIZE + AUTH_TAG_SIZE;
  }
}
