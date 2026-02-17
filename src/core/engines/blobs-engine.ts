import { BLOBS_DIR } from '@/constants';
import { getMimeTypeByExtension } from '@/utils/mime';
import type { CryptoManager } from '../managers/crypto-manager';
import type { EngineContext } from '../types';
import type { StorageBackend } from '@/types';

const MAX_FILENAME_SIZE = 128;

export interface BlobMetadata {
  name?: string;
  mimeType?: string;
  createdAt?: number;
}

export interface StoredBlob {
  digest: string;
  file(): Promise<File>;
  metadata(): Promise<BlobMetadata>;
  stream(): ReadableStream<Uint8Array>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export class ClxBlobs {
  private storage: StorageBackend;
  private cryptoManager: CryptoManager;

  constructor({ storage }: EngineContext) {
    this.storage = storage;
  }

  async getBlob(digest: string): Promise<StoredBlob> {}

  async putBlob(data: ArrayBuffer | Blob | File, metadata?: BlobMetadata): Promise<string> {}

  async deleteBlob(digest: string): Promise<string> {}

  destroy(): void {}

  private getBlobDirectory(digest: string): string {
    return `${BLOBS_DIR}/${digest.slice(0, 2)}`;
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
}
