import { z } from 'zod';
import { BLOBS_DIR } from '@/constants';
import { getMimeTypeByExtension } from '@/utils/mime';
import type { EngineContext } from '../types';
import type { StorageBackend } from '@/types';

const MAX_FILENAME_SIZE = 128;
const BLOB_EXTENSION = '.clb';
const FOOTER_LENGTH_BYTES = 4;
const FOOTER_VERSION = 1;
const MAX_FOOTER_SIZE = 64 * 1024;
const DEFAULT_BLOB_CHUNK_SIZE = 1024 * 1024;
const LITTLE_ENDIAN = true;

interface BlobFooter {
  version: number;
  encrypted: boolean;
  plainSize: number;
  chunkSize: number;
  storedChunkSize: number;
  metadata: BlobMetadata;
}

interface BlobFileData {
  payload: Uint8Array;
  footer: BlobFooter;
}

interface BlobChunkLayout {
  chunkCount: number;
  fullChunkCount: number;
  lastPlainChunkSize: number;
  lastStoredChunkSize: number;
  expectedPayloadSize: number;
}

export interface BlobMetadata {
  name?: string;
  mimeType?: string;
  createdAt?: number;
}

const blobMetadataSchema: z.ZodType<BlobMetadata> = z.object({
  name: z.string().min(1).max(MAX_FILENAME_SIZE).optional(),
  mimeType: z.string().min(1).optional(),
  createdAt: z.number().finite().int().nonnegative().optional(),
});

const blobFooterSchema = z
  .object({
    version: z.literal(FOOTER_VERSION),
    encrypted: z.boolean(),
    plainSize: z.number().int().nonnegative(),
    chunkSize: z.number().int().positive(),
    storedChunkSize: z.number().int().positive(),
    metadata: blobMetadataSchema.optional().default({}),
  })
  .superRefine((footer, ctx) => {
    if (footer.storedChunkSize < footer.chunkSize) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'storedChunkSize must be greater than or equal to chunkSize',
        path: ['storedChunkSize'],
      });
    }
  });

