import {
  DEFAULT_CACHE_STORAGE_KEY,
  DEFAULT_COMPACTION_THRESHOLD,
  DEFAULT_DESIRED_SHARD_SIZE,
  DEFAULT_GC_GRACE_PERIOD,
  DEFAULT_MAX_SHARD_LEVEL,
  DEFAULT_SYNC_INTERVAL,
  DEFAULT_VACUUM_COUNT,
  DEFAULT_VACUUM_THRESHOLD,
} from '@/constants';
import type { ClxDBClientOptions, ClxDBOptions } from '@/types';

export const normalizeOptions = (options: ClxDBClientOptions = {}): ClxDBOptions => ({
  syncInterval: options.syncInterval ?? DEFAULT_SYNC_INTERVAL,
  compactionThreshold: options.compactionThreshold ?? DEFAULT_COMPACTION_THRESHOLD,
  desiredShardSize: options.desiredShardSize ?? DEFAULT_DESIRED_SHARD_SIZE,
  maxShardLevel: options.maxShardLevel ?? DEFAULT_MAX_SHARD_LEVEL,
  gcOnStart: options.gcOnStart ?? true,
  gcGracePeriod: options.gcGracePeriod ?? DEFAULT_GC_GRACE_PERIOD,
  vacuumOnStart: options.vacuumOnStart ?? true,
  vacuumThreshold: options.vacuumThreshold ?? DEFAULT_VACUUM_THRESHOLD,
  vacuumCount: options.vacuumCount ?? DEFAULT_VACUUM_COUNT,
  cacheStorageKey:
    options.cacheStorageKey !== undefined ? options.cacheStorageKey : DEFAULT_CACHE_STORAGE_KEY,
});

export const resolveCacheStorageKey = (
  cacheStorageKey: string | null,
  uuid: string
): string | null => {
  if (!cacheStorageKey) {
    return null;
  }

  if (cacheStorageKey === DEFAULT_CACHE_STORAGE_KEY) {
    return `${cacheStorageKey}_${uuid}`;
  }

  return cacheStorageKey;
};
