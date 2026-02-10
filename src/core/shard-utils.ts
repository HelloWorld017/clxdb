import { shardHeaderSchema } from '@/schemas';
import type { ShardHeader, ShardDocInfo, DocOperation } from '../types';

const HEADER_LENGTH_BYTES = 4;
const LITTLE_ENDIAN = true;

export interface EncodedShard {
  data: Uint8Array;
  header: ShardHeader;
}

export function encodeShard(operations: DocOperation[]): EncodedShard {
  const header: ShardHeader = { docs: [] };
  const bodyParts: Uint8Array[] = [];
  let currentOffset = 0;

  for (const op of operations) {
    const docData =
      op.type === 'DELETE'
        ? { id: op.id, _rev: op.rev, _seq: op.seq, _deleted: true }
        : { id: op.id, _rev: op.rev, _seq: op.seq, ...op.data };
    const bodyJson = JSON.stringify(docData);
    const bodyBytes = new TextEncoder().encode(bodyJson);

    header.docs.push({
      id: op.id,
      rev: op.rev,
      seq: op.seq,
      del: op.type === 'DELETE',
      offset: currentOffset,
      len: bodyBytes.length,
    });

    bodyParts.push(bodyBytes);
    currentOffset += bodyBytes.length;
  }

  return {
    data: serializeShard(header, bodyParts),
    header,
  };
}

export function encodeShardFromDocInfos(docs: ShardDocInfo[]): EncodedShard {
  const header: ShardHeader = { docs: [] };
  const bodyParts: Uint8Array[] = [];
  let currentOffset = 0;

  for (const docInfo of docs) {
    const docData = {
      id: docInfo.id,
      _rev: docInfo.rev,
      _seq: docInfo.seq,
      _deleted: docInfo.del,
    };
    const bodyJson = JSON.stringify(docData);
    const bodyBytes = new TextEncoder().encode(bodyJson);

    header.docs.push({
      id: docInfo.id,
      rev: docInfo.rev,
      seq: docInfo.seq,
      del: docInfo.del,
      offset: currentOffset,
      len: bodyBytes.length,
    });

    bodyParts.push(bodyBytes);
    currentOffset += bodyBytes.length;
  }

  return {
    data: serializeShard(header, bodyParts),
    header,
  };
}

function serializeShard(header: ShardHeader, bodyParts: Uint8Array[]): Uint8Array {
  const headerJson = JSON.stringify(header);
  const headerBytes = new TextEncoder().encode(headerJson);
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
  const headerLen = new DataView(data.buffer).getUint32(0, LITTLE_ENDIAN);
  const headerBytes = data.slice(HEADER_LENGTH_BYTES, HEADER_LENGTH_BYTES + headerLen);
  const headerJson = new TextDecoder().decode(headerBytes);
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