export interface StoredBlob {
  digest: string;
  file(): Promise<File>;
  metadata(): Promise<BlobMetadata>;
  stream(): ReadableStream<Uint8Array>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export class ClxBlobs {
  private storage: StorageBackend;
  private cryptoManager: EngineContext['cryptoManager'];

  constructor({ storage, cryptoManager }: Pick<EngineContext, 'storage' | 'cryptoManager'>) {
    this.storage = storage;
    this.cryptoManager = cryptoManager;
  }

  getBlob(digest: string): Promise<StoredBlob> {
    this.assertDigest(digest);

    const path = this.getBlobPath(digest);
    let footerPromise: Promise<BlobFooter> | null = null;
    let filePromise: Promise<BlobFileData> | null = null;
    let plainBytesPromise: Promise<Uint8Array> | null = null;

    const getFooter = () => {
      if (!footerPromise) {
        footerPromise = this.fetchFooterByRange(path);
      }

      return footerPromise;
    };

    const getFile = () => {
      if (!filePromise) {
        filePromise = this.fetchBlobByFullRead(path);
      }

      return filePromise;
    };

    const getPlainBytes = () => {
      if (!plainBytesPromise) {
        plainBytesPromise = getFile().then(({ payload, footer }) =>
          this.decodePayloadToPlainBytes(digest, payload, footer)
        );
      }

      return plainBytesPromise;
    };

    return Promise.resolve({
      digest,
      metadata: async () => {
        const footer = await getFooter();
        return footer.metadata;
      },
      stream: () => this.createBlobStream(digest, getFile),
      arrayBuffer: async () => {
        const plainBytes = await getPlainBytes();
        return this.toArrayBuffer(plainBytes);
      },
      file: async () => {
        const [{ footer }, plainBytes] = await Promise.all([getFile(), getPlainBytes()]);
        const name = footer.metadata.name ?? digest;
        const mimeType =
          footer.metadata.mimeType ??
          this.inferContentTypeFromPath(name) ??
          'application/octet-stream';
        const plainBuffer = this.toArrayBuffer(plainBytes);

        return new File([plainBuffer], name, {
          type: mimeType,
          lastModified: footer.metadata.createdAt ?? Date.now(),
        });
      },
    });
  }

  async putBlob(data: ArrayBuffer | Blob | File, metadata?: BlobMetadata): Promise<string> {
    const source = data instanceof Blob ? data : new Blob([data]);
    const plainBytes = new Uint8Array(await source.arrayBuffer());
    const digest = await this.calculateDigest(plainBytes);
    this.assertDigest(digest);

    const normalizedMetadata = this.normalizeMetadata(data, metadata);
    const encryptChunk = await this.cryptoManager.encryptBlobChunk(digest);
    const chunkSize = DEFAULT_BLOB_CHUNK_SIZE;
    const storedChunkSize = this.cryptoManager.getBlobChunkSize(chunkSize);
    const storedChunks: Uint8Array[] = [];

    let payloadLength = 0;
    for (let offset = 0; offset < plainBytes.length; offset += chunkSize) {
      const plainChunk = plainBytes.subarray(
        offset,
        Math.min(offset + chunkSize, plainBytes.length)
      );
      const storedChunk = await encryptChunk(plainChunk);
      payloadLength += storedChunk.length;
      storedChunks.push(storedChunk);
    }

    const footer: BlobFooter = {
      version: FOOTER_VERSION,
      encrypted: this.cryptoManager.isEncryptionEnabled(),
      plainSize: plainBytes.length,
      chunkSize,
      storedChunkSize,
      metadata: normalizedMetadata,
    };

    const footerBytes = new TextEncoder().encode(JSON.stringify(footer));
    if (footerBytes.length > MAX_FOOTER_SIZE) {
      throw new Error('Blob footer is too large');
    }

    if (footerBytes.length > 0xffff_ffff) {
      throw new Error('Blob footer exceeds uint32 size');
    }

    const output = new Uint8Array(payloadLength + footerBytes.length + FOOTER_LENGTH_BYTES);
    let cursor = 0;
    for (const storedChunk of storedChunks) {
      output.set(storedChunk, cursor);
      cursor += storedChunk.length;
    }

    output.set(footerBytes, cursor);
    cursor += footerBytes.length;
    new DataView(output.buffer, output.byteOffset, output.byteLength).setUint32(
      cursor,
      footerBytes.length,
      LITTLE_ENDIAN
    );

    const blobDirectory = this.getBlobDirectory(digest);
    const blobPath = this.getBlobPath(digest);

    await this.storage.ensureDirectory(blobDirectory);
    try {
      await this.storage.write(blobPath, output);
    } catch (error) {
      const existingStat = await this.storage.stat(blobPath).catch(() => null);
      if (!existingStat) {
        throw error;
      }
    }

    return digest;
  }

  async deleteBlob(digest: string): Promise<string> {
    this.assertDigest(digest);
    await this.storage.delete(this.getBlobPath(digest));
    return digest;
  }

  destroy(): void {
    return;
  }

  private getBlobDirectory(digest: string): string {
    return `${BLOBS_DIR}/${digest.slice(0, 2)}`;
  }

  private getBlobPath(digest: string): string {
    return `${this.getBlobDirectory(digest)}/${digest}${BLOB_EXTENSION}`;
  }

  private inferContentTypeFromPath(path: string): string | null {
    const filename = path.split('/').pop();
    if (!filename) {
      return null;
    }

    const extension = filename.split('.').pop()?.toLowerCase();
    if (!extension || extension === filename) {
      return null;
    }

    return getMimeTypeByExtension(extension);
  }

  private async calculateDigest(data: Uint8Array): Promise<string> {
    const digestBuffer = await crypto.subtle.digest('SHA-256', data as Uint8Array<ArrayBuffer>);
    return Array.from(new Uint8Array(digestBuffer))
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  private assertDigest(digest: string): void {
    if (!/^[a-fA-F0-9]{64}$/u.test(digest)) {
      throw new Error('Invalid blob digest');
    }
  }

  private normalizeMetadata(
    data: ArrayBuffer | Blob | File,
    metadata?: BlobMetadata
  ): BlobMetadata {
    const metadataName = metadata?.name;
    const fileName = data instanceof File ? data.name : undefined;
    const nameCandidate = metadataName ?? fileName;
    const normalizedName = nameCandidate ? this.limitFileName(nameCandidate) : undefined;

    const metadataMimeType = metadata?.mimeType?.trim();
    const sourceMimeType = data instanceof Blob && data.type.trim() ? data.type.trim() : null;
    const inferredMimeType = normalizedName
      ? this.inferContentTypeFromPath(normalizedName)
      : fileName
        ? this.inferContentTypeFromPath(fileName)
        : null;

    const mimeType = metadataMimeType || sourceMimeType || inferredMimeType || undefined;

    const sourceCreatedAt = data instanceof File ? data.lastModified : undefined;
    const createdAtCandidate = metadata?.createdAt ?? sourceCreatedAt ?? Date.now();
    const createdAt = Number.isFinite(createdAtCandidate)
      ? Math.floor(createdAtCandidate)
      : Date.now();

    return {
      ...(normalizedName ? { name: normalizedName } : {}),
      ...(mimeType ? { mimeType } : {}),
      createdAt,
    };
  }

  private limitFileName(name: string): string {
    if (name.length <= MAX_FILENAME_SIZE) {
      return name;
    }

    return name.slice(0, MAX_FILENAME_SIZE);
  }

  private async fetchFooterByRange(path: string): Promise<BlobFooter> {
    const stat = await this.storage.stat(path);
    if (!stat) {
      throw new Error(`Blob not found: ${path}`);
    }

    if (stat.size < FOOTER_LENGTH_BYTES) {
      throw new Error('Invalid blob format: footer length is missing');
    }

    const footerLengthBytes = await this.storage.read(path, {
      start: stat.size - FOOTER_LENGTH_BYTES,
      end: stat.size - 1,
    });

    const footerLength = this.parseFooterLength(footerLengthBytes, stat.size);
    const footerStart = stat.size - FOOTER_LENGTH_BYTES - footerLength;

    const footerBytes = await this.storage.read(path, {
      start: footerStart,
      end: stat.size - FOOTER_LENGTH_BYTES - 1,
    });

    if (footerBytes.length !== footerLength) {
      throw new Error('Invalid blob format: footer length mismatch');
    }

    return this.parseFooter(footerBytes);
  }

  private async fetchBlobByFullRead(path: string): Promise<BlobFileData> {
    const bytes = await this.storage.read(path);
    if (bytes.length < FOOTER_LENGTH_BYTES) {
      throw new Error('Invalid blob format: footer length is missing');
    }

    const footerLengthStart = bytes.length - FOOTER_LENGTH_BYTES;
    const footerLengthBytes = bytes.subarray(footerLengthStart);
    const footerLength = this.parseFooterLength(footerLengthBytes, bytes.length);
    const footerStart = bytes.length - FOOTER_LENGTH_BYTES - footerLength;

    const payload = bytes.subarray(0, footerStart);
    const footer = this.parseFooter(bytes.subarray(footerStart, footerLengthStart));
    this.getChunkLayout(footer, payload.length);

    return { payload, footer };
  }

  private parseFooterLength(footerLengthBytes: Uint8Array, totalSize: number): number {
    if (footerLengthBytes.length !== FOOTER_LENGTH_BYTES) {
      throw new Error('Invalid blob format: malformed footer length bytes');
    }

    const footerLength = new DataView(
      footerLengthBytes.buffer,
      footerLengthBytes.byteOffset,
      footerLengthBytes.byteLength
    ).getUint32(0, LITTLE_ENDIAN);

    if (footerLength === 0) {
      throw new Error('Invalid blob format: footer length must be greater than zero');
    }

    if (footerLength > MAX_FOOTER_SIZE) {
      throw new Error('Invalid blob format: footer length exceeds max size');
    }

    if (footerLength > totalSize - FOOTER_LENGTH_BYTES) {
      throw new Error('Invalid blob format: footer length exceeds file size');
    }

    return footerLength;
  }

  private parseFooter(footerBytes: Uint8Array): BlobFooter {
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(footerBytes)) as unknown;
    } catch {
      throw new Error('Invalid blob format: footer is not valid JSON');
    }

    const parsedFooter = blobFooterSchema.safeParse(parsed);
    if (!parsedFooter.success) {
      throw new Error(`Invalid blob format: ${parsedFooter.error.message}`);
    }

    return parsedFooter.data;
  }

