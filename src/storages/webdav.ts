import { z } from 'zod';
import { StorageError } from '@/utils/storage-error';
import type { StorageBackend, StorageBackendMetadata } from '../types';

const configSchema = z.object({
  kind: z.literal('webdav'),
  url: z.string(),
  auth: z.object({ user: z.string(), pass: z.string() }),
});

export type WebDAVConfig = z.infer<typeof configSchema>;

export class WebDAVBackend implements StorageBackend {
  private url: string;
  private auth: { user: string; pass: string };

  constructor(config: WebDAVConfig) {
    this.url = config.url.replace(/\/$/, '');
    this.auth = config.auth;
  }

  private getHeaders(): Record<string, string> {
    const auth = btoa(`${this.auth.user}:${this.auth.pass}`);
    return {
      Authorization: `Basic ${auth}`,
    };
  }

  private normalizePath(path: string): string {
    return path.split('/').filter(Boolean).join('/');
  }

  private getUrl(path: string, asDirectory = false): string {
    const normalizedPath = this.normalizePath(path);
    if (!normalizedPath) {
      return asDirectory ? `${this.url}/` : this.url;
    }

    return `${this.url}/${normalizedPath}${asDirectory ? '/' : ''}`;
  }

  private getRequestedDirectoryPathname(path: string): string {
    const basePathname = new URL(`${this.url}/`).pathname;
    const normalizedBasePathname = basePathname.endsWith('/') ? basePathname : `${basePathname}/`;
    const normalizedPath = this.normalizePath(path);
    return `${normalizedBasePathname}${normalizedPath}${normalizedPath ? '/' : ''}`;
  }

  private parsePropfindEntries(xml: string): { href: string; isDirectory: boolean }[] {
    const parser = new DOMParser();
    const document = parser.parseFromString(xml, 'application/xml');
    const responses = Array.from(document.getElementsByTagNameNS('*', 'response'));

    return responses
      .map(response => ({
        href: response.getElementsByTagNameNS('*', 'href')[0]?.textContent?.trim() ?? '',
        isDirectory: response.getElementsByTagNameNS('*', 'collection').length > 0,
      }))
      .filter(entry => !!entry.href);
  }

  private decodePathSegment(segment: string): string {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  }

  private resolveHrefPathname(href: string): string | null {
    try {
      return new URL(href, `${this.url}/`).pathname;
    } catch {
      return null;
    }
  }

