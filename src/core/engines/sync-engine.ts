import { z } from 'zod';
import { EventEmitter } from '@/utils/event-emitter';
import { readLocalStorage, writeLocalStorage } from '@/utils/local-storage';
import { createPromisePool } from '@/utils/promise-pool';
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

const LAST_SEQUENCE_KEY = 'lastSequence';

export class SyncEngine extends EventEmitter<ClxDBEvents> {
  private database: DatabaseBackend;
  private manifestManager: ManifestManager;
  private shardManager: ShardManager;
  private options: ClxDBOptions;
  private localSequence: number;
  private update: EngineContext['update'];

  constructor({ database, manifestManager, shardManager, options, update }: EngineContext) {
    super();
    this.database = database;
    this.manifestManager = manifestManager;
    this.shardManager = shardManager;
    this.options = options;
    this.localSequence = 0;
    this.update = update;
  }

  initialize() {
    const lastSequence = readLocalStorage(LAST_SEQUENCE_KEY, this.options, z.number());
    if (lastSequence !== null) {
      this.localSequence = lastSequence;
    }
  }

  async sync(pendingIds: string[]): Promise<void> {
    if (pendingIds.length === 0) {
      return;
    }

    await this.pull(pendingIds);
    const docData = await this.database.read(pendingIds);
    const docDataById = new Map(
      docData.map(data => data && ([data.id, data] as const)).filter(x => !!x)
    );

    const { addedShardList } = await this.update(manifest => ({
      addedShardList: [
        pendingIds.map(id => ({
          id,
          at: docDataById.get(id)?.at ?? Date.now(),
          seq: Math.max(manifest.lastSequence, this.localSequence) + 1,
          del: docDataById.has(id),
          data: docDataById.get(id)?.data,
        })),
      ],
    }));

    await this.database.upsert(addedShardList?.flat() ?? []);
    this.updateLocalSequence();
  }

  async pull(pendingIds: string[]): Promise<void> {
    const { manifest } = (await this.manifestManager.read())!;
    const newShards = manifest.shardFiles.filter(s => !this.shardManager.has(s.filename));
    await this.shardManager.fetchHeaders(newShards);

    const pendingIdsSet = new Set(pendingIds);
    await createPromisePool(
      newShards.values().map(shardInfo => this.fetchAndApplyShard(shardInfo, pendingIdsSet))
    );

    this.updateLocalSequence();
  }

  private async fetchAndApplyShard(
    shardInfo: ShardFileInfo,
    pendingIdsSet: Set<string>
  ): Promise<void> {
    const header = await this.shardManager.fetchHeader(shardInfo);
    const docsToFetch = header.docs.filter(doc => doc.seq > this.localSequence);
    if (docsToFetch.length === 0) {
      return;
    }

    let lastError: { error: unknown } | null = null;
    const shardManager = this.shardManager;
    const results = await createPromisePool(
      docsToFetch.values().map(doc => shardManager.fetchDocument(shardInfo, doc)),
      { onError: error => (lastError = { error }) }
    );

    const timestampByPendingId = new Map(
      (await this.database.read(Array.from(pendingIdsSet)))
        .filter(x => !!x)
        .map(doc => [doc.id, doc.at])
    );

    const changes: ShardDocument[] = results.filter(change => {
      const localTimestamp = timestampByPendingId.get(change.id);
      return !localTimestamp || localTimestamp < change.at;
    });

    if (changes.length > 0) {
      this.emit('documentsChanged', changes);
      await Promise.all([
        this.database.upsert(changes.filter(change => !change.del)),
        this.database.delete(changes.filter(change => change.del)),
      ]);
    }

    if (lastError) {
      throw (lastError as { error: Error }).error;
    }
  }

  private updateLocalSequence(): void {
    this.localSequence = Math.max(
      this.localSequence,
      this.manifestManager.getLastManifest().lastSequence
    );

    writeLocalStorage(LAST_SEQUENCE_KEY, this.options, this.localSequence);
  }
}
