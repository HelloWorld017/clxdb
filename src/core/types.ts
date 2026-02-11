import type { ClxDB } from './clxdb';
import type { ManifestManager } from './managers/manifest-manager';
import type { ShardManager } from './managers/shard-manager';
import type {
  ClxDBOptions,
  DatabaseBackend,
  Manifest,
  ShardDocument,
  StorageBackend,
} from '@/types';

export interface UpdateDescriptor {
  addedShardList?: ShardDocument[][];
  removedShardFilenameList?: string[];
  updatedFields?: Omit<Manifest, 'version' | 'lastSequence' | 'shardFiles'>;
}

export interface EngineContext {
  storage: StorageBackend;
  database: DatabaseBackend;
  manifestManager: ManifestManager;
  shardManager: ShardManager;
  options: ClxDBOptions;
  update: ClxDB['update'];
}
