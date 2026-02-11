import { EventEmitter } from '@/utils/event-emitter';
import { createPromisePool } from '@/utils/promise-pool';
import { mergeAliveShardDocuments } from '../utils/engine-utils';
import type { ManifestManager } from '../managers/manifest-manager';
import type { ShardManager } from '../managers/shard-manager';
import type { EngineContext } from '../types';
import type { ClxDBEvents, ClxDBOptions, DatabaseBackend, Manifest, ShardFileInfo } from '@/types';

export class VacuumEngine extends EventEmitter<ClxDBEvents> {
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

  private selectShardsForVacuum(shardFiles: ShardFileInfo[]): ShardFileInfo[] {
    const staleShards = shardFiles.filter(shard => shard.level >= this.options.maxShardLevel);
    if (staleShards.length < this.options.vacuumCount) {
      return staleShards;
    }

    for (let i = 0; i < this.options.vacuumCount; i++) {
      const target = Math.floor(Math.random() * (staleShards.length - i)) + i;
      [staleShards[i], staleShards[target]] = [staleShards[target], staleShards[i]];
    }

    return staleShards.slice(0, this.options.vacuumCount);
  }

  shouldVacuum(): boolean {
    const { shardFiles } = this.manifestManager.getLastManifest();
    return shardFiles.filter(shard => shard.level >= this.options.maxShardLevel).length > 0;
  }

  async vacuum(): Promise<void> {
    if (!this.shouldVacuum()) {
      return;
    }

    this.emit('vacuumStart');

    try {
      const { manifest } = (await this.manifestManager.read())!;
      await this.performVacuum(manifest);
      this.emit('vacuumComplete');
    } catch (error) {
      this.emit('vacuumError', error as Error);
      throw error;
    }
  }

  private async performVacuum(manifest: Manifest): Promise<void> {
    const shardsToVacuum = this.selectShardsForVacuum(manifest.shardFiles);
    if (shardsToVacuum.length === 0) {
      return;
    }

    const vacuumResult = await createPromisePool(
      shardsToVacuum.values().map(async shard => ({
        shard,
        original: await this.shardManager.fetchHeader(shard),
        vacuumed: await mergeAliveShardDocuments(
          { database: this.database, shardManager: this.shardManager },
          [shard]
        ),
      }))
    );

    const vacuumResultToCommit = vacuumResult.filter(({ original, vacuumed }) => {
      const originalLength = original.docs.reduce((sum, doc) => sum + doc.len, 0);
      const vacuumedLength = vacuumed.reduce((sum, doc) => sum + doc.len, 0);
      return vacuumedLength >= originalLength * (1 - this.options.vacuumThreshold);
    });

    await this.update(latestManifest => {
      const existingShardFilenames = new Set(
        latestManifest.shardFiles.map(shard => shard.filename)
      );

      const availableResult = vacuumResultToCommit.filter(({ shard }) =>
        existingShardFilenames.has(shard.filename)
      );

      return {
        addedShardList: availableResult.map(({ vacuumed }) => vacuumed),
        removedShardFilenameList: availableResult.map(({ shard }) => shard.filename),
      };
    });
  }
}
