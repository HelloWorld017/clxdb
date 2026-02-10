import { z } from 'zod';
import {
  DEFAULT_SYNC_INTERVAL,
  DEFAULT_COMPACTION_THRESHOLD,
  DEFAULT_DESIRED_SHARD_SIZE,
  DEFAULT_VACUUM_THRESHOLD,
  DEFAULT_CACHE_STORAGE_KEY,
} from '../constants';
import { readLocalStorage, writeLocalStorage } from '../utils/local-storage';
import { createPromisePool } from '../utils/promise-pool';
import { CompactionEngine } from './compaction-engine';
import { GarbageCollector } from './garbage-collector';
import { ManifestManager } from './manifest-manager';
import { ShardManager } from './shard-manager';
import { encodeShard, calculateHash } from './shard-utils';
import type {
  StorageBackend,
  DocOperation,
  ShardFileInfo,
  ShardDocument,
  ClxDBOptions,
  SyncState,
  ClxDBEvents,
  ClxDBClientOptions,
  DatabaseBackend,
} from '../types';

const SHARDS_DIR = 'shards';
const LAST_SEQUENCE_KEY = 'lastSequence';

type Listeners = Partial<Record<keyof ClxDBEvents, Array<(...args: never[]) => void>>>;

export class SyncEngine {
  private database: DatabaseBackend;
  private storage: StorageBackend;
  private options: ClxDBOptions;
  private manifestManager: ManifestManager;
  private compactionEngine: CompactionEngine;
  private garbageCollector: GarbageCollector;
  private shardManager: ShardManager;

  private syncIntervalId: number | null = null;
  private state: SyncState = 'idle';
  private localSequence: number = 0;
  private pendingChanges: DocOperation[] = [];
  private listeners: Listeners = {};

  constructor(options: ClxDBClientOptions) {
    this.database = options.database;
    this.storage = options.storage;
    this.options = this.normalizeOptions(options);
    this.manifestManager = new ManifestManager(this.storage);
    this.shardManager = new ShardManager(this.storage, this.options);
    this.compactionEngine = new CompactionEngine(this.storage, this.shardManager, {
      desiredShardSize: this.options.desiredShardSize,
      compactionThreshold: this.options.compactionThreshold,
    });
    this.garbageCollector = new GarbageCollector(this.storage);
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

    // Load lastSequence from localStorage
    const lastSequenceSchema = z.number();
    const lastSequence = readLocalStorage<number>(
      LAST_SEQUENCE_KEY,
      this.options,
      lastSequenceSchema
    );

    if (lastSequence !== null) {
      this.localSequence = lastSequence;
    }

    if (this.options.gcOnStart) {
      void this.garbageCollector.run();
    }
  }

  start(): void {
    if (this.syncIntervalId !== null) {
      return;
    }

    this.syncIntervalId = window.setInterval(() => {
      void this.triggerSync();
    }, this.options.syncInterval);
  }

  stop(): void {
    if (this.syncIntervalId === null) {
      return;
    }

    clearInterval(this.syncIntervalId);
    this.syncIntervalId = null;
  }

  getState(): SyncState {
    return this.state;
  }

  async triggerSync(): Promise<void> {
    if (this.state === 'syncing') {
      return;
    }

    this.setState('syncing');
    this.emit('syncStart');

    try {
      await this.pull();
      await this.push();
      this.setState('idle');
      this.emit('syncComplete');
    } catch (error) {
      this.setState('offline');
      this.emit('syncError', error as Error);
    }
  }

  queueChange(operation: DocOperation): void {
    this.pendingChanges.push(operation);
    if (this.state === 'idle') {
      this.setState('pending');
    }
  }

  on<K extends keyof ClxDBEvents>(event: K, listener: ClxDBEvents[K]): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event]!.push(listener);

    return () => {
      this.listeners[event] = this.listeners[event]!.filter(l => l !== listener);
    };
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

  private setState(newState: SyncState): void {
    const oldState = this.state;
    if (oldState === newState) {
      return;
    }

    this.state = newState;
    this.emit('stateChange', newState);
  }

  private emit<K extends keyof ClxDBEvents>(event: K, ...args: Parameters<ClxDBEvents[K]>): void {
    this.listeners[event]?.forEach(listener => {
      listener(...(args as never[]));
    });
  }

  private async push(): Promise<void> {
    if (this.pendingChanges.length === 0) {
      return;
    }

    const operations = [...this.pendingChanges];
    const { data: shard } = encodeShard(operations);
    const hash = await calculateHash(shard);
    const filename = `shard_${hash}.clx`;
    const shardPath = `${SHARDS_DIR}/${filename}`;

    try {
      await this.storage.write(shardPath, shard);
    } catch (error) {
      const existingStat = await this.storage.stat(shardPath).catch(() => null);
      if (existingStat) {
        this.pendingChanges = [];
        return;
      }
      throw error;
    }

    const seqMax = Math.max(...operations.map(op => op.seq));
    const seqMin = Math.min(...operations.map(op => op.seq));

    const shardInfo: ShardFileInfo = {
      filename,
      level: 0,
      range: { min: seqMin, max: seqMax },
    };

    await this.manifestManager.updateManifest([shardInfo], [], () => this.pull());
    this.pendingChanges = [];
    this.updateLocalSequence();
  }

  private async pull(): Promise<void> {
    const { manifest } = (await this.manifestManager.read())!;
    const newShards = manifest.shardFiles.filter(s => !this.shardManager.has(s.filename));
    await this.shardManager.fetchHeaders(newShards);

    // Fetch and apply shards
    const results = await createPromisePool(
      (function* (syncEngine: SyncEngine) {
        for (const shardInfo of newShards) {
          yield syncEngine.fetchAndApplyShard(shardInfo);
        }
      })(this)
    );

    const error = results.find(result => result.status === 'rejected');
    if (error) {
      throw error.reason;
    }

    this.localSequence = manifest.lastSequence;
  }

  getPendingChanges(): DocOperation[] {
    return [...this.pendingChanges];
  }

  private async fetchAndApplyShard(shardInfo: ShardFileInfo): Promise<void> {
    const header = await this.shardManager.fetchHeader(shardInfo);
    const docsToFetch = header.docs.filter(doc => doc.seq > this.localSequence);
    if (docsToFetch.length === 0) {
      return;
    }

    const shardManager = this.shardManager;
    const results = await createPromisePool(
      (function* () {
        for (const doc of docsToFetch) {
          yield shardManager.fetchDocument(shardInfo, doc);
        }
      })()
    );

    const changes: ShardDocument[] = results
      .filter(result => result.status === 'fulfilled')
      .map(result => result.value);

    if (changes.length > 0) {
      this.emit('documentsChanged', changes);
      await Promise.all([
        this.database.upsert(changes.filter(change => !change.del)),
        this.database.delete(changes.filter(change => change.del)),
      ]);
    }

    const error = results.find(result => result.status === 'rejected');
    if (error) {
      throw error.reason;
    }
  }

  private updateLocalSequence(): void {
    this.localSequence = Math.max(
      this.localSequence,
      this.manifestManager.getLastManifest().lastSequence
    );

    writeLocalStorage<number>(LAST_SEQUENCE_KEY, this.options, this.localSequence);
  }
}
