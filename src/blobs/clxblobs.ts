import { BLOBS_DIR } from '@/constants';
import type { StorageBackend } from '@/types';

const DIGEST_REGEX = /^[a-f0-9]{64}$/;
const DEFAULT_BLOB_FILENAME = 'blob';
const METADATA_SUFFIX = '.meta.json';
const MAX_FILENAME_LENGTH = 128;

const extensionToMimeType: Record<string, string> = {
  avif: 'image/avif',
  css: 'text/css',
  gif: 'image/gif',
  html: 'text/html',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  js: 'text/javascript',
  json: 'application/json',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  oga: 'audio/ogg',
  ogg: 'audio/ogg',
  ogv: 'video/ogg',
  pdf: 'application/pdf',
  png: 'image/png',
  svg: 'image/svg+xml',
  txt: 'text/plain',
  wav: 'audio/wav',
  webm: 'video/webm',
  webp: 'image/webp',
};

export interface ClxBlobsParams {
  storage: StorageBackend;
}

export class ClxBlobs {
  private storage: StorageBackend;
  private objectUrlCache: Map<string, string> = new Map();

  constructor({ storage }: ClxBlobsParams) {
    this.storage = storage;
  }

  async getBlobUrl(digest: string): Promise<string> {
    const normalizedDigest = this.normalizeDigest(digest);
    const cachedUrl = this.objectUrlCache.get(normalizedDigest);
    if (cachedUrl) {
      return cachedUrl;
    }

    const blobPath = await this.resolveBlobPath(normalizedDigest);
    if (!blobPath) {
      throw new Error(`Blob not found: ${normalizedDigest}`);
    }

    const raw = await this.storage.read(blobPath);
    const blobBytes = new Uint8Array(raw);
    const contentType =
      (await this.readBlobContentType(normalizedDigest)) ?? this.inferContentTypeFromPath(blobPath);
    const blob = contentType ? new Blob([blobBytes], { type: contentType }) : new Blob([blobBytes]);
    return this.cacheObjectUrl(normalizedDigest, blob);
  }

  async putBlob(data: Blob): Promise<string> {
    const raw = new Uint8Array(await data.arrayBuffer());
    const digest = await this.calculateDigest(raw);

    const existingPath = await this.resolveBlobPath(digest);
    if (!existingPath) {
      const directory = this.getBlobDirectory(digest);
      const path = `${directory}/${this.buildBlobFilename(digest, this.getPreferredFilename(data))}`;

      await this.storage.ensureDirectory(directory);
      try {
        await this.storage.write(path, raw);
      } catch (error) {
        const resolvedPath = await this.resolveBlobPath(digest);
        if (!resolvedPath) {
          throw error;
        }
      }
    }

    await this.writeBlobContentType(digest, data.type);
    this.cacheObjectUrl(digest, data);
    return digest;
  }

  async deleteBlob(digest: string): Promise<string> {
    const normalizedDigest = this.normalizeDigest(digest);
    const blobPaths = await this.listBlobPaths(normalizedDigest);
    for (const blobPath of blobPaths) {
      await this.storage.delete(blobPath);
    }

    await this.storage.delete(this.getMetadataPath(normalizedDigest));
    this.revokeDigest(normalizedDigest);
    return normalizedDigest;
  }

  destroy(): void {
    for (const url of this.objectUrlCache.values()) {
      this.revokeObjectUrl(url);
    }

    this.objectUrlCache.clear();
  }

  private normalizeDigest(digest: string): string {
    const normalized = digest.trim().toLowerCase();
    if (!DIGEST_REGEX.test(normalized)) {
      throw new Error('Invalid blob digest');
    }

    return normalized;
  }

  private getBlobDirectory(digest: string): string {
    return `${BLOBS_DIR}/${digest.slice(0, 2)}`;
  }

  private getMetadataPath(digest: string): string {
    return `${this.getBlobDirectory(digest)}/${digest}${METADATA_SUFFIX}`;
  }

