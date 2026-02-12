import type { ManifestManager } from './manifest-manager';
import type { Manifest, ClxDBCrypto } from '@/types';

const AES_ALGORITHM = 'AES-GCM';
const HASH_ALGORITHM = 'SHA-256';
const PBKDF2_ITERATIONS = 1_500_000;
const IV_SIZE = 12;

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

const deriveMasterKey = async (password: string) => {
  const salt = crypto.getRandomValues(new Uint8Array(32));
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

const deriveQuickUnlockKey = async (password: string) => {};

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

const verifyManifest = async (signingKey: CryptoKey, manifest: Manifest) =>
  crypto.subtle.verify(
    'HMAC',
    signingKey,
    Uint8Array.fromBase64(manifest.crypto!.signature),
    getManifestForSign(manifest)
  );

export class CryptoManager {
  private crypto: ClxDBCrypto;
  private rootKey: CryptoKey | null | undefined = undefined;

  constructor(crypto: ClxDBCrypto) {
    this.crypto = crypto;
  }

  async initializeManifest(manifest: Manifest): Promise<Manifest> {
    if (this.crypto.kind === 'none') {
      this.rootKey = null;
      return manifest;
    }

    if (this.crypto.kind === 'master') {
      throw new Error('Master password is needed to create a new manifest');
    }

    const masterKey = await deriveMasterKey(this.crypto.password);
    const rootKeyRaw = crypto.getRandomValues(new Uint8Array(32));
    const rootKeyEncrypted = await encrypt(masterKey, rootKeyRaw);
    this.rootKey = await importRootKey(rootKeyRaw);
    this.crypto.password = '';
    rootKeyRaw.fill(0);

    const signingKey = await deriveSigningKey(this.rootKey);
    const newManifest = await signManifest(signingKey, {
      ...manifest,
      crypto: {
        masterKey: rootKeyEncrypted.toBase64(),
        deviceKey: {},
        nonce: crypto.randomUUID(),
        timestamp: Date.now(),
        signature: '',
      },
    });

    return newManifest;
  }

  async openManifest(manifestManager: ManifestManager) {
    const manifest = manifestManager.getLastManifest();

    if (this.crypto.kind === 'none') {
      this.rootKey = null;
      return;
    }

    if (!manifest.crypto) {
      throw new Error('Attempting to open unencrypted database');
    }

    if (this.crypto.kind === 'master') {
      const masterKey = await deriveMasterKey(this.crypto.password);
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
      const masterKey = await deriveMasterKey(this.crypto.password);
      const rootKeyEncrypted = Uint8Array.fromBase64(manifest.crypto.masterKey);
      const rootKeyRaw = await decrypt(masterKey, rootKeyEncrypted);
      this.rootKey = await importRootKey(rootKeyRaw);
      this.crypto.password = '';
      rootKeyRaw.fill(0);

      const signingKey = await deriveSigningKey(this.rootKey);
      await verifyManifest(signingKey, manifest);
      return;
    }
  }
}