  private getChunkLayout(footer: BlobFooter, payloadLength: number): BlobChunkLayout {
    if (footer.plainSize === 0) {
      if (payloadLength !== 0) {
        throw new Error('Invalid blob format: payload length mismatch');
      }

      return {
        chunkCount: 0,
        fullChunkCount: 0,
        lastPlainChunkSize: 0,
        lastStoredChunkSize: 0,
        expectedPayloadSize: 0,
      };
    }

    const chunkCount = Math.ceil(footer.plainSize / footer.chunkSize);
    const fullChunkCount = chunkCount - 1;
    const lastPlainChunkSize = footer.plainSize - fullChunkCount * footer.chunkSize;
    const chunkOverhead = footer.storedChunkSize - footer.chunkSize;

    if (footer.encrypted && chunkOverhead <= 0) {
      throw new Error('Invalid blob format: encrypted chunk overhead is malformed');
    }

    if (!footer.encrypted && chunkOverhead !== 0) {
      throw new Error('Invalid blob format: unencrypted chunk overhead is malformed');
    }

    const lastStoredChunkSize = footer.encrypted
      ? lastPlainChunkSize + chunkOverhead
      : lastPlainChunkSize;

    const expectedPayloadSize = fullChunkCount * footer.storedChunkSize + lastStoredChunkSize;
    if (expectedPayloadSize !== payloadLength) {
      throw new Error('Invalid blob format: payload size does not match footer');
    }

    return {
      chunkCount,
      fullChunkCount,
      lastPlainChunkSize,
      lastStoredChunkSize,
      expectedPayloadSize,
    };
  }

