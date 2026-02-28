import { z } from 'zod';
import { CACHE_LAST_SEQUENCE_KEY } from '@/constants';
import { EventEmitter } from '@/utils/event-emitter';
import { createPromisePoolSettled } from '@/utils/promise-pool';
import { isDocumentARecent } from '../utils/document-merge';
import type { CacheManager } from '../managers/cache-manager';
import type { ManifestManager } from '../managers/manifest-manager';
import type { ShardManager } from '../managers/shard-manager';
import type { EngineContext } from '../types';
import type {
  ClxDBEvents,
  ClxDBOptions,
  DatabaseBackend,
  ShardDocument,
  ShardFileInfo,
} from '@/types';

export class SyncEngine extends EventEmitter<ClxDBEvents> {
  private database: DatabaseBackend;
  private manifestManager: ManifestManager;
  private cacheManager: CacheManager;
  private shardManager: ShardManager;
  private localSequence: number;
  private options: ClxDBOptions;
  private update: EngineContext['update'];

  constructor({
    database,
    manifestManager,
    cacheManager,
    shardManager,
    options,
    update,
  }: EngineContext) {
    super();
    this.database = database;
    this.manifestManager = manifestManager;
    this.cacheManager = cacheManager;
    this.shardManager = shardManager;
    this.localSequence = 0;
    this.options = options;
    this.update = update;
  }

  async initialize(): Promise<void> {
    if (this.options.databasePersistent) {
      const lastSequence = await this.cacheManager.readIndexedDB(
        CACHE_LAST_SEQUENCE_KEY,
        z.number()
      );

      if (lastSequence !== null) {
        this.localSequence = lastSequence;
      }
    }
  }

  async sync(): Promise<void> {
    await this.pull();

    const pendingIds = Array.from(new Set(await this.database.readPendingIds()));
    if (pendingIds.length === 0) {
      return;
    }

    const docData = await this.database.read(pendingIds);
    const docDataById = new Map(
      docData.map(data => data && ([data.id, data] as const)).filter(x => !!x)
    );

    const idsToSync = pendingIds.filter(id => {
      const data = docDataById.get(id);
      return data && data.seq === null;
    });

    if (idsToSync.length === 0) {
      return;
    }

    const { addedShardList } = await this.update(manifest => ({
      addedShardList: [
        idsToSync.map(id => {
          const docData = docDataById.get(id);
          return {
            id,
            at: docData?.at ?? Date.now(),
            seq: Math.max(manifest.lastSequence, this.localSequence) + 1,
            del: docData?.del ?? true,
            data: docData?.data,
          };
        }),
      ],
    }));

    await this.database.upsert(addedShardList?.flat() ?? []);
    await this.updateLocalSequence();
  }

  async pull(): Promise<void> {
    const latest = await this.manifestManager.read();
    if (!latest) {
      throw new Error('Manifest not found');
    }

    const shardsToScan: ShardFileInfo[] = latest.manifest.shardFiles.filter(
      shard => shard.range.max > this.localSequence
    );

    const newShards = shardsToScan.filter(shard => !this.shardManager.has(shard.filename));
    await this.shardManager.fetchHeaders(newShards);

    const shardChanges = await createPromisePoolSettled(
      shardsToScan.values().map(shardInfo => this.fetchShardChanges(shardInfo))
    );

    const aggregatedChanges = Array.from(
      shardChanges
        .flatMap(result => (result.status === 'fulfilled' ? result.value : []))
        .reduce((changes, doc) => {
          const existingDoc = changes.get(doc.id);
          if (!existingDoc || isDocumentARecent(doc, existingDoc)) {
            changes.set(doc.id, doc);
          }

          return changes;
        }, new Map<string, ShardDocument>())
        .values()
    );

    const changes = await this.options.mergeRule(this.database, aggregatedChanges);
    if (changes.length > 0) {
      await Promise.all([
        this.database.upsert(changes.filter(change => !change.del)),
        this.database.delete(changes.filter(change => change.del)),
      ]);

      this.emit('documentsChanged', changes);
    }

    const syncError = shardChanges.find(result => result.status === 'rejected');

    if (syncError) {
      throw syncError.reason as unknown;
    }

    await this.updateLocalSequence();
  }

  private async fetchShardChanges(shardInfo: ShardFileInfo) {
    if (this.localSequence < shardInfo.range.min) {
      return this.shardManager.fetchDocuments(shardInfo, null);
    }

    const header = await this.shardManager.fetchHeader(shardInfo);
    const docsToFetch = header.docs.filter(doc => doc.seq > this.localSequence);
    if (docsToFetch.length === 0) {
      return [];
    }

    return this.shardManager.fetchDocuments(shardInfo, docsToFetch);
  }

  private async updateLocalSequence(): Promise<void> {
    this.localSequence = Math.max(
      this.localSequence,
      this.manifestManager.getLastManifest().lastSequence
    );

    if (this.options.databasePersistent) {
      await this.cacheManager.writeIndexedDB(CACHE_LAST_SEQUENCE_KEY, this.localSequence);
    }
  }
}
