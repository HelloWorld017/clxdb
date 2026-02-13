import { shardHeaderSchema } from '@/schemas';
import type { ShardHeader, ShardDocument } from '@/types';

const HEADER_LENGTH_BYTES = 4;
const LITTLE_ENDIAN = true;

export interface EncodedShard {
  data: Uint8Array;
  header: ShardHeader;
}

const encodeHeader = (header: ShardHeader): Uint8Array<ArrayBuffer> =>
  new Uint8Array(new TextEncoder().encode(JSON.stringify(header)));

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

  const header: ShardHeader = { docs: [] };
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

export function encodeShard(documents: ShardDocument[]): EncodedShard {
  const bodyParts = buildShardBodyParts(documents);
  const header = buildShardHeader(documents, bodyParts);

  return {
    data: serializeShard(encodeHeader(header), bodyParts),
    header,
  };
}

export function serializeShardFromHeader(header: ShardHeader, bodyParts: Uint8Array[]): Uint8Array {
  return serializeShard(encodeHeader(header), bodyParts);
}

export function serializeShard(headerBytes: Uint8Array, bodyParts: Uint8Array[]): Uint8Array {
  const headerLenBytes = new Uint8Array(HEADER_LENGTH_BYTES);
  new DataView(headerLenBytes.buffer).setUint32(0, headerBytes.length, LITTLE_ENDIAN);

  const bodyLength = bodyParts.reduce((sum, part) => sum + part.length, 0);
  const totalLen = HEADER_LENGTH_BYTES + headerBytes.length + bodyLength;
  const result = new Uint8Array(totalLen);

  let pos = 0;
  result.set(headerLenBytes, pos);
  pos += HEADER_LENGTH_BYTES;
  result.set(headerBytes, pos);
  pos += headerBytes.length;

  for (const part of bodyParts) {
    result.set(part, pos);
    pos += part.length;
  }

  return result;
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
  return HEADER_LENGTH_BYTES + headerLength;
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
