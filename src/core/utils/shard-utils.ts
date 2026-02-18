import { LITTLE_ENDIAN, SHARD_HEADER_LENGTH_BYTES, SHARD_VERSION } from '@/constants';
import { shardHeaderSchema } from '@/schemas';
import type { ShardHeader, ShardDocument } from '@/types';

export interface EncodedShard {
  data: Uint8Array;
  header: ShardHeader;
}

export function buildShardBodyParts(documents: ShardDocument[]): Uint8Array<ArrayBuffer>[] {
  return documents.map(row => {
    const docData = row.del ? null : row.data;
    const bodyJson = JSON.stringify(docData);
    return new Uint8Array(new TextEncoder().encode(bodyJson));
  });
}

export function buildShardHeader(documents: ShardDocument[], bodyParts: Uint8Array[]): ShardHeader {
  return buildShardHeaderFromLengths(
    documents,
    bodyParts.map(bodyPart => bodyPart.length)
  );
}

export function buildShardHeaderFromLengths(
  documents: ShardDocument[],
  bodyPartLengths: number[]
): ShardHeader {
  if (documents.length !== bodyPartLengths.length) {
    throw new Error('Mismatched documents and body lengths');
  }

  const header: ShardHeader = { version: SHARD_VERSION, docs: [] };
  let currentOffset = 0;

  documents.forEach((row, index) => {
    const bodyLength = bodyPartLengths[index];
    if (bodyLength === undefined) {
      throw new Error('Mismatched documents and body lengths');
    }

    header.docs.push({
      id: row.id,
      at: row.at,
      seq: row.seq,
      del: row.del,
      offset: currentOffset,
      len: bodyLength,
    });
    currentOffset += bodyLength;
  });

  return header;
}

export function parseShardHeader(data: Uint8Array): ShardHeader {
  const headerJson = new TextDecoder().decode(data);
  const parsed = JSON.parse(headerJson) as unknown;
  const result = shardHeaderSchema.safeParse(parsed);

  if (result.success) {
    return result.data;
  } else {
    throw new Error(`Invalid shard header format: ${result.error.message}`);
  }
}

export function getHeaderLength(data: Uint8Array): number {
  return new DataView(data.buffer).getUint32(0, LITTLE_ENDIAN);
}

export async function calculateHash(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data as Uint8Array<ArrayBuffer>);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function extractBodyOffset(headerLength: number): number {
  return SHARD_HEADER_LENGTH_BYTES + headerLength;
}

interface ShardLevelOptions {
  desiredShardSize: number;
  maxShardLevel: number;
  compactionThreshold: number;
}

export function getShardLevel(
  { desiredShardSize, maxShardLevel, compactionThreshold }: ShardLevelOptions,
  size: number
): number {
  const initialShardSize = desiredShardSize / compactionThreshold ** maxShardLevel;
  return Math.min(
    Math.max(0, Math.round(Math.log(size / initialShardSize) / Math.log(compactionThreshold))),
    maxShardLevel
  );
}
