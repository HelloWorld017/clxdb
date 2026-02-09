import {
  DEFAULT_SYNC_INTERVAL,
  DEFAULT_COMPACTION_THRESHOLD,
  DEFAULT_DESIRED_SHARD_SIZE,
  DEFAULT_VACUUM_THRESHOLD,
} from '../constants';
import type {
  StorageBackend,
  DocOperation,
  ShardFileInfo,
  ShardDocument,
  ClxDBOptions,
  SyncState,
  ClxDBEvents,
} from '../types';
import { ManifestManager } from './manifest-manager';
import { CompactionEngine } from './compaction-engine';
import { GarbageCollector } from './garbage-collector';
import {
  encodeShard,
  calculateHash,
  parseShardHeader,
  getHeaderLength,
} from './shard-utils';

const SHARDS_DIR = 'shards';
const MANIFEST_PATH = 'manifest.json';

interface RequiredOptions {
  syncInterval: number;
  compactionThreshold: number;
  desiredShardSize: number;
  gcOnStart: boolean;
  vacuumThreshold: number;
}

type Listeners = Partial<
  Record<keyof ClxDBEvents, Array<(...args: any[]) => void>>
>;

export class SyncEngine {
  private backend: StorageBackend;
  private options: RequiredOptions;
  private manifestManager: ManifestManager;
  private compactionEngine: CompactionEngine;
  private garbageCollector: GarbageCollector;

  private syncIntervalId: number | null = null;
  private state: SyncState = 'idle';
  private localSequence: number = 0;
  private pendingChanges: DocOperation[] = [];
  private listeners: Listeners = {};
  private knownShards: Set<string> = new Set();

  constructor(backend: StorageBackend, options: ClxDBOptions = {}) {
    this.backend = backend;
    this.options = this.normalizeOptions(options);
    this.manifestManager = new ManifestManager(backend);
    this.compactionEngine = new CompactionEngine(backend, {
      desiredShardSize: this.options.desiredShardSize,
      compactionThreshold: this.options.compactionThreshold,
    });
    this.garbageCollector = new GarbageCollector(backend);
  }

  private normalizeOptions(options: ClxDBOptions): RequiredOptions {
    return {
      syncInterval: options.syncInterval ?? DEFAULT_SYNC_INTERVAL,
      compactionThreshold:
        options.compactionThreshold ?? DEFAULT_COMPACTION_THRESHOLD,
      desiredShardSize: options.desiredShardSize ?? DEFAULT_DESIRED_SHARD_SIZE,
      gcOnStart: options.gcOnStart ?? true,
      vacuumThreshold: options.vacuumThreshold ?? DEFAULT_VACUUM_THRESHOLD,
    };
  }

  async init(): Promise<void> {
    const manifest = await this.manifestManager.initialize();
    this.localSequence = manifest.lastSequence;
    this.knownShards = new Set(manifest.shardFiles.map(s => s.filename));

    if (this.options.gcOnStart) {
      void this.garbageCollector.run();
    }
  }

  start(): void {
    if (this.syncIntervalId !== null) return;

    this.syncIntervalId = window.setInterval(() => {
      void this.triggerSync();
    }, this.options.syncInterval);
  }

  stop(): void {
    if (this.syncIntervalId === null) return;

    clearInterval(this.syncIntervalId);
    this.syncIntervalId = null;
  }

  getState(): SyncState {
    return this.state;
  }

  async triggerSync(): Promise<void> {
    if (this.state === 'syncing') return;

    this.setState('syncing');
    this.emit('syncStart');

    try {
      await this.push();
      await this.pull();
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

  on<K extends keyof ClxDBEvents>(
    event: K,
    listener: ClxDBEvents[K]
  ): () => void {
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
        await this.manifestManager.addShard(
          compactionResult.newShard,
          compactionResult.removedShards
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
    if (oldState === newState) return;

    this.state = newState;
    this.emit('stateChange', newState);
  }

  private emit<K extends keyof ClxDBEvents>(
    event: K,
    ...args: Parameters<ClxDBEvents[K]>
  ): void {
    this.listeners[event]?.forEach(listener => listener(...args));
  }

  private async push(): Promise<void> {
    if (this.pendingChanges.length === 0) return;

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
      if ((error as Error).message?.includes('already exists')) {
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

    await this.manifestManager.addShard(shardInfo);
    this.pendingChanges = [];
    this.knownShards.add(filename);
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

    const newShards = manifest.shardFiles.filter(
      s => !this.knownShards.has(s.filename)
    );

    for (const shardInfo of newShards) {
      await this.fetchAndApplyShard(shardInfo);
      this.knownShards.add(shardInfo.filename);
    }

    this.localSequence = manifest.lastSequence;
    this.manifestManager.updateLastEtag(stat.etag);
  }

  private async fetchAndApplyShard(
    shardInfo: ShardFileInfo
  ): Promise<ShardDocument[]> {
    const header = await this.fetchShardHeader(shardInfo);

    return header.docs.map(docInfo => ({
      id: docInfo.id,
      rev: docInfo.rev,
      seq: docInfo.seq,
      del: docInfo.del,
      data: undefined,
    }));
  }

  private async fetchShardHeader(shardInfo: ShardFileInfo): Promise<{
    docs: Array<{
      id: string;
      rev: string;
      seq: number;
      del: boolean;
      offset: number;
      len: number;
    }>;
  }> {
    const path = `${SHARDS_DIR}/${shardInfo.filename}`;

    try {
      const headerLenBytes = await this.backend.read(path, { start: 0, end: 3 });
      const headerLen = getHeaderLength(headerLenBytes);

      const headerBytes = await this.backend.read(path, {
        start: 4,
        end: 4 + headerLen - 1,
      });

      return parseShardHeader(headerBytes);
    } catch (error) {
      if ((error as Error).message?.includes('not found')) {
        throw new Error('SHARD_MISSING');
      }
      throw error;
    }
  }

  getPendingChanges(): DocOperation[] {
    return [...this.pendingChanges];
  }
}
