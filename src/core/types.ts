import type { ClxDB } from './clxdb';
import type { ManifestManager, ManifestUpdateDescriptor } from './managers/manifest-manager';
import type { ShardManager } from './managers/shard-manager';
import type { ClxDBOptions, DatabaseBackend, ShardDocument, StorageBackend } from '@/types';

export interface UpdateDescriptor extends Pick<
  ManifestUpdateDescriptor,
  'removedShardFilenameList' | 'updatedFields'
> {
  addedShardList?: ShardDocument[][];
}

export interface EngineContext {
  storage: StorageBackend;
  database: DatabaseBackend;
  manifestManager: ManifestManager;
  shardManager: ShardManager;
  options: ClxDBOptions;
  update: ClxDB['update'];
}
