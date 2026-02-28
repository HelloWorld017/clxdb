import {
  CACHE_HEADERS_KEY,
  CACHE_HEADERS_VERSION,
  LITTLE_ENDIAN,
  SHARD_EXTENSION,
  SHARD_HEADER_LENGTH_BYTES,
  SHARDS_DIR,
} from '@/constants';
import { shardHeaderCacheSchema } from '@/schemas';
import { createPromisePool } from '@/utils/promise-pool';
import {
  getHeaderLength,
  parseShardHeader,
  buildShardBodyParts,
  buildShardHeaderFromLengths,
  calculateHash,
  getShardLevel,
} from '../utils/shard-utils';
import type { CacheManager } from './cache-manager';
import type { CryptoManager } from './crypto-manager';
import type {
  StorageBackend,
  ShardFileInfo,
  ShardHeader,
  ShardDocInfo,
  ShardDocument,
  ClxDBOptions,
  ShardHeaderCache,
} from '@/types';

interface CachedShardEntry {
  header: ShardHeader;
  headerSize: number;
}

export class ShardManager {
  private storage: StorageBackend;
  private headers: Map<string, CachedShardEntry> = new Map();
  private options: ClxDBOptions;
  private cacheManager: CacheManager;
  private cryptoManager: CryptoManager;
  private cacheLoaded: boolean = false;

  constructor(
    storage: StorageBackend,
    cacheManager: CacheManager,
    cryptoManager: CryptoManager,
    options: ClxDBOptions
  ) {
    this.storage = storage;
    this.cacheManager = cacheManager;
    this.cryptoManager = cryptoManager;
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
    return this.headers.get(filename)?.header;
  }

  getAllHeaders(): Map<string, ShardHeader> {
    return new Map(
      Array.from(this.headers.entries()).map(
        ([filename, { header }]) => [filename, header] as const
      )
    );
  }

  async fetchHeader(shardInfo: ShardFileInfo): Promise<ShardHeader> {
    const cached = await this.fetchHeaderWithSize(shardInfo);
    return cached.header;
  }

  async fetchHeaders(shardInfoList: ShardFileInfo[]): Promise<ShardHeader[]> {
    return createPromisePool(shardInfoList.values().map(shardInfo => this.fetchHeader(shardInfo)));
  }

