import { EventEmitter } from '@/utils/event-emitter';
import { createPromisePool } from '@/utils/promise-pool';
import { ClxBlobs } from './engines/blobs-engine';
import { CompactionEngine } from './engines/compaction-engine';
import { GarbageCollectorEngine } from './engines/garbage-collector-engine';
import { SyncEngine } from './engines/sync-engine';
import { VacuumEngine } from './engines/vacuum-engine';
import { CacheManager } from './managers/cache-manager';
import { CryptoManager } from './managers/crypto-manager';
import { ManifestManager } from './managers/manifest-manager';
import { ShardManager } from './managers/shard-manager';
import { normalizeOptions } from './utils/options';
import type { RegisteredDevice } from './managers/crypto-manager';
import type { UpdateDescriptor } from './types';
import type {
  StorageBackend,
  ClxDBOptions,
  SyncState,
  ClxDBEvents,
  DatabaseBackend,
  Manifest,
  PossiblyPromise,
  ClxDBCrypto,
  ClxDBParams,
} from '@/types';

export class ClxDB extends EventEmitter<ClxDBEvents> {
  public database: DatabaseBackend;
  public storage: StorageBackend;
  public blobs: ClxBlobs;
  private crypto: ClxDBCrypto;
  private options: ClxDBOptions;

  private manifestManager: ManifestManager;
  private cacheManager: CacheManager;
  private cryptoManager: CryptoManager;
  private shardManager: ShardManager;
  private compactionEngine: CompactionEngine;
  private garbageCollectorEngine: GarbageCollectorEngine;
  private vacuumEngine: VacuumEngine;
  private syncEngine: SyncEngine;

  private state: SyncState = 'idle';
  private syncIntervalId: ReturnType<typeof setInterval> | null = null;
  private syncPromise: Promise<void> | null = null;
  private cleanup: (() => void) | null = null;

  constructor({ database, storage, crypto, options }: ClxDBParams) {
    super();
    this.database = database;
    this.storage = storage;
    this.crypto = crypto;
    this.options = normalizeOptions(options);
    this.manifestManager = new ManifestManager(this.storage);
    this.cacheManager = new CacheManager(this.options);
    this.cryptoManager = new CryptoManager(this.crypto, this.manifestManager, this.cacheManager);
    this.shardManager = new ShardManager(
      this.storage,
      this.cacheManager,
      this.cryptoManager,
      this.options
    );

    const ctx = {
      storage: this.storage,
      database: this.database,
      manifestManager: this.manifestManager,
      cacheManager: this.cacheManager,
      cryptoManager: this.cryptoManager,
      shardManager: this.shardManager,
      options: this.options,
      update: this.update.bind(this),
    };

    this.blobs = new ClxBlobs(ctx);
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

    const uuid = this.manifestManager.getLastManifest().uuid;
    await this.database.initialize(uuid);
    await this.cacheManager.initialize(uuid);
    await this.cryptoManager.initialize();
    await this.shardManager.initialize();
    void this.shardManager.pruneHeaders(this.manifestManager.getLastManifest());

    await this.syncEngine.initialize();
    await this.sync();
    await this.touchCurrentDeviceKey();

    if (this.options.gcOnStart) {
      void this.garbageCollectorEngine.garbageCollect();
    }

    if (this.options.vacuumOnStart) {
      void this.vacuumEngine.vacuum();
    }

    this.cleanup = this.database.replicate(() => void this.checkAndUpdateStatus());
    if (this.options.syncInterval > 0) {
      this.start();
    }
  }

  destroy() {
    this.stop();
    this.cleanup?.();
    this.cacheManager.destroy();
  }

  private async checkAndUpdateStatus() {
    if (this.state === 'syncing') {
      return;
    }

    if ((await this.database.readPendingIds()).length === 0) {
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
        this.setState('syncing');
        this.emit('syncStart', isPending);

        try {
          await this.syncEngine.sync();
          await this.compactionEngine.compact();
          this.emit('syncComplete');
        } catch (error) {
          this.emit('syncError', error as Error);
        } finally {
          this.setState('idle');
          void this.checkAndUpdateStatus();
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
      this.shardManager.addHeader(shard.info.filename, shard.header, shard.headerSize);
    });

    update.removedShardFilenameList?.forEach(filename => {
      this.shardManager.removeHeader(filename);
    });

    return update;
  }
  async updateMasterPassword(oldPassword: string, newPassword: string): Promise<void> {
    const updateCrypto = await this.cryptoManager.updateMasterPassword(oldPassword, newPassword);
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

  async removeRegisteredDevice(deviceId: string): Promise<void> {
    const updateCrypto = await this.cryptoManager.removeRegisteredDevice(deviceId);

    const { commit } = await this.update(async manifest => {
      const {
        manifest: { crypto },
        commit,
      } = await updateCrypto(manifest);

      return { updatedFields: { crypto }, commit };
    });

    await commit();
  }

  getRegisteredDevices(): RegisteredDevice[] {
    return this.cryptoManager.getRegisteredDevices();
  }

  async getCurrentDeviceId(): Promise<string | null> {
    return this.cryptoManager.getCurrentDeviceId();
  }

  private async touchCurrentDeviceKey(): Promise<void> {
    const update = await this.cryptoManager.touchCurrentDeviceKey();
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

export const createClxDB = (params: ClxDBParams) => new ClxDB(params);
