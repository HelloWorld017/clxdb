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
  ShardDocInfo,
  ClxDBOptions,
  SyncState,
  ClxDBEvents,
  ClxDBClientOptions,
} from '../types';

const SHARDS_DIR = 'shards';
const MANIFEST_PATH = 'manifest.json';
const LAST_SEQUENCE_KEY = 'lastSequence';

type Listeners = Partial<Record<keyof ClxDBEvents, Array<(...args: never[]) => void>>>;

export class SyncEngine {
  private backend: StorageBackend;
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
  private knownShards: Set<string> = new Set();

  constructor(backend: StorageBackend, options: ClxDBClientOptions = {}) {
    this.backend = backend;
    this.options = this.normalizeOptions(options);
    this.manifestManager = new ManifestManager(backend);
    this.shardManager = new ShardManager(backend, this.options);
    this.compactionEngine = new CompactionEngine(backend, this.shardManager, {
      desiredShardSize: this.options.desiredShardSize,
      compactionThreshold: this.options.compactionThreshold,
    });
    this.garbageCollector = new GarbageCollector(backend);
  }

  private normalizeOptions(options: ClxDBClientOptions): ClxDBOptions {
    return {
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

    // Load knownShards from shardManager
    const headers = this.shardManager.getAllHeaders();
    for (const filename of headers.keys()) {
      this.knownShards.add(filename);
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
          [compactionResult.newShard],
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

    const existingStat = await this.backend.stat(shardPath).catch(() => null);
    if (existingStat) {
      this.pendingChanges = [];
      return;
    }

    try {
      await this.backend.write(shardPath, shard);
    } catch (error) {
      // Check if file already exists using stat
      const existingStat = await this.backend.stat(shardPath).catch(() => null);
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
    this.knownShards.add(filename);
    this.updateLocalSequence();
  }

  private async pull(): Promise<void> {
    const stat = await this.backend.stat(MANIFEST_PATH);
    if (!stat) {
      throw new Error('Manifest not found during pull');
    }

    if (stat.etag === this.manifestManager.getLastEtag()) {
      return;
    }

    const content = await this.backend.read(MANIFEST_PATH);
    const manifest = JSON.parse(new TextDecoder().decode(content)) as {
      lastSequence: number;
      shardFiles: ShardFileInfo[];
    };

    const newShards = manifest.shardFiles.filter(s => !this.knownShards.has(s.filename));
    await this.shardManager.fetchMissingHeaders(newShards);

    // Fetch and apply shards using promise pool for concurrency
    const shardGenerator = (function* (syncEngine: SyncEngine, shards: ShardFileInfo[]) {
      for (const shardInfo of shards) {
        yield syncEngine.fetchAndApplyShard(shardInfo);
      }
    })(this, newShards);

    const results = await createPromisePool(shardGenerator, 5);

    // Track successfully processed shards
    for (let i = 0; i < newShards.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') {
        this.knownShards.add(newShards[i].filename);
      } else {
        console.warn(`Failed to fetch and apply shard ${newShards[i].filename}:`, result.reason);
      }
    }

    this.localSequence = manifest.lastSequence;
    this.manifestManager.updateLastEtag(stat.etag);
  }

  getPendingChanges(): DocOperation[] {
    return [...this.pendingChanges];
  }

  private async fetchAndApplyShard(shardInfo: ShardFileInfo): Promise<void> {
    const header = await this.shardManager.fetchHeader(shardInfo);

    // Find documents where seq > this.localSequence
    const docsToFetch = header.docs.filter(doc => doc.seq > this.localSequence);

    if (docsToFetch.length === 0) {
      return;
    }

    // Fetch document data using promise pool for concurrency
    const docGenerator = (function* (
      shardManager: ShardManager,
      shardInfo: ShardFileInfo,
      docs: ShardDocInfo[]
    ) {
      for (const doc of docs) {
        yield shardManager.fetchDocument(shardInfo, doc);
      }
    })(this.shardManager, shardInfo, docsToFetch);

    const results = await createPromisePool(docGenerator, 5);

    // Process results and emit document changes
    const changes: ShardDocument[] = [];
    for (let i = 0; i < docsToFetch.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') {
        changes.push(result.value);
      } else {
        console.warn(`Failed to fetch document ${docsToFetch[i].id}:`, result.reason);
      }
    }

    // Emit changes for application to the database
    if (changes.length > 0) {
      this.emit('documentsChanged', changes);
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
