import { mergeToLatestDocument } from './document-merge';
import type { ClxDBClientOptions, ClxDBOptions } from '@/types';

export const normalizeOptions = (options: ClxDBClientOptions = {}): ClxDBOptions => ({
  syncInterval: options.syncInterval ?? 60 * 1000,
  compactionThreshold: options.compactionThreshold ?? 4,
  desiredShardSize: options.desiredShardSize ?? 5 * 1024 * 1024,
  maxShardLevel: options.maxShardLevel ?? 6,
  gcOnStart: options.gcOnStart ?? true,
  gcGracePeriod: options.gcGracePeriod ?? 60 * 60 * 1000,
  vacuumOnStart: options.vacuumOnStart ?? true,
  vacuumThreshold: options.vacuumThreshold ?? 0.15,
  vacuumCount: options.vacuumCount ?? 3,
  cacheStorageKey: options.cacheStorageKey ?? 'clxdb_cache',
  databasePersistent: options.databasePersistent ?? true,
  mergeRule: options.mergeRule ?? mergeToLatestDocument,
});
