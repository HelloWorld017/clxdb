import { z } from 'zod';
import {
  CACHE_LAST_SEQUENCE_KEY,
  SYNC_PULL_WRITE_BYTE_WATERMARK,
  SYNC_PULL_WRITE_CHUNK_SIZE,
} from '@/constants';
import { EventEmitter } from '@/utils/event-emitter';
import { isDocumentARecent } from '../utils/document-merge';
import type { CacheManager } from '../managers/cache-manager';
import type { ManifestManager } from '../managers/manifest-manager';
import type { ShardManager } from '../managers/shard-manager';
import type { EngineContext } from '../types';
import type {
  ClxDBEvents,
  ClxDBOptions,
  DatabaseBackend,
  ShardDocInfo,
  ShardDocument,
  ShardFileInfo,
} from '@/types';

interface PullDocumentReference {
  shardInfo: ShardFileInfo;
  docInfo: ShardDocInfo;
}

interface PullFetchGroup {
  shardInfo: ShardFileInfo;
  references: PullDocumentReference[];
}

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

  async sync(syncId: string): Promise<void> {
    await this.pull(syncId);

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

    const { addedShardList } = await this.update(
      manifest => ({
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
      }),
      {
        syncId,
        onProgress: (progress, total) => {
          this.emit('syncProgress', syncId, {
            stage: 'push',
            progress,
            total,
          });
        },
      }
    );

    await this.database.upsert(addedShardList?.flat() ?? []);
    await this.updateLocalSequence();
  }

  async pull(syncId?: string): Promise<void> {
    const latest = await this.manifestManager.read();
    if (!latest) {
      throw new Error('Manifest not found');
    }

    const shardsToScan: ShardFileInfo[] = latest.manifest.shardFiles.filter(
      shard => shard.range.max > this.localSequence
    );

    const newShards = shardsToScan.filter(shard => !this.shardManager.has(shard.filename));
    await this.shardManager.fetchHeaders(newShards);

    const latestReferencesById = await this.collectLatestDocumentReferences(shardsToScan);
    await this.applyPullChanges(latestReferencesById, syncId);
    this.emit('documentsChanged', Array.from(latestReferencesById.keys()));

    void this.shardManager.pruneHeaders(latest.manifest);
    await this.updateLocalSequence();
  }

  private async collectLatestDocumentReferences(
    shardsToScan: ShardFileInfo[]
  ): Promise<Map<string, PullDocumentReference>> {
    const latestReferencesById = new Map<string, PullDocumentReference>();

    for (const shardInfo of shardsToScan) {
      const header = await this.shardManager.fetchHeader(shardInfo);
      const docsToConsider =
        this.localSequence < shardInfo.range.min
          ? header.docs
          : header.docs.filter(doc => doc.seq > this.localSequence);

      for (const docInfo of docsToConsider) {
        const existingReference = latestReferencesById.get(docInfo.id);
        if (!existingReference || isDocumentARecent(docInfo, existingReference.docInfo)) {
          latestReferencesById.set(docInfo.id, { shardInfo, docInfo });
        }
      }
    }

    return latestReferencesById;
  }

  private async applyPullChanges(
    latestReferencesById: Map<string, PullDocumentReference>,
    syncId?: string
  ): Promise<void> {
    if (latestReferencesById.size === 0) {
      return;
    }

    const fetchGroupsByFilename = this.groupReferencesByShard(latestReferencesById);
    const total = latestReferencesById.size;
    let progress = 0;

    for (const group of fetchGroupsByFilename.values()) {
      await this.processPullFetchGroup(group, {
        onProgress: fetchedCount => {
          progress += fetchedCount;
          if (!syncId) {
            return;
          }

          this.emit('syncProgress', syncId, {
            stage: 'pull',
            progress,
            total,
          });
        },
      });
    }
  }

  private groupReferencesByShard(
    latestReferencesById: Map<string, PullDocumentReference>
  ): Map<string, PullFetchGroup> {
    const fetchGroupsByFilename = new Map<string, PullFetchGroup>();

    for (const reference of latestReferencesById.values()) {
      const group = fetchGroupsByFilename.get(reference.shardInfo.filename);
      if (group) {
        group.references.push(reference);
      } else {
        fetchGroupsByFilename.set(reference.shardInfo.filename, {
          shardInfo: reference.shardInfo,
          references: [reference],
        });
      }
    }

    return fetchGroupsByFilename;
  }

  private async processPullFetchGroup(
    group: PullFetchGroup,
    { onProgress }: { onProgress: (fetchedCount: number) => void }
  ): Promise<void> {
    let currentChunk: PullDocumentReference[] = [];
    let currentChunkBytes = 0;

    const flushCurrentChunk = async () => {
      if (currentChunk.length === 0) {
        return;
      }

      const docsToFetch = currentChunk.map(reference => reference.docInfo);
      currentChunk = [];
      currentChunkBytes = 0;

      const fetchedDocuments = await this.shardManager.fetchDocuments(group.shardInfo, docsToFetch);
      onProgress(fetchedDocuments.length);

      const mergedChanges = await this.options.mergeRule(this.database, fetchedDocuments);
      await this.writeMergedPullChanges(mergedChanges);
    };

    for (const reference of group.references) {
      const overflowByCount = currentChunk.length >= SYNC_PULL_WRITE_CHUNK_SIZE;
      const overflowByBytes =
        currentChunk.length > 0 &&
        currentChunkBytes + reference.docInfo.len > SYNC_PULL_WRITE_BYTE_WATERMARK;

      if (overflowByCount || overflowByBytes) {
        await flushCurrentChunk();
      }

      currentChunk.push(reference);
      currentChunkBytes += reference.docInfo.len;

      if (currentChunkBytes >= SYNC_PULL_WRITE_BYTE_WATERMARK) {
        await flushCurrentChunk();
      }
    }

    await flushCurrentChunk();
  }

  private async writeMergedPullChanges(changes: ShardDocument[]): Promise<void> {
    const upserts = changes.filter(change => !change.del);
    const deletes = changes
      .filter(change => change.del)
      .map(change => ({ ...change, data: undefined }));

    await this.writeDatabaseChangesInChunks('upsert', upserts);
    await this.writeDatabaseChangesInChunks('delete', deletes);
  }

  private async writeDatabaseChangesInChunks(
    kind: 'upsert' | 'delete',
    docs: ShardDocument[]
  ): Promise<void> {
    for (let offset = 0; offset < docs.length; offset += SYNC_PULL_WRITE_CHUNK_SIZE) {
      const chunk = docs.slice(offset, offset + SYNC_PULL_WRITE_CHUNK_SIZE);
      if (chunk.length === 0) {
        continue;
      }

      if (kind === 'upsert') {
        await this.database.upsert(chunk);
      } else {
        await this.database.delete(chunk);
      }
    }
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