  addHeader(filename: string, header: ShardHeader, headerSize: number) {
    if (!this.headers.has(filename)) {
      this.headers.set(filename, { header, headerSize });
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
    const header = this.headers.get(filename)?.header;
    if (!header) {
      return undefined;
    }
    return header.docs.find(doc => doc.id === docId);
  }

  getAllDocIds(): Set<string> {
    const docIds = new Set<string>();
    for (const { header } of this.headers.values()) {
      for (const doc of header.docs) {
        docIds.add(doc.id);
      }
    }
    return docIds;
  }

  getDocsForShard(filename: string): ShardDocInfo[] {
    return this.headers.get(filename)?.header.docs ?? [];
  }

  async fetchDocuments(
    shardInfo: ShardFileInfo,
    docs: ShardDocInfo[] | null
  ): Promise<ShardDocument[]> {
    const cached = await this.fetchHeaderWithSize(shardInfo);
    if (!docs) {
      docs = cached.header.docs;
    }

    if (docs.length === 0) {
      return [];
    }

    const path = `${SHARDS_DIR}/${shardInfo.filename}`;
    const shardHash = this.getShardHashFromFilename(shardInfo.filename);
    const decryptPart = await this.cryptoManager.decryptShardPart(shardHash);
    const bodyOffset = SHARD_HEADER_LENGTH_BYTES + cached.headerSize;

    const ranges = docs.map(doc => ({
      start: bodyOffset + doc.offset,
      end: bodyOffset + doc.offset + doc.len - 1,
    }));
    const start = Math.min(...ranges.map(range => range.start));
    const end = Math.max(...ranges.map(range => range.end));
    const fetchedDocBytes = await this.storage.read(path, { start, end });

    const result: ShardDocument[] = [];
    for (const [index, doc] of docs.entries()) {
      const range = ranges[index];
      if (!range) {
        throw new Error('Invalid shard format: missing document range');
      }

      const localStart = range.start - start;
      const localEnd = range.end - start + 1;
      const encryptedDocBytes = fetchedDocBytes.subarray(localStart, localEnd);
      if (encryptedDocBytes.length !== doc.len) {
        throw new Error('Invalid shard format: document length mismatch');
      }

      const decryptedDocBytes = await decryptPart(encryptedDocBytes);
      const docJson = JSON.parse(new TextDecoder().decode(decryptedDocBytes)) as Record<
        string,
        unknown
      >;

      result.push({
        id: doc.id,
        at: doc.at,
        seq: doc.seq,
        del: doc.del,
        data: doc.del ? undefined : docJson,
      });
    }

    return result;
  }

  private async fetchHeaderWithSize(shardInfo: ShardFileInfo): Promise<CachedShardEntry> {
    const cached = this.headers.get(shardInfo.filename);
    if (cached) {
      return cached;
    }

    const fetched = await this.fetchHeaderFromRemote(shardInfo);
    this.headers.set(shardInfo.filename, fetched);
    void this.saveToCache();
    return fetched;
  }

  private async fetchHeaderFromRemote(shardInfo: ShardFileInfo): Promise<CachedShardEntry> {
    const path = `${SHARDS_DIR}/${shardInfo.filename}`;
    const shardHash = this.getShardHashFromFilename(shardInfo.filename);
    const decryptPart = await this.cryptoManager.decryptShardPart(shardHash);
    const headerLenBytes = await this.storage.read(path, { start: 0, end: 3 });
    const headerSize = getHeaderLength(headerLenBytes);

    const headerBytes = await this.storage.read(path, {
      start: SHARD_HEADER_LENGTH_BYTES,
      end: SHARD_HEADER_LENGTH_BYTES + headerSize - 1,
    });

    const decryptedHeaderBytes = await decryptPart(new Uint8Array(headerBytes));

    return {
      header: parseShardHeader(decryptedHeaderBytes),
      headerSize,
    };
  }

  async writeShard(
    docs: ShardDocument[]
  ): Promise<{ info: ShardFileInfo; header: ShardHeader; headerSize: number }> {
    if (docs.length === 0) {
      throw new Error('Cannot write empty shard');
    }

    const plainBodyParts = buildShardBodyParts(docs);
    const encryptedBodyLengths = plainBodyParts.map(bodyPart =>
      this.cryptoManager.getShardPartSize(bodyPart.length)
    );
    const header = buildShardHeaderFromLengths(docs, encryptedBodyLengths);
    const headerPlainBytes = new Uint8Array(new TextEncoder().encode(JSON.stringify(header)));
    const encryptedHeaderLength = this.cryptoManager.getShardPartSize(headerPlainBytes.length);
    const encryptedBodyTotalLength = encryptedBodyLengths.reduce(
      (sum, partLength) => sum + partLength,
      0
    );

    const data = new Uint8Array(
      SHARD_HEADER_LENGTH_BYTES + encryptedHeaderLength + encryptedBodyTotalLength
    );

    const dataView = new DataView(data.buffer);
    dataView.setUint32(0, encryptedHeaderLength, LITTLE_ENDIAN);

    const headerOffset = SHARD_HEADER_LENGTH_BYTES;
    data.set(headerPlainBytes, headerOffset);

    let bodyOffset = headerOffset + encryptedHeaderLength;
    for (let index = 0; index < plainBodyParts.length; index++) {
      const plainBodyPart = plainBodyParts[index];
      const encryptedBodyLength = encryptedBodyLengths[index];
      if (!plainBodyPart || encryptedBodyLength === undefined) {
        throw new Error('Invalid shard body part');
      }

      data.set(plainBodyPart, bodyOffset);
      bodyOffset += encryptedBodyLength;
    }

    const hash = await calculateHash(data);
    const encryptPart = await this.cryptoManager.encryptShardPart(hash);

    const encryptedHeader = await encryptPart(headerPlainBytes);
    if (encryptedHeader.length !== encryptedHeaderLength) {
      throw new Error('Invalid encrypted header length');
    }
    data.set(encryptedHeader, headerOffset);

    bodyOffset = headerOffset + encryptedHeaderLength;
    for (let index = 0; index < plainBodyParts.length; index++) {
      const plainBodyPart = plainBodyParts[index];
      const encryptedBodyLength = encryptedBodyLengths[index];
      if (!plainBodyPart || encryptedBodyLength === undefined) {
        throw new Error('Invalid shard body part');
      }

      const encryptedBodyPart = await encryptPart(plainBodyPart);
      if (encryptedBodyPart.length !== encryptedBodyLength) {
        throw new Error('Invalid encrypted body length');
      }

      data.set(encryptedBodyPart, bodyOffset);
      bodyOffset += encryptedBodyPart.length;
    }

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
      headerSize: encryptedHeaderLength,
      info: {
        filename,
        level,
        range: { min: seqMin, max: seqMax },
      },
    };
  }

  private getShardHashFromFilename(filename: string): string {
    const suffixLength = SHARD_EXTENSION.length;
    const start = 'shard_'.length;
    const end = filename.length - suffixLength;
    return filename.slice(start, end);
  }

  private async loadFromCache(): Promise<void> {
    if (!this.options.databasePersistent) {
      return;
    }

    const cache = await this.cacheManager.readIndexedDB(CACHE_HEADERS_KEY, shardHeaderCacheSchema);
    if (cache && cache.version === CACHE_HEADERS_VERSION) {
      for (const [filename, cachedHeader] of Object.entries(cache.headers)) {
        this.headers.set(filename, {
          header: cachedHeader.header,
          headerSize: cachedHeader.headerSize,
        });
      }
    }

    this.cacheLoaded = true;
  }

  private async saveToCache(): Promise<void> {
    if (!this.options.databasePersistent) {
      return;
    }

    const cache: ShardHeaderCache = {
      version: CACHE_HEADERS_VERSION,
      headers: {},
    };

    for (const [filename, { header, headerSize }] of this.headers) {
      cache.headers[filename] = {
        filename,
        header,
        headerSize,
        cachedAt: Date.now(),
      };
    }

    await this.cacheManager.writeIndexedDB(CACHE_HEADERS_KEY, cache);
  }
}
