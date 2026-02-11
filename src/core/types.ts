import type { ManifestManager } from './managers/manifest-manager';
import type { ShardManager } from './managers/shard-manager';
import type { ClxDBOptions, DatabaseBackend, StorageBackend } from '@/types';

export interface EngineContext {
  storage: StorageBackend;
  database: DatabaseBackend;
  manifestManager: ManifestManager;
  shardManager: ShardManager;
  options: ClxDBOptions;
}
