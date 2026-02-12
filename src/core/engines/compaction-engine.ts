import { EventEmitter } from '@/utils/event-emitter';
import { createPromisePool } from '@/utils/promise-pool';
import { mergeAliveShardDocuments } from '../utils/engine-utils';
import type { ManifestManager } from '../managers/manifest-manager';
import type { ShardManager } from '../managers/shard-manager';
import type { EngineContext } from '../types';
import type { ClxDBEvents, ClxDBOptions, DatabaseBackend, ShardFileInfo } from '@/types';

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

    if ((await this.database.readPendingIds()).length) {
      return;
    }

    this.emit('compactionStart');

    try {
      await this.performCompaction();
      this.emit('compactionComplete');
    } catch (error) {
      this.emit('compactionError', error as Error);
      throw error;
    }
  }

  private async performCompaction(): Promise<void> {
    const { manifest } = (await this.manifestManager.read())!;
    const shardsSetToCompact = this.selectShardsSetForCompaction(manifest.shardFiles);
    if (shardsSetToCompact.length === 0) {
      return;
    }

    const mergedDocs = await createPromisePool(
      shardsSetToCompact.values().map(async shardsSet => ({
        shards: shardsSet,
        documents: await mergeAliveShardDocuments(
          { database: this.database, shardManager: this.shardManager },
          shardsSet
        ),
      }))
    );

    await this.update(manifest => {
      const existingShardFilenames = new Set(manifest.shardFiles.map(shard => shard.filename));
      const availableResult = mergedDocs.filter(({ shards }) =>
        shards.every(shard => existingShardFilenames.has(shard.filename))
      );

      return {
        addedShardList: availableResult.map(result => result.documents),
        removedShardFilenameList: availableResult.flatMap(({ shards }) =>
          shards.map(shard => shard.filename)
        ),
      };
    });
  }
}
