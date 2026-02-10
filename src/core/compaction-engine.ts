import {
  encodeShardFromDocInfos,
  calculateHash,
  parseShardHeader,
  getHeaderLength,
  extractBodyOffset,
} from './shard-utils';
import type { StorageBackend, ShardFileInfo, ShardDocInfo } from '../types';

const SHARDS_DIR = 'shards';
const LEVEL_1 = 1 as const;
const LEVEL_2 = 2 as const;

export interface CompactionResult {
  newShard: ShardFileInfo;
  mergedDocs: ShardDocInfo[];
  removedShards: ShardFileInfo[];
}

export class CompactionEngine {
  private backend: StorageBackend;
  private desiredShardSize: number;
  private compactionThreshold: number;

  constructor(
    backend: StorageBackend,
    options: {
      desiredShardSize: number;
      compactionThreshold: number;
    }
  ) {
    this.backend = backend;
    this.desiredShardSize = options.desiredShardSize;
    this.compactionThreshold = options.compactionThreshold;
  }

  shouldCompact(level0Shards: ShardFileInfo[]): boolean {
    return level0Shards.length >= this.compactionThreshold;
  }

  async compact(level0Shards: ShardFileInfo[]): Promise<CompactionResult | null> {
    if (!this.shouldCompact(level0Shards)) {
      return null;
    }

    const allDocs = await this.collectAllDocs(level0Shards);
    const mergedDocs = this.mergeAndDeduplicateDocs(allDocs);

    if (mergedDocs.length === 0) {
      return null;
    }

    const { data: shardData } = encodeShardFromDocInfos(mergedDocs);
    const hash = await calculateHash(shardData);
    const filename = `shard_${hash}.clx`;

    await this.backend.write(`${SHARDS_DIR}/${filename}`, shardData);

    const level = shardData.length >= this.desiredShardSize ? LEVEL_2 : LEVEL_1;

    const newShard: ShardFileInfo = {
      filename,
      level,
      range: {
        min: mergedDocs[0].seq,
        max: mergedDocs[mergedDocs.length - 1].seq,
      },
    };

    return {
      newShard,
      mergedDocs,
      removedShards: level0Shards,
    };
  }

  private async collectAllDocs(shards: ShardFileInfo[]): Promise<Map<string, ShardDocInfo>> {
    const allDocs = new Map<string, ShardDocInfo>();

    for (const shardInfo of shards) {
      try {
        const header = await this.fetchShardHeader(shardInfo);
        for (const doc of header.docs) {
          const existing = allDocs.get(doc.id);
          if (!existing || doc.seq > existing.seq) {
            allDocs.set(doc.id, doc);
          }
        }
      } catch (error) {
        console.warn(`Failed to fetch shard header: ${shardInfo.filename}`, error);
      }
    }

    return allDocs;
  }

  private mergeAndDeduplicateDocs(allDocs: Map<string, ShardDocInfo>): ShardDocInfo[] {
    const mergedDocs = Array.from(allDocs.values());
    mergedDocs.sort((a, b) => a.seq - b.seq);
    return mergedDocs;
  }

  private async fetchShardHeader(shardInfo: ShardFileInfo): Promise<{
    docs: ShardDocInfo[];
  }> {
    const path = `${SHARDS_DIR}/${shardInfo.filename}`;
    const headerLenBytes = await this.backend.read(path, { start: 0, end: 3 });
    const headerLen = getHeaderLength(headerLenBytes);
    const headerBytes = await this.backend.read(path, {
      start: 4,
      end: 4 + headerLen - 1,
    });
    return parseShardHeader(headerBytes);
  }

  async fetchDocumentBody(shardInfo: ShardFileInfo, docInfo: ShardDocInfo): Promise<unknown> {
    const path = `${SHARDS_DIR}/${shardInfo.filename}`;
    const headerLenBytes = await this.backend.read(path, { start: 0, end: 3 });
    const headerLen = getHeaderLength(headerLenBytes);
    const bodyOffset = extractBodyOffset(headerLen);

    const docBytes = await this.backend.read(path, {
      start: bodyOffset + docInfo.offset,
      end: bodyOffset + docInfo.offset + docInfo.len - 1,
    });

    const docJson = new TextDecoder().decode(docBytes);
    return JSON.parse(docJson);
  }
}
