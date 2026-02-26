import {
  BLOB_CHUNK_SIZE,
  BLOB_EXTENSION,
  BLOB_FOOTER_LENGTH_BYTES,
  BLOB_MAX_FILENAME_SIZE,
  BLOB_VERSION,
  BLOBS_DIR,
  LITTLE_ENDIAN,
} from '@/constants';
import { blobFooterSchema } from '@/schemas';
import { getMimeTypeByExtension } from '@/utils/mime';
import type { EngineContext } from '../types';
import type { BlobFooter, BlobMetadata, StorageBackend, StoredBlob } from '@/types';

interface BlobFileData {
  payload: Uint8Array<ArrayBuffer>;
  footer: BlobFooter;
}

interface BlobChunkLayout {
  chunkCount: number;
  fullChunkCount: number;
  lastPlainChunkSize: number;
  lastStoredChunkSize: number;
  expectedPayloadSize: number;
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
    let plainBytesPromise: Promise<Uint8Array<ArrayBuffer>> | null = null;

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
        return plainBytes.buffer;
      },
      file: async () => {
        const [{ footer }, plainBytes] = await Promise.all([getFile(), getPlainBytes()]);
        const name = footer.metadata.name ?? digest;
        const mimeType =
          footer.metadata.mimeType ??
          this.inferContentTypeFromPath(name) ??
          'application/octet-stream';

        return new File([plainBytes.buffer], name, {
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
    const chunkSize = BLOB_CHUNK_SIZE;
    const storedChunkSize = this.cryptoManager.getBlobChunkSize(chunkSize);
    const storedChunks: Uint8Array<ArrayBuffer>[] = [];

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
      version: BLOB_VERSION,
      encrypted: this.cryptoManager.isEncryptionEnabled(),
      plainSize: plainBytes.length,
      chunkSize,
      storedChunkSize,
      metadata: normalizedMetadata,
    };

    const footerBytes = new TextEncoder().encode(JSON.stringify(footer));
    const output = new Uint8Array(payloadLength + footerBytes.length + BLOB_FOOTER_LENGTH_BYTES);
    let cursor = 0;
    for (const storedChunk of storedChunks) {
      output.set(storedChunk, cursor);
      cursor += storedChunk.length;
    }

    output.set(footerBytes, cursor);
    cursor += footerBytes.length;

    const dataView = new DataView(output.buffer, output.byteOffset, output.byteLength);
    dataView.setUint32(cursor, footerBytes.length, LITTLE_ENDIAN);

    const blobDirectory = this.getBlobDirectory(digest);
    const blobPath = this.getBlobPath(digest);

    await this.storage.ensureDirectory?.(blobDirectory);
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

  private async calculateDigest(data: Uint8Array<ArrayBuffer>): Promise<string> {
    const digestBuffer = await crypto.subtle.digest('SHA-256', data);
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
    if (name.length <= BLOB_MAX_FILENAME_SIZE) {
      return name;
    }

    return name.slice(0, BLOB_MAX_FILENAME_SIZE);
  }

  private async fetchFooterByRange(path: string): Promise<BlobFooter> {
    const stat = await this.storage.stat(path);
    if (!stat) {
      throw new Error(`Blob not found: ${path}`);
    }

    if (stat.size < BLOB_FOOTER_LENGTH_BYTES) {
      throw new Error('Invalid blob format: footer length is missing');
    }

    const footerLengthBytes = await this.storage.read(path, {
      start: stat.size - BLOB_FOOTER_LENGTH_BYTES,
      end: stat.size - 1,
    });

    const footerLength = this.parseFooterLength(footerLengthBytes, stat.size);
    const footerStart = stat.size - BLOB_FOOTER_LENGTH_BYTES - footerLength;

    const footerBytes = await this.storage.read(path, {
      start: footerStart,
      end: stat.size - BLOB_FOOTER_LENGTH_BYTES - 1,
    });

    if (footerBytes.length !== footerLength) {
      throw new Error('Invalid blob format: footer length mismatch');
    }

    return this.parseFooter(footerBytes);
  }

  private async fetchBlobByFullRead(path: string): Promise<BlobFileData> {
    const bytes = await this.storage.read(path);
    if (bytes.length < BLOB_FOOTER_LENGTH_BYTES) {
      throw new Error('Invalid blob format: footer length is missing');
    }

    const footerLengthStart = bytes.length - BLOB_FOOTER_LENGTH_BYTES;
    const footerLengthBytes = bytes.subarray(footerLengthStart);
    const footerLength = this.parseFooterLength(footerLengthBytes, bytes.length);
    const footerStart = bytes.length - BLOB_FOOTER_LENGTH_BYTES - footerLength;

    const payload = bytes.subarray(0, footerStart);
    const footer = this.parseFooter(bytes.subarray(footerStart, footerLengthStart));
    this.getChunkLayout(footer, payload.length);

    return { payload, footer };
  }

  private parseFooterLength(footerLengthBytes: Uint8Array, totalSize: number): number {
    if (footerLengthBytes.length !== BLOB_FOOTER_LENGTH_BYTES) {
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

    if (footerLength > totalSize - BLOB_FOOTER_LENGTH_BYTES) {
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

    if ((footer.encrypted && chunkOverhead <= 0) || (!footer.encrypted && chunkOverhead !== 0)) {
      throw new Error('Invalid blob format: chunk overhead is malformed');
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
    payload: Uint8Array<ArrayBuffer>,
    footer: BlobFooter
  ): AsyncGenerator<Uint8Array<ArrayBuffer>, void, undefined> {
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
    payload: Uint8Array<ArrayBuffer>,
    footer: BlobFooter
  ): Promise<Uint8Array<ArrayBuffer>> {
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
  ): ReadableStream<Uint8Array<ArrayBuffer>> {
    let iterator: AsyncGenerator<Uint8Array<ArrayBuffer>, void, undefined> | null = null;

    return new ReadableStream<Uint8Array<ArrayBuffer>>({
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
}