  private async *iteratePlainChunks(
    digest: string,
    payload: Uint8Array,
    footer: BlobFooter
  ): AsyncGenerator<Uint8Array, void, undefined> {
    const layout = this.getChunkLayout(footer, payload.length);
    if (layout.chunkCount === 0) {
      return;
    }

    const decryptChunk = footer.encrypted
      ? await this.cryptoManager.decryptBlobChunk(digest)
      : null;

    let cursor = 0;
    for (let index = 0; index < layout.chunkCount; index++) {
      const plainChunkSize =
        index < layout.fullChunkCount ? footer.chunkSize : layout.lastPlainChunkSize;
      const storedChunkSize =
        index < layout.fullChunkCount ? footer.storedChunkSize : layout.lastStoredChunkSize;

      const storedChunk = payload.subarray(cursor, cursor + storedChunkSize);
      if (storedChunk.length !== storedChunkSize) {
        throw new Error('Invalid blob format: chunk size mismatch');
      }
      cursor += storedChunkSize;

      if (!decryptChunk) {
        if (storedChunk.length !== plainChunkSize) {
          throw new Error('Invalid blob format: plain chunk size mismatch');
        }

        yield storedChunk;
        continue;
      }

      const plainChunk = await decryptChunk(storedChunk);
      if (plainChunk.length !== plainChunkSize) {
        throw new Error('Invalid blob format: decrypted chunk size mismatch');
      }

      yield plainChunk;
    }

    if (cursor !== layout.expectedPayloadSize) {
      throw new Error('Invalid blob format: payload cursor mismatch');
    }
  }

  private async decodePayloadToPlainBytes(
    digest: string,
    payload: Uint8Array,
    footer: BlobFooter
  ): Promise<Uint8Array> {
    const plainBytes = new Uint8Array(footer.plainSize);
    let cursor = 0;

    for await (const chunk of this.iteratePlainChunks(digest, payload, footer)) {
      plainBytes.set(chunk, cursor);
      cursor += chunk.length;
    }

    if (cursor !== footer.plainSize) {
      throw new Error('Invalid blob format: plain payload size mismatch');
    }

    return plainBytes;
  }

  private createBlobStream(
    digest: string,
    getBlobFile: () => Promise<BlobFileData>
  ): ReadableStream<Uint8Array> {
    let iterator: AsyncGenerator<Uint8Array, void, undefined> | null = null;

    return new ReadableStream<Uint8Array>({
      pull: async controller => {
        try {
          if (!iterator) {
            const { payload, footer } = await getBlobFile();
            iterator = this.iteratePlainChunks(digest, payload, footer);
          }

          const next = await iterator.next();
          if (next.done) {
            controller.close();
            return;
          }

          controller.enqueue(next.value);
        } catch (error) {
          controller.error(error);
        }
      },
      cancel: async () => {
        if (iterator?.return) {
          await iterator.return(undefined);
        }
      },
    });
  }

  private toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const copy = new Uint8Array(bytes);
    return copy.buffer;
  }
}
