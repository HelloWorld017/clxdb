import { EventEmitter } from '@/utils/event-emitter';
import { createPromisePool } from '@/utils/promise-pool';
import { mergeAliveShardDocuments } from '../utils/engine-utils';
import type { ManifestManager } from '../managers/manifest-manager';
import type { ShardManager } from '../managers/shard-manager';
import type { EngineContext, UpdateDescriptor } from '../types';
import type { ClxDBEvents, ClxDBOptions, DatabaseBackend, Manifest, ShardFileInfo } from '@/types';

export class CompactionEngine extends EventEmitter<ClxDBEvents> {
  private database: DatabaseBackend;
  private shardManager: ShardManager;
  private manifestManager: ManifestManager;
  private options: ClxDBOptions;
  private update: EngineContext['update'];

  constructor({ database, shardManager, manifestManager, options, update }: EngineContext) {
    super();
    this.database = database;
    this.shardManager = shardManager;
    this.manifestManager = manifestManager;
    this.options = options;
    this.update = update;
  }

  private selectShardsSetForCompaction(shardFiles: ShardFileInfo[]): ShardFileInfo[][] {
    // Intentionally omit maxShardLevel, as they are not targets for compaction
    const shardsPerLevel = new Map<number, ShardFileInfo[]>(
      Array.from({ length: this.options.maxShardLevel }).map((_, level) => [level, []])
    );

    shardFiles.forEach(shardFile => {
      shardsPerLevel.get(shardFile.level)?.push(shardFile);
    });

    const compactables = Array.from(shardsPerLevel.values())
      .filter(shards => shards.length >= this.options.compactionThreshold)
      .map(compactable => compactable.sort((a, b) => a.range.min - b.range.min));

    return compactables;
  }

  shouldCompact(): boolean {
    const manifest = this.manifestManager.getLastManifest();
    return this.selectShardsSetForCompaction(manifest.shardFiles).length > 0;
  }

  async compact(): Promise<void> {
    if (!this.shouldCompact()) {
      return;
    }

    this.emit('compactionStart');

    try {
      await this.update((manifest: Manifest) => this.performCompaction(manifest));
      this.emit('compactionComplete');
    } catch (error) {
      this.emit('compactionError', error as Error);
      throw error;
    }
  }

  private async performCompaction(manifest: Manifest): Promise<UpdateDescriptor> {
    const shardsSetToCompact = this.selectShardsSetForCompaction(manifest.shardFiles);
    if (shardsSetToCompact.length === 0) {
      return {};
    }

    const mergedDocs = await createPromisePool(
      shardsSetToCompact
        .values()
        .map(shardsSet =>
          mergeAliveShardDocuments(
            { database: this.database, shardManager: this.shardManager },
            shardsSet
          )
        )
    );

    return {
      addedShardList: mergedDocs,
      removedShardFilenameList: shardsSetToCompact.flatMap(shardSet =>
        shardSet.map(shard => shard.filename)
      ),
    };
  }
}
