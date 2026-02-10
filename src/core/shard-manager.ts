import { DEFAULT_CACHE_STORAGE_KEY, SHARDS_DIR } from '@/constants';
import { getHeaderLength, parseShardHeader, extractBodyOffset } from './shard-utils';
import type {
  StorageBackend,
  ShardFileInfo,
  ShardHeader,
  ShardDocInfo,
  ShardDocument,
  ClxDBOptions,
} from '../types';

interface CachedShardHeader {
  filename: string;
  header: ShardHeader;
  cachedAt: number;
}

interface ShardHeaderCache {
  version: number;
  headers: Record<string, CachedShardHeader>;
}

const CACHE_VERSION = 1;

export class ShardManager {
  private backend: StorageBackend;
  private headers: Map<string, ShardHeader> = new Map();
  private options: ClxDBOptions;
  private cacheLoaded: boolean = false;

  constructor(backend: StorageBackend, options: ClxDBOptions) {
    this.backend = backend;
    this.options = options;
  }

  initialize(): void {
    if (!this.cacheLoaded) {
      this.loadFromCache();
    }
  }

  hasHeader(filename: string): boolean {
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
    this.saveToCache();
    return header;
  }

  async fetchMissingHeaders(shardFiles: ShardFileInfo[]): Promise<ShardFileInfo[]> {
    const missing: ShardFileInfo[] = [];

    for (const shardInfo of shardFiles) {
      if (!this.hasHeader(shardInfo.filename)) {
        missing.push(shardInfo);
      }
    }

    for (const shardInfo of missing) {
      try {
        await this.fetchHeader(shardInfo);
      } catch (error) {
        if ((error as Error).message === 'SHARD_MISSING') {
          throw error;
        }
        console.warn(`Failed to fetch header for ${shardInfo.filename}:`, error);
      }
    }

    return missing;
  }

  removeHeader(filename: string): boolean {
    const removed = this.headers.delete(filename);
    if (removed) {
      this.saveToCache();
    }
    return removed;
  }

  clear(): void {
    this.headers.clear();
    this.saveToCache();
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
    const headerLenBytes = await this.backend.read(path, { start: 0, end: 3 });
    const headerLen = getHeaderLength(headerLenBytes);
    const bodyOffset = extractBodyOffset(headerLen);

    const docBytes = await this.backend.read(path, {
      start: bodyOffset + docInfo.offset,
      end: bodyOffset + docInfo.offset + docInfo.len - 1,
    });

    const docJson = JSON.parse(new TextDecoder().decode(docBytes)) as Record<string, unknown>;
    return {
      id: docInfo.id,
      rev: docInfo.rev,
      seq: docInfo.seq,
      del: docInfo.del,
      data: docInfo.del ? undefined : docJson,
    };
  }

  private async fetchHeaderFromRemote(shardInfo: ShardFileInfo): Promise<ShardHeader> {
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
      if (
        (error as Error).message?.includes('not found') ||
        (error as Error).message?.includes('404')
      ) {
        throw new Error('SHARD_MISSING');
      }
      throw error;
    }
  }

  private getHeaderStorageKey(): string {
    return `${this.options.cacheStorageKey ?? DEFAULT_CACHE_STORAGE_KEY}/headers`;
  }

  private loadFromCache(): void {
    try {
      const cached =
        this.options.cacheStorageKey !== null && localStorage.getItem(this.getHeaderStorageKey());

      if (cached) {
        const cache = JSON.parse(cached) as unknown;
        if (
          typeof cache === 'object' &&
          cache !== null &&
          'version' in cache &&
          (cache as { version: unknown }).version === CACHE_VERSION &&
          'headers' in cache
        ) {
          const typedCache = cache as ShardHeaderCache;
          for (const [filename, cachedHeader] of Object.entries(typedCache.headers)) {
            this.headers.set(filename, cachedHeader.header);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to load shard headers from cache:', error);
    }
    this.cacheLoaded = true;
  }

  private saveToCache(): void {
    try {
      if (this.options.cacheStorageKey === null) {
        return;
      }

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

      localStorage.setItem(this.getHeaderStorageKey(), JSON.stringify(cache));
    } catch (error) {
      console.warn('Failed to save shard headers to cache:', error);
    }
  }
}