  private getPreferredFilename(data: Blob): string | null {
    if (typeof File === 'undefined' || !(data instanceof File) || !data.name) {
      return null;
    }

    return this.sanitizeFilename(data.name);
  }

  private sanitizeFilename(filename: string): string {
    const basename = filename.trim().replace(/\\/g, '/').split('/').pop() ?? filename;
    const sanitized = basename
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '')
      .slice(0, MAX_FILENAME_LENGTH);
    return sanitized || DEFAULT_BLOB_FILENAME;
  }

  private buildBlobFilename(digest: string, preferredFilename: string | null): string {
    if (!preferredFilename) {
      return digest;
    }

    return `${digest}_${preferredFilename}`;
  }

  private isMatchingBlobFilename(filename: string, digest: string): boolean {
    const metadataFilename = `${digest}${METADATA_SUFFIX}`;
    if (filename === metadataFilename) {
      return false;
    }

    if (filename === digest || filename.startsWith(`${digest}_`)) {
      return true;
    }

    return filename.startsWith(`${digest}.`) && filename !== metadataFilename;
  }

  private async resolveBlobPath(digest: string): Promise<string | null> {
    const directory = this.getBlobDirectory(digest);
    const defaultPath = `${directory}/${digest}`;
    if (await this.storage.stat(defaultPath)) {
      return defaultPath;
    }

    const files = await this.storage.list(directory);
    const filename = files.find(file => this.isMatchingBlobFilename(file, digest));
    if (!filename) {
      return null;
    }

    return `${directory}/${filename}`;
  }

  private async listBlobPaths(digest: string): Promise<string[]> {
    const directory = this.getBlobDirectory(digest);
    const defaultPath = `${directory}/${digest}`;
    const paths = new Set<string>();

    if (await this.storage.stat(defaultPath)) {
      paths.add(defaultPath);
    }

    const files = await this.storage.list(directory);
    files.forEach(file => {
      if (this.isMatchingBlobFilename(file, digest)) {
        paths.add(`${directory}/${file}`);
      }
    });

    return Array.from(paths);
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

    return extensionToMimeType[extension] ?? null;
  }

  private async readBlobContentType(digest: string): Promise<string | null> {
    try {
      const metadataRaw = await this.storage.read(this.getMetadataPath(digest));
      const parsed = JSON.parse(new TextDecoder().decode(metadataRaw)) as { contentType?: unknown };
      if (typeof parsed.contentType === 'string' && parsed.contentType.length > 0) {
        return parsed.contentType;
      }
    } catch {
      return null;
    }

    return null;
  }

  private async writeBlobContentType(digest: string, contentType: string): Promise<void> {
    if (!contentType) {
      return;
    }

    const metadataPath = this.getMetadataPath(digest);
    if (await this.storage.stat(metadataPath)) {
      return;
    }

    const metadata = new TextEncoder().encode(JSON.stringify({ contentType }));
    try {
      await this.storage.write(metadataPath, metadata);
    } catch (error) {
      if (!(await this.storage.stat(metadataPath))) {
        throw error;
      }
    }
  }

  private async calculateDigest(data: Uint8Array): Promise<string> {
    const digestBuffer = await crypto.subtle.digest('SHA-256', data as Uint8Array<ArrayBuffer>);
    return Array.from(new Uint8Array(digestBuffer))
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  private cacheObjectUrl(digest: string, blob: Blob): string {
    const previous = this.objectUrlCache.get(digest);
    if (previous) {
      this.revokeObjectUrl(previous);
    }

    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
      throw new Error('Blob URLs are not available in this runtime');
    }

    const objectUrl = URL.createObjectURL(blob);
    this.objectUrlCache.set(digest, objectUrl);
    return objectUrl;
  }

  private revokeDigest(digest: string): void {
    const url = this.objectUrlCache.get(digest);
    if (url) {
      this.revokeObjectUrl(url);
      this.objectUrlCache.delete(digest);
    }
  }

  private revokeObjectUrl(url: string): void {
    if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(url);
    }
  }
}
