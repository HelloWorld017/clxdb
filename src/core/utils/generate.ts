import { MANIFEST_PATH, PROTOCOL_VERSION } from '@/constants';
import { ClxDB } from '../clxdb';
import { CryptoManager } from '../managers/crypto-manager';
import { normalizeOptions } from './options';
import type { ClxDBCrypto, ClxDBClientOptions, StorageBackend, DatabaseBackend } from '@/types';

export const generateNewClxDB = async (
  createDatabase: (uuid: string) => Promise<DatabaseBackend>,
  storage: StorageBackend,
  crypto: ClxDBCrypto,
  clientOptions: ClxDBClientOptions
) => {
  const options = normalizeOptions(clientOptions);
  const manifest = {
    version: PROTOCOL_VERSION,
    uuid: window.crypto.randomUUID(),
    lastSequence: 0,
    shardFiles: [],
  };

  const cryptoManager = new CryptoManager(crypto, options);
  const initialized = await cryptoManager.signInitialManifest(manifest);
  if (initialized.crypto) {
    await storage.write(MANIFEST_PATH, new TextEncoder().encode(JSON.stringify(manifest, null, 2)));
  }

  return new ClxDB({
    database: await createDatabase(manifest.uuid),
    storage,
    crypto,
    options,
  });
};
