import type { StorageBackend } from '../types';

export class WebDAVBackend implements StorageBackend {
  private url: string;
  private auth: { user: string; pass: string };

  constructor(config: { url: string; auth: { user: string; pass: string } }) {
    this.url = config.url.replace(/\/$/, '');
    this.auth = config.auth;
  }

  private getHeaders(): Record<string, string> {
    const auth = btoa(`${this.auth.user}:${this.auth.pass}`);
    return {
      Authorization: `Basic ${auth}`,
    };
  }

  async read(path: string, range?: { start: number; end: number }): Promise<Uint8Array> {
    const url = `${this.url}/${path}`;
    const headers: HeadersInit = this.getHeaders();

    if (range) {
      headers['Range'] = `bytes=${range.start}-${range.end}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`File not found: ${path}`);
      }
      throw new Error(`WebDAV read failed: ${response.status} ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  }

  async write(path: string, content: Uint8Array): Promise<void> {
    const url = `${this.url}/${path}`;

    // Check if file exists first
    try {
      const stat = await this.stat(path);
      if (stat) {
        throw new Error(`File already exists: ${path}`);
      }
    } catch {
      // File doesn't exist, continue
    }

    const response = await fetch(url, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: content as Uint8Array<ArrayBuffer>,
    });

    if (!response.ok) {
      throw new Error(`WebDAV write failed: ${response.status} ${response.statusText}`);
    }
  }

  async delete(path: string): Promise<void> {
    const url = `${this.url}/${path}`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(`WebDAV delete failed: ${response.status} ${response.statusText}`);
    }
  }

  async stat(path: string): Promise<{ etag: string; size: number; lastModified?: Date } | null> {
    const url = `${this.url}/${path}`;
    const response = await fetch(url, {
      method: 'HEAD',
      headers: this.getHeaders(),
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`WebDAV stat failed: ${response.status} ${response.statusText}`);
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
    const url = `${this.url}/${path}`;
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
      throw new Error(`WebDAV atomic update failed: ${response.status} ${response.statusText}`);
    }

    const newEtag = response.headers.get('ETag') || response.headers.get('etag') || '';
    return { success: true, newEtag };
  }

  async list(path: string): Promise<string[]> {
    const url = `${this.url}/${path}`;
    const response = await fetch(url, {
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
      throw new Error(`WebDAV list failed: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'application/xml');
    const responses = doc.querySelectorAll('response');
    const files: string[] = [];

    responses.forEach(resp => {
      const href = resp.querySelector('href')?.textContent;
      if (href && href !== path && !href.endsWith('/')) {
        files.push(href.replace(/^.*\//, ''));
      }
    });

    return files;
  }
}
