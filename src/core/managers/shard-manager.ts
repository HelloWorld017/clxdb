import { SHARD_EXTENSION, SHARDS_DIR } from '@/constants';
import { shardHeaderCacheSchema } from '@/schemas';
import { readIndexedDB, writeIndexedDB } from '@/utils/indexeddb';
import { createPromisePool } from '@/utils/promise-pool';
import {
  getHeaderLength,
  parseShardHeader,
  extractBodyOffset,
  encodeShard,
  calculateHash,
  getShardLevel,
} from '../utils/shard-utils';
import type {
  StorageBackend,
  ShardFileInfo,
  ShardHeader,
  ShardDocInfo,
  ShardDocument,
  ClxDBOptions,
  ShardHeaderCache,
} from '@/types';

const CACHE_VERSION = 1;
const HEADERS_KEY = 'headers';

export class ShardManager {
  private storage: StorageBackend;
  private headers: Map<string, ShardHeader> = new Map();
  private options: ClxDBOptions;
  private cacheLoaded: boolean = false;

  constructor(storage: StorageBackend, options: ClxDBOptions) {
    this.storage = storage;
    this.options = options;
  }

  async initialize(): Promise<void> {
    if (!this.cacheLoaded) {
      await this.loadFromCache();
    }
  }

  has(filename: string): boolean {
    return this.headers.has(filename);
  }

  getHeader(filename: string): ShardHeader | undefined {
    return this.headers.get(filename);
  }

  getAllHeaders(): Map<string, ShardHeader> {
    return new Map(this.headers);
  }

  async fetchHeader(shardInfo: ShardFileInfo): Promise<ShardHeader> {
    const cached = this.headers.get(shardInfo.filename);
    if (cached) {
      return cached;
    }

    const header = await this.fetchHeaderFromRemote(shardInfo);
    this.headers.set(shardInfo.filename, header);
    void this.saveToCache();
    return header;
  }

  async fetchHeaders(shardInfoList: ShardFileInfo[]): Promise<ShardHeader[]> {
    return createPromisePool(shardInfoList.values().map(shardInfo => this.fetchHeader(shardInfo)));
  }

  addHeader(filename: string, header: ShardHeader) {
    if (!this.headers.has(filename)) {
      this.headers.set(filename, header);
      void this.saveToCache();
    }
  }

  removeHeader(filename: string) {
    if (this.headers.delete(filename)) {
      void this.saveToCache();
    }
  }

  clear(): void {
    this.headers.clear();
    void this.saveToCache();
  }

  getDocInfo(filename: string, docId: string): ShardDocInfo | undefined {
    const header = this.headers.get(filename);
    if (!header) {
      return undefined;
    }
    return header.docs.find(doc => doc.id === docId);
  }

  getAllDocIds(): Set<string> {
    const docIds = new Set<string>();
    for (const header of this.headers.values()) {
      for (const doc of header.docs) {
        docIds.add(doc.id);
      }
    }
    return docIds;
  }

  getDocsForShard(filename: string): ShardDocInfo[] {
    const header = this.headers.get(filename);
    return header?.docs ?? [];
  }

  async fetchDocument(shardInfo: ShardFileInfo, docInfo: ShardDocInfo): Promise<ShardDocument> {
    const path = `${SHARDS_DIR}/${shardInfo.filename}`;
    const headerLenBytes = await this.storage.read(path, { start: 0, end: 3 });
    const headerLen = getHeaderLength(headerLenBytes);
    const bodyOffset = extractBodyOffset(headerLen);

    const docBytes = await this.storage.read(path, {
      start: bodyOffset + docInfo.offset,
      end: bodyOffset + docInfo.offset + docInfo.len - 1,
    });

    const docJson = JSON.parse(new TextDecoder().decode(docBytes)) as Record<string, unknown>;
    return {
      id: docInfo.id,
      at: docInfo.at,
      seq: docInfo.seq,
      del: docInfo.del,
      data: docInfo.del ? undefined : docJson,
    };
  }

  private async fetchHeaderFromRemote(shardInfo: ShardFileInfo): Promise<ShardHeader> {
    const path = `${SHARDS_DIR}/${shardInfo.filename}`;
    const headerLenBytes = await this.storage.read(path, { start: 0, end: 3 });
    const headerLen = getHeaderLength(headerLenBytes);

    const headerBytes = await this.storage.read(path, {
      start: 4,
      end: 4 + headerLen - 1,
    });

    return parseShardHeader(headerBytes);
  }

  async writeShard(docs: ShardDocument[]): Promise<{ info: ShardFileInfo; header: ShardHeader }> {
    const { data, header } = encodeShard(docs);
    const hash = await calculateHash(data);
    const filename = `shard_${hash}${SHARD_EXTENSION}`;
    const shardPath = `${SHARDS_DIR}/${filename}`;

    try {
      await this.storage.write(shardPath, data);
    } catch (error) {
      const existingStat = await this.storage.stat(shardPath).catch(() => null);
      if (!existingStat) {
        throw error;
      }
    }

    const seqMax = Math.max(...header.docs.map(d => d.seq));
    const seqMin = Math.min(...header.docs.map(d => d.seq));
    const level = getShardLevel(this.options, data.length);

    return {
      header,
      info: {
        filename,
        level,
        range: { min: seqMin, max: seqMax },
      },
    };
  }

  private async loadFromCache(): Promise<void> {
    const cache = await readIndexedDB(HEADERS_KEY, this.options, shardHeaderCacheSchema);
    if (cache && cache.version === CACHE_VERSION) {
      for (const [filename, cachedHeader] of Object.entries(cache.headers)) {
        this.headers.set(filename, cachedHeader.header);
      }
    }

    this.cacheLoaded = true;
  }

  private async saveToCache(): Promise<void> {
    const cache: ShardHeaderCache = {
      version: CACHE_VERSION,
      headers: {},
    };

    for (const [filename, header] of this.headers) {
      cache.headers[filename] = {
        filename,
        header,
        cachedAt: Date.now(),
      };
    }

    await writeIndexedDB(HEADERS_KEY, this.options, cache);
  }
}