  async read(path: string, range?: { start: number; end: number }): Promise<Uint8Array> {
    const url = this.getUrl(path);
    const headers: HeadersInit = this.getHeaders();

    if (range) {
      headers['Range'] = `bytes=${range.start}-${range.end}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      if (response.status === 404) {
        throw new StorageError('ENOENT', `File not found: ${path}`);
      }

      throw new StorageError(
        'UNKNOWN',
        `WebDAV read failed: ${response.status} ${response.statusText}`
      );
    }

    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  }

  async ensureDirectory(path: string): Promise<void> {
    const segments = path.split('/').filter(Boolean);
    if (segments.length === 0) {
      return;
    }

    let currentPath = '';
    for (const segment of segments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const response = await fetch(`${this.url}/${currentPath}/`, {
        method: 'MKCOL',
        headers: this.getHeaders(),
      });

      if (response.ok || response.status === 405) {
        continue;
      }

      throw new StorageError(
        'UNKNOWN',
        `WebDAV ensure directory failed: ${response.status} ${response.statusText}`
      );
    }
  }

  async write(path: string, content: Uint8Array): Promise<void> {
    const url = this.getUrl(path);

    // Check if file exists first
    const stat = await this.stat(path);
    if (stat) {
      throw new StorageError('EEXIST', `File already exists: ${path}`);
    }

    const response = await fetch(url, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: content as Uint8Array<ArrayBuffer>,
    });

    if (!response.ok) {
      throw new StorageError(
        'UNKNOWN',
        `WebDAV write failed: ${response.status} ${response.statusText}`
      );
    }
  }

  async delete(path: string): Promise<void> {
    const url = this.getUrl(path);
    const response = await fetch(url, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });

    if (!response.ok && response.status !== 404) {
      throw new StorageError(
        'UNKNOWN',
        `WebDAV delete failed: ${response.status} ${response.statusText}`
      );
    }
  }

  async stat(path: string): Promise<{ etag: string; size: number; lastModified?: Date } | null> {
    const url = this.getUrl(path);
    const response = await fetch(url, {
      method: 'HEAD',
      headers: this.getHeaders(),
      cache: 'no-store',
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new StorageError(
        'UNKNOWN',
        `WebDAV stat failed: ${response.status} ${response.statusText}`
      );
    }

    const etag = response.headers.get('ETag') || response.headers.get('etag') || '';
    const contentLength =
      response.headers.get('Content-Length') || response.headers.get('content-length') || '0';
    const lastModified =
      response.headers.get('Last-Modified') || response.headers.get('last-modified');

    return {
      etag,
      size: parseInt(contentLength, 10),
      lastModified: lastModified ? new Date(lastModified) : undefined,
    };
  }

  async atomicUpdate(
    path: string,
    content: Uint8Array,
    previousEtag: string
  ): Promise<{ success: boolean; newEtag?: string }> {
    const url = this.getUrl(path);
    const headers: HeadersInit = {
      ...this.getHeaders(),
      'If-Match': previousEtag,
      'Content-Type': 'application/json',
    };

    const response = await fetch(url, {
      method: 'PUT',
      headers,
      body: content as Uint8Array<ArrayBuffer>,
    });

    if (response.status === 412) {
      return { success: false };
    }

    if (!response.ok) {
      throw new StorageError(
        'UNKNOWN',
        `WebDAV atomic update failed: ${response.status} ${response.statusText}`
      );
    }

    const newEtag = response.headers.get('ETag') || response.headers.get('etag') || '';
    return { success: true, newEtag };
  }

  async readDirectory(path: string): Promise<string[]> {
    const response = await fetch(this.getUrl(path, true), {
      method: 'PROPFIND',
      headers: {
        ...this.getHeaders(),
        Depth: '1',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return [];
      }
      throw new StorageError(
        'UNKNOWN',
        `WebDAV read directory failed: ${response.status} ${response.statusText}`
      );
    }

    const requestedPathname = this.getRequestedDirectoryPathname(path);
    const entries = this.parsePropfindEntries(await response.text());
    const directories = new Set<string>();

    entries.forEach(entry => {
      if (!entry.isDirectory) {
        return;
      }

      const pathname = this.resolveHrefPathname(entry.href);
      if (!pathname) {
        return;
      }

      if (!pathname.startsWith(requestedPathname)) {
        return;
      }

      const relativePath = pathname.slice(requestedPathname.length).replace(/\/+$/, '');
      if (!relativePath || relativePath.includes('/')) {
        return;
      }

      directories.add(this.decodePathSegment(relativePath));
    });

    return Array.from(directories).sort((a, b) => a.localeCompare(b));
  }

  async list(path: string): Promise<string[]> {
    const response = await fetch(this.getUrl(path, true), {
      method: 'PROPFIND',
      headers: {
        ...this.getHeaders(),
        Depth: '1',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return [];
      }
      throw new StorageError(
        'UNKNOWN',
        `WebDAV list failed: ${response.status} ${response.statusText}`
      );
    }

    const requestedPathname = this.getRequestedDirectoryPathname(path);
    const entries = this.parsePropfindEntries(await response.text());
    const files = new Set<string>();

    entries.forEach(entry => {
      if (entry.isDirectory) {
        return;
      }

      const pathname = this.resolveHrefPathname(entry.href);
      if (!pathname) {
        return;
      }

      if (!pathname.startsWith(requestedPathname)) {
        return;
      }

      const relativePath = pathname.slice(requestedPathname.length).replace(/^\/+/, '');
      if (!relativePath || relativePath.includes('/')) {
        return;
      }

      files.add(this.decodePathSegment(relativePath));
    });

    return Array.from(files).sort((a, b) => a.localeCompare(b));
  }

  getMetadata(): StorageBackendMetadata {
    return {
      kind: 'webdav',
      endpoint: this.url,
    };
  }

  serialize(): WebDAVConfig {
    return {
      kind: 'webdav',
      url: this.url,
      auth: this.auth,
    };
  }

  static deserialize(config: unknown) {
    const { success, data } = configSchema.safeParse(config);
    if (!success) {
      return null;
    }

    return new WebDAVBackend(data);
  }
}
