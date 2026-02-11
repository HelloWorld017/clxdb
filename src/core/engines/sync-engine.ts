import { z } from 'zod';
import { SHARDS_DIR } from '@/constants';
import { EventEmitter } from '@/utils/event-emitter';
import { readLocalStorage, writeLocalStorage } from '@/utils/local-storage';
import { createPromisePool } from '@/utils/promise-pool';
import { calculateHash, encodeShard } from '../utils/shard-utils';
import type { ManifestManager } from '../managers/manifest-manager';
import type { ShardManager } from '../managers/shard-manager';
import type { EngineContext } from '../types';
import type {
  ClxDBEvents,
  ClxDBOptions,
  DatabaseBackend,
  DocOperation,
  ShardDocument,
  ShardFileInfo,
  StorageBackend,
  SyncState,
} from '@/types';

const LAST_SEQUENCE_KEY = 'lastSequence';

export class SyncEngine extends EventEmitter<ClxDBEvents> {
  private storage: StorageBackend;
  private database: DatabaseBackend;
  private manifestManager: ManifestManager;
  private shardManager: ShardManager;
  private options: ClxDBOptions;
  private pendingChanges: DocOperation[];
  private localSequence: number;
  private state: SyncState = 'idle';
  private syncIntervalId: ReturnType<typeof setInterval> | null = null;
  private cleanup: (() => void) | null = null;

  constructor({ storage, database, manifestManager, shardManager, options }: EngineContext) {
    super();
    this.storage = storage;
    this.database = database;
    this.manifestManager = manifestManager;
    this.shardManager = shardManager;
    this.options = options;
    this.pendingChanges = [];
    this.localSequence = 0;
  }

  initialize() {
    const lastSequence = readLocalStorage(LAST_SEQUENCE_KEY, this.options, z.number());
    if (lastSequence !== null) {
      this.localSequence = lastSequence;
    }

    this.cleanup = this.database.replicate(change => this.queueChange(change));
  }

  destroy() {
    this.stop();
    this.cleanup?.();
  }

  queueChange(change: DocOperation) {
    if (this.state === 'idle') {
      this.setState('pending');
    }

    this.pendingChanges.push(change);
  }

  async sync() {
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
      this.setState('idle');
      this.emit('syncError', error as Error);
    }
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
