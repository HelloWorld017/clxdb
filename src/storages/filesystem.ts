import { z } from 'zod';
import { StorageError } from '@/utils/storage-error';
import type { StorageBackendInternal, StorageBackendMetadata } from '../types';

const configSchema = z.object({
  kind: z.literal('filesystem'),
  provider: z.union([z.literal('filesystem-access'), z.literal('opfs')]),
  handle:
    typeof window !== 'undefined' ? z.instanceof(window.FileSystemDirectoryHandle) : z.never(),
});

export type FileSystemConfig = z.infer<typeof configSchema>;

const isHandleAlive = async (handle: FileSystemDirectoryHandle): Promise<boolean> => {
  try {
    if (typeof handle.queryPermission === 'function') {
      const permission = await handle.queryPermission({ mode: 'readwrite' });
      if (permission !== 'granted') {
        return false;
      }
    }

    const iterator = handle.values();
    await iterator.next();
    return true;
  } catch {
    return false;
  }
};

export class FileSystemBackend implements StorageBackendInternal {
  private handle: FileSystemDirectoryHandle;
  private provider: 'filesystem-access' | 'opfs';

  constructor({ handle, provider }: FileSystemConfig) {
    this.handle = handle;
    this.provider = provider;
  }

  private async getFileHandle(path: string, create = false): Promise<FileSystemFileHandle | null> {
    const parts = path.split('/').filter(Boolean);
    let dir = this.handle;

    for (let i = 0; i < parts.length - 1; i++) {
      try {
        dir = await dir.getDirectoryHandle(parts[i], { create });
      } catch {
        return null;
      }
    }

    const filename = parts[parts.length - 1];
    try {
      return await dir.getFileHandle(filename, { create });
    } catch {
      return null;
    }
  }

  async read(
    path: string,
    range?: { start: number; end: number }
  ): Promise<Uint8Array<ArrayBuffer>> {
    const handle = await this.getFileHandle(path);
    if (!handle) {
      throw new StorageError('ENOENT', `File not found: ${path}`);
    }

    const file = await handle.getFile();
    const buffer = await file.arrayBuffer();

    if (range) {
      const sliced = buffer.slice(range.start, range.end + 1);
      return new Uint8Array(sliced);
    }

    return new Uint8Array(buffer);
  }

  async readDirectory(path: string): Promise<string[]> {
    const dir = await this.getDirectoryHandle(path);
    if (!dir) {
      return [];
    }

    const directories: string[] = [];
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind === 'directory') {
        directories.push(name);
      }
    }

    return directories.sort((a, b) => a.localeCompare(b));
  }

  async ensureDirectory(path: string): Promise<void> {
    const parts = path.split('/').filter(Boolean);
    if (parts.length === 0) {
      return;
    }

    let dir = this.handle;
    try {
      for (const part of parts) {
        dir = await dir.getDirectoryHandle(part, { create: true });
      }
    } catch {
      throw new StorageError('UNKNOWN', `Failed to ensure directory: ${path}`);
    }
  }

  async write(path: string, content: Uint8Array<ArrayBuffer>): Promise<void> {
    // Check if file exists
    const existing = await this.getFileHandle(path);
    if (existing) {
      throw new StorageError('EEXIST', `File already exists: ${path}`);
    }

    const handle = await this.getFileHandle(path, true);
    if (!handle) {
      throw new StorageError('UNKNOWN', `Failed to create file: ${path}`);
    }

    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  async delete(path: string): Promise<void> {
    const parts = path.split('/').filter(Boolean);
    if (parts.length === 0) {
      return;
    }

    const dir =
      parts.length > 1 ? await this.getDirectoryHandle(parts.slice(0, -1).join('/')) : this.handle;

    if (!dir) {
      return;
    }

    try {
      await dir.removeEntry(parts[parts.length - 1]);
    } catch {
      // File might not exist
    }
  }

  async stat(path: string): Promise<{ etag: string; size: number; lastModified?: Date } | null> {
    const handle = await this.getFileHandle(path);
    if (!handle) {
      return null;
    }

    const file = await handle.getFile();
    return {
      etag: `${file.lastModified}-${file.size}`,
      size: file.size,
      lastModified: new Date(file.lastModified),
    };
  }

  async atomicUpdate(
    path: string,
    content: Uint8Array,
    previousEtag: string
  ): Promise<{ success: boolean; newEtag?: string }> {
    // Check current etag
    const currentStat = await this.stat(path);
    const currentEtag = currentStat
      ? `${currentStat.lastModified?.getTime()}-${currentStat.size}`
      : '';

    if (currentEtag !== previousEtag) {
      return { success: false };
    }

    try {
      const handle = await this.getFileHandle(path, true);
      if (!handle) {
        return { success: false };
      }

      const writable = await handle.createWritable();
      await writable.write(content as Uint8Array<ArrayBuffer>);
      await writable.close();

      const newStat = await this.stat(path);
      return {
        success: true,
        newEtag: newStat ? `${newStat.lastModified?.getTime()}-${newStat.size}` : '',
      };
    } catch {
      return { success: false };
    }
  }

  async list(path: string): Promise<string[]> {
    const dir = await this.getDirectoryHandle(path);
    if (!dir) {
      return [];
    }

    const files: string[] = [];
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind === 'file') {
        files.push(name);
      }
    }

    return files;
  }

  private async getDirectoryHandle(path: string): Promise<FileSystemDirectoryHandle | null> {
    if (!path) {
      return this.handle;
    }

    const parts = path.split('/').filter(Boolean);
    let dir = this.handle;

    for (const part of parts) {
      try {
        dir = await dir.getDirectoryHandle(part);
      } catch {
        return null;
      }
    }

    return dir;
  }

  getMetadata(): StorageBackendMetadata {
    return {
      kind: 'filesystem',
      provider: this.provider,
      directoryName: this.handle.name || '(root)',
    };
  }

  serialize(): FileSystemConfig {
    return {
      kind: 'filesystem',
      provider: this.provider,
      handle: this.handle,
    };
  }

  static async deserialize(config: unknown) {
    const { success, data } = configSchema.safeParse(config);
    if (!success) {
      return null;
    }

    if (!(await isHandleAlive(data.handle))) {
      return null;
    }

    return new FileSystemBackend(data);
  }
}
