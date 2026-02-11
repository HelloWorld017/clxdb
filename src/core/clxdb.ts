import {
  DEFAULT_SYNC_INTERVAL,
  DEFAULT_COMPACTION_THRESHOLD,
  DEFAULT_DESIRED_SHARD_SIZE,
  DEFAULT_VACUUM_THRESHOLD,
  DEFAULT_CACHE_STORAGE_KEY,
  DEFAULT_MAX_SHARD_LEVEL,
  DEFAULT_VACUUM_COUNT,
} from '@/constants';
import { EventEmitter } from '@/utils/event-emitter';
import { writeLocalStorage } from '@/utils/local-storage';
import { createPromisePool } from '@/utils/promise-pool';
import { CompactionEngine } from './engines/compaction-engine';
import { GarbageCollectorEngine } from './engines/garbage-collector-engine';
import { SyncEngine } from './engines/sync-engine';
import { VacuumEngine } from './engines/vacuum-engine';
import { ManifestManager } from './managers/manifest-manager';
import { ShardManager } from './managers/shard-manager';
import type { UpdateDescriptor } from './types';
import type {
  StorageBackend,
  ClxDBOptions,
  SyncState,
  ClxDBEvents,
  ClxDBClientOptions,
  DatabaseBackend,
  Manifest,
  PossiblyPromise,
} from '@/types';

const CACHE_VERSION = 1;
const PENDING_CHANGES_KEY = 'pending_changes';

export class ClxDB extends EventEmitter<ClxDBEvents> {
  private database: DatabaseBackend;
  private storage: StorageBackend;
  private options: ClxDBOptions;

  private manifestManager: ManifestManager;
  private shardManager: ShardManager;
  private compactionEngine: CompactionEngine;
  private garbageCollectorEngine: GarbageCollectorEngine;
  private vacuumEngine: VacuumEngine;
  private syncEngine: SyncEngine;

  private pendingIds: string[] = [];
  private state: SyncState = 'idle';
  private syncIntervalId: ReturnType<typeof setInterval> | null = null;
  private syncPromise: Promise<void> | null = null;
  private cleanup: (() => void) | null = null;

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
      update: this.update.bind(this),
    };

    this.compactionEngine = new CompactionEngine(ctx);
    this.compactionEngine.bind(this);
    this.garbageCollectorEngine = new GarbageCollectorEngine(ctx);
    this.syncEngine = new SyncEngine(ctx);
    this.syncEngine.bind(this);
    this.vacuumEngine = new VacuumEngine(ctx);
    this.vacuumEngine.bind(this);
  }

  private normalizeOptions(options: ClxDBClientOptions): ClxDBOptions {
    return {
      ...options,
      syncInterval: options.syncInterval ?? DEFAULT_SYNC_INTERVAL,
      compactionThreshold: options.compactionThreshold ?? DEFAULT_COMPACTION_THRESHOLD,
      desiredShardSize: options.desiredShardSize ?? DEFAULT_DESIRED_SHARD_SIZE,
      maxShardLevel: options.maxShardLevel ?? DEFAULT_MAX_SHARD_LEVEL,
      gcOnStart: options.gcOnStart ?? true,
      vacuumOnStart: options.vacuumOnStart ?? true,
      vacuumThreshold: options.vacuumThreshold ?? DEFAULT_VACUUM_THRESHOLD,
      vacuumCount: options.vacuumCount ?? DEFAULT_VACUUM_COUNT,
      cacheStorageKey: options.cacheStorageKey ?? DEFAULT_CACHE_STORAGE_KEY,
    };
  }

  async init(): Promise<void> {
    this.shardManager.initialize();
    await this.manifestManager.initialize();

    this.syncEngine.initialize();
    void this.sync();

    if (this.options.gcOnStart) {
      void this.garbageCollectorEngine.garbageCollect();
    }

    if (this.options.vacuumOnStart) {
      void this.vacuumEngine.vacuum();
    }

    this.cleanup = this.database.replicate(changedId => this.queueChange(changedId));
  }

  destroy() {
    this.stop();
    this.cleanup?.();
  }

  queueChange(changedId: string) {
    if (this.state === 'idle') {
      this.setState('pending');
    }

    this.pendingIds.push(changedId);
    writeLocalStorage(PENDING_CHANGES_KEY, this.options, {
      version: CACHE_VERSION,
      changes: this.pendingIds,
    });
  }

  async sync() {
    if (!this.syncPromise) {
      this.syncPromise = (async () => {
        this.setState('syncing');
        this.emit('syncStart');

        try {
          await this.syncEngine.sync(this.pendingIds);
          await this.compactionEngine.compact();
          this.emit('syncComplete');
        } catch (error) {
          this.emit('syncError', error as Error);
        } finally {
          this.setState('idle');
          this.syncPromise = null;
        }
      })();
    }

    return this.syncPromise;
  }

  private async update(onUpdate: (manifest: Manifest) => PossiblyPromise<UpdateDescriptor>) {
    const update = await this.manifestManager.updateManifest(
      async manifest => {
        const descriptor = await onUpdate(manifest);
        if (!descriptor.addedShardList) {
          return { addedShardMetadataList: [], ...descriptor };
        }

        const addedShardMetadataList = await createPromisePool(
          descriptor.addedShardList.values().map(shard => this.shardManager.writeShard(shard))
        );

        return {
          addedShardMetadataList,
          addedShardInfoList: addedShardMetadataList.map(shard => shard.info),
          ...descriptor,
        };
      },
      () => this.syncEngine.pull(this.pendingIds)
    );

    update.addedShardMetadataList.forEach(shard => {
      this.shardManager.addHeader(shard.info.filename, shard.header);
    });

    update.removedShardFilenameList?.forEach(filename => {
      this.shardManager.removeHeader(filename);
    });

    return update;
  }

  start(): void {
    if (this.syncIntervalId === null) {
      this.syncIntervalId = window.setInterval(() => {
        void this.sync();
      }, this.options.syncInterval);
    }
  }

  stop(): void {
    if (this.syncIntervalId !== null) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
  }

  getState(): SyncState {
    return this.state;
  }

  private setState(newState: SyncState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.emit('stateChange', newState);
    }
  }
}
