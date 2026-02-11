import {
  DEFAULT_SYNC_INTERVAL,
  DEFAULT_COMPACTION_THRESHOLD,
  DEFAULT_DESIRED_SHARD_SIZE,
  DEFAULT_VACUUM_THRESHOLD,
  DEFAULT_CACHE_STORAGE_KEY,
} from '@/constants';
import { EventEmitter } from '@/utils/event-emitter';
import { CompactionEngine } from './engines/compaction-engine';
import { GarbageCollectorEngine } from './engines/garbage-collector-engine';
import { SyncEngine } from './engines/sync-engine';
import { ManifestManager } from './managers/manifest-manager';
import { ShardManager } from './managers/shard-manager';
import type {
  StorageBackend,
  ClxDBOptions,
  SyncState,
  ClxDBEvents,
  ClxDBClientOptions,
  DatabaseBackend,
} from '@/types';

export class ClxDB extends EventEmitter<ClxDBEvents> {
  private database: DatabaseBackend;
  private storage: StorageBackend;
  private options: ClxDBOptions;
  private manifestManager: ManifestManager;
  private shardManager: ShardManager;
  private compactionEngine: CompactionEngine;
  private garbageCollectorEngine: GarbageCollectorEngine;
  private syncEngine: SyncEngine;
  private vacuumEngine: VacuumEngine;

  constructor(options: ClxDBClientOptions) {
    super();
    this.database = options.database;
    this.storage = options.storage;
    this.options = this.normalizeOptions(options);
    this.manifestManager = new ManifestManager(this.storage);
    this.shardManager = new ShardManager(this.storage, this.options);

    const ctx = {
      storage: this.storage,
      database: this.database,
      manifestManager: this.manifestManager,
      shardManager: this.shardManager,
      options: this.options,
    };

    this.compactionEngine = new CompactionEngine(ctx);
    this.garbageCollectorEngine = new GarbageCollectorEngine(ctx);
    this.syncEngine = new SyncEngine(ctx);
    this.syncEngine.bind(this);
    this.vacuumEngine = new VacuumEngine(ctx);
  }

  private normalizeOptions(options: ClxDBClientOptions): ClxDBOptions {
    return {
      ...options,
      syncInterval: options.syncInterval ?? DEFAULT_SYNC_INTERVAL,
      compactionThreshold: options.compactionThreshold ?? DEFAULT_COMPACTION_THRESHOLD,
      desiredShardSize: options.desiredShardSize ?? DEFAULT_DESIRED_SHARD_SIZE,
      gcOnStart: options.gcOnStart ?? true,
      vacuumThreshold: options.vacuumThreshold ?? DEFAULT_VACUUM_THRESHOLD,
      cacheStorageKey: options.cacheStorageKey ?? DEFAULT_CACHE_STORAGE_KEY,
    };
  }

  async init(): Promise<void> {
    this.shardManager.initialize();
    await this.manifestManager.initialize();

    this.syncEngine.initialize();
    void this.syncEngine.sync();

    if (this.options.gcOnStart) {
      void this.garbageCollectorEngine.run();
    }

    if (this.options.vacuumOnStart) {
      void this.vacuumEngine.run();
    }
  }

  start(): void {
    this.syncEngine.start();
  }

  stop(): void {
    this.syncEngine.stop();
  }

  getState(): SyncState {
    return this.syncEngine.getState();
  }

  triggerSync(): Promise<void> {
    return this.syncEngine.sync();
  }

  async forceCompaction(): Promise<void> {
    this.emit('compactionStart');

    // FIXME rethink of compaction logic.
    //   * the entire compaction should be re-tried when CAS has been failed.
    //   * 10 or more 0-level shard -> compaction
    //   * 20 or more 1-level shard -> compaction
    //   * compaction result is 1-level shard + 0 or more 2-level shard
    //   * the data should be fetched from RxDB
    try {
      const manifestResult = await this.manifestManager.read();
      if (!manifestResult) {
        this.emit('compactionComplete');
        return;
      }

      const { manifest } = manifestResult;
      const level0Shards = manifest.shardFiles.filter(s => s.level === 0);

      const compactionResult = await this.compactionEngine.compact(level0Shards);
      if (compactionResult) {
        await this.manifestManager.updateManifest(
          compactionResult.newShards,
          compactionResult.removedShards,
          () => this.pull()
        );
        void this.garbageCollector.run();
      }

      this.emit('compactionComplete');
    } catch (error) {
      this.emit('syncError', error as Error);
      throw error;
    }
  }
}
