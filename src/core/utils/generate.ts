import { BLOBS_DIR, MANIFEST_PATH, PROTOCOL_VERSION, SHARDS_DIR } from '@/constants';
import { ClxDB } from '../clxdb';
import { CacheManager } from '../managers/cache-manager';
import { CryptoManager } from '../managers/crypto-manager';
import { ManifestManager } from '../managers/manifest-manager';
import { normalizeOptions } from './options';
import type { ClxDBParams } from '@/types';

export const generateNewClxDB = async ({
  database,
  storage,
  crypto,
  options: clientOptions,
}: ClxDBParams) => {
  const options = normalizeOptions(clientOptions);
  const manifest = {
    version: PROTOCOL_VERSION,
    uuid: window.crypto.randomUUID(),
    lastSequence: 0,
    shardFiles: [],
  };

  const manifestManager = new ManifestManager(storage);
  const cacheManager = new CacheManager(options);
  await cacheManager.initialize(manifest.uuid);

  const cryptoManager = new CryptoManager(crypto, manifestManager, cacheManager);
  const initializedManifest = await cryptoManager.signInitialManifest(manifest);
  await storage.ensureDirectory?.(SHARDS_DIR);
  await storage.ensureDirectory?.(BLOBS_DIR);
  await storage.write(
    MANIFEST_PATH,
    new TextEncoder().encode(JSON.stringify(initializedManifest, null, 2))
  );

  return new ClxDB({
    database,
    storage,
    crypto,
    options,
  });
};
