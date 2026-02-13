import { EventEmitter } from '@/utils/event-emitter';
import { createPromisePool } from '@/utils/promise-pool';
import { CompactionEngine } from './engines/compaction-engine';
import { GarbageCollectorEngine } from './engines/garbage-collector-engine';
import { SyncEngine } from './engines/sync-engine';
import { VacuumEngine } from './engines/vacuum-engine';
import { CryptoManager } from './managers/crypto-manager';
import { ManifestManager } from './managers/manifest-manager';
import { ShardManager } from './managers/shard-manager';
import { normalizeOptions } from './utils/options';
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
  ClxDBCrypto,
} from '@/types';

interface ClxDBParams {
  database: DatabaseBackend;
  storage: StorageBackend;
  crypto: ClxDBCrypto;
  options: ClxDBClientOptions;
}

export class ClxDB extends EventEmitter<ClxDBEvents> {
  private database: DatabaseBackend;
  private storage: StorageBackend;
  private crypto: ClxDBCrypto;
  private options: ClxDBOptions;

  private manifestManager: ManifestManager;
  private cryptoManager: CryptoManager;
  private shardManager: ShardManager;
  private compactionEngine: CompactionEngine;
  private garbageCollectorEngine: GarbageCollectorEngine;
  private vacuumEngine: VacuumEngine;
  private syncEngine: SyncEngine;

  private state: SyncState = 'idle';
  private syncIntervalId: ReturnType<typeof setInterval> | null = null;
  private syncPromise: Promise<void> | null = null;
  private syncRequestedWhileSyncing: boolean = false;
  private cleanup: (() => void) | null = null;

  constructor({ database, storage, crypto, options }: ClxDBParams) {
    super();
    this.database = database;
    this.storage = storage;
    this.crypto = crypto;
    this.options = normalizeOptions(options);
    this.manifestManager = new ManifestManager(this.storage);
    this.cryptoManager = new CryptoManager(this.crypto, this.options);
    this.shardManager = new ShardManager(this.storage, this.options, this.cryptoManager);

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

  async init(): Promise<void> {
    await this.manifestManager.initialize();
    await this.initializeCrypto();
    await this.shardManager.initialize();

    await this.syncEngine.initialize();
    await this.sync();

    if (this.options.gcOnStart) {
      void this.garbageCollectorEngine.garbageCollect();
    }

    if (this.options.vacuumOnStart) {
      void this.vacuumEngine.vacuum();
    }

    this.cleanup = this.database.replicate(() => this.markAsPending());
    if (this.options.syncInterval > 0) {
      this.start();
    }
  }

  async updateMasterPassword(oldPassword: string, newPassword: string): Promise<void> {
    const updateCrypto = await this.cryptoManager.updateMasterPassword(
      this.manifestManager,
      oldPassword,
      newPassword
    );

    const { commit } = await this.update(async manifest => {
      const {
        manifest: { crypto },
        commit,
      } = await updateCrypto(manifest);

      return { updatedFields: { crypto: crypto }, commit };
    });

    commit();
  }

  async updateQuickUnlockPassword(
    masterPassword: string,
    quickUnlockPassword: string
  ): Promise<void> {
    const updateCrypto = await this.cryptoManager.updateQuickUnlockPassword(
      this.manifestManager,
      masterPassword,
      quickUnlockPassword
    );

    const { commit } = await this.update(async manifest => {
      const {
        manifest: { crypto },
        commit,
      } = await updateCrypto(manifest);

      return { updatedFields: { crypto: crypto }, commit };
    });

    await commit();
  }

  destroy() {
    this.stop();
    this.cleanup?.();
  }

  private markAsPending() {
    if (this.state === 'syncing') {
      this.syncRequestedWhileSyncing = true;
      return;
    }

    if (this.state === 'idle') {
      this.setState('pending');
    }
  }

  async sync() {
    if (!this.syncPromise) {
      this.syncPromise = (async () => {
        if (this.state === 'syncing') {
          return;
        }

        const isPending = this.state === 'pending';
        this.syncRequestedWhileSyncing = false;
        this.setState('syncing');
        this.emit('syncStart', isPending);

        try {
          await this.syncEngine.sync();
          await this.compactionEngine.compact();
          this.emit('syncComplete');
        } catch (error) {
          this.emit('syncError', error as Error);
        } finally {
          this.setState(this.syncRequestedWhileSyncing ? 'pending' : 'idle');
          this.syncPromise = null;
        }
      })();
    }

    return this.syncPromise;
  }

  private async update<T extends UpdateDescriptor>(
    onUpdate: (manifest: Manifest) => PossiblyPromise<T>
  ): Promise<T> {
    const update = await this.manifestManager.updateManifest(
      async manifest => {
        const descriptor = await onUpdate(manifest);
        const addedShardList = descriptor.addedShardList?.filter(shard => shard.length > 0);
        if (!addedShardList?.length) {
          return {
            addedShardMetadataList: [],
            finalizeManifest: this.cryptoManager.finalizeManifest.bind(this.cryptoManager),
            ...descriptor,
          };
        }

        const addedShardMetadataList = await createPromisePool(
          addedShardList.values().map(shard => this.shardManager.writeShard(shard))
        );

        return {
          addedShardMetadataList,
          addedShardInfoList: addedShardMetadataList.map(shard => shard.info),
          finalizeManifest: this.cryptoManager.finalizeManifest.bind(this.cryptoManager),
          ...descriptor,
        };
      },
      () => this.syncEngine.pull()
    );

    update.addedShardMetadataList.forEach(shard => {
      this.shardManager.addHeader(shard.info.filename, shard.header);
    });

    update.removedShardFilenameList?.forEach(filename => {
      this.shardManager.removeHeader(filename);
    });

    return update;
  }

  private async initializeCrypto(): Promise<void> {
    await this.cryptoManager.openManifest(this.manifestManager);

    const update = await this.cryptoManager.touchCurrentDeviceKey(this.manifestManager);
    if (update) {
      await this.update(manifest => ({ updatedFields: { crypto: update(manifest).crypto } }));
    }
  }

  start(): void {
    if (this.syncIntervalId === null) {
      this.syncIntervalId = setInterval(() => {
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
