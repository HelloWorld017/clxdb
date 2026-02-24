import { z } from 'zod';
import { invalidateCache } from '@/utils/fetch-cors';
import { StorageError } from '@/utils/storage-error';
import type { StorageBackend, StorageBackendMetadata } from '../types';

const EMPTY_SHA256_HEX = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const S3_SERVICE = 's3';
const SIGV4_ALGORITHM = 'AWS4-HMAC-SHA256';

const s3ProviderSchema = z
  .union([z.literal('s3'), z.literal('r2'), z.literal('minio'), z.literal('unknown')])
  .default('s3');

const configSchema = z.object({
  kind: z.literal('s3'),
  provider: s3ProviderSchema,
  endpoint: z.url(),
  region: z.string().default('us-east-1'),
  bucket: z.string(),
  prefix: z.string().default(''),
  forcePathStyle: z.boolean().optional(),
  credentials: z.object({
    accessKeyId: z.string(),
    secretAccessKey: z.string(),
    sessionToken: z.string().optional(),
  }),
});

export type S3Config = z.infer<typeof configSchema>;
export type S3Provider = z.infer<typeof s3ProviderSchema>;

interface ParsedListObjects {
  keys: string[];
  commonPrefixes: string[];
  isTruncated: boolean;
  continuationToken: string | null;
}

interface SignedRequestParams {
  method: 'GET' | 'HEAD' | 'PUT' | 'DELETE';
  url: URL;
  headers?: Record<string, string>;
  body?: Uint8Array;
  cache?: RequestCache;
}

const textEncoder = new TextEncoder();

const normalizePath = (value: string): string => value.trim().split('/').filter(Boolean).join('/');

const normalizeHeaderValue = (value: string): string => value.trim().replace(/\s+/g, ' ');

const encodeRfc3986 = (value: string): string =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );

const safeDecodeURIComponent = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const toHex = (value: ArrayBuffer | Uint8Array): string => {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  return Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
};

const toAmzDate = (date: Date): string => date.toISOString().replace(/[:-]|\.\d{3}/g, '');

const toDateStamp = (amzDate: string): string => amzDate.slice(0, 8);

const sha256Hex = async (value: string | Uint8Array): Promise<string> => {
  const bytes = typeof value === 'string' ? textEncoder.encode(value) : value;
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return toHex(digest);
};

const hmacSha256 = async (key: Uint8Array, value: string): Promise<Uint8Array> => {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as Uint8Array<ArrayBuffer>,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, textEncoder.encode(value));
  return new Uint8Array(signature);
};

export class S3Backend implements StorageBackend {
  private endpoint: URL;
  private provider: S3Provider;
  private region: string;
  private bucket: string;
  private prefix: string;
  private forcePathStyle: boolean;
  private credentials: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };

  constructor(config: S3Config) {
    this.provider = config.provider;
    this.region = config.region.trim() || (config.provider === 'r2' ? 'auto' : 'us-east-1');
    this.bucket = config.bucket.trim();
    this.prefix = normalizePath(config.prefix);
    this.forcePathStyle = config.forcePathStyle ?? config.provider !== 's3';
    this.credentials = {
      accessKeyId: config.credentials.accessKeyId.trim(),
      secretAccessKey: config.credentials.secretAccessKey,
      ...(config.credentials.sessionToken?.trim()
        ? { sessionToken: config.credentials.sessionToken.trim() }
        : {}),
    };

    const endpoint = new URL(config.endpoint.trim());
    endpoint.hash = '';
    endpoint.search = '';
    endpoint.pathname = endpoint.pathname.replace(/\/+$/g, '');
    this.endpoint = endpoint;

    if (!this.bucket) {
      throw new Error('S3 bucket is required.');
    }

    if (!this.credentials.accessKeyId || !this.credentials.secretAccessKey) {
      throw new Error('S3 credentials are required.');
    }
  }

  async read(path: string, range?: { start: number; end: number }): Promise<Uint8Array> {
    const key = this.getObjectKey(path);
    const response = await this.signedRequest({
      method: 'GET',
      url: this.getObjectUrl(key),
      headers: range ? { Range: `bytes=${range.start}-${range.end}` } : undefined,
    });

    if (response.status === 404) {
      throw new StorageError('ENOENT', `File not found: ${path}`);
    }

    if (!response.ok) {
      throw new StorageError(
        'UNKNOWN',
        `S3 read failed: ${response.status} ${response.statusText}${await this.getErrorMessage(response)}`
      );
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!range) {
      return bytes;
    }

    const expectedLength = Math.max(0, range.end - range.start + 1);
    if (response.status === 206 && bytes.length === expectedLength) {
      return bytes;
    }

    if (response.status === 200 && bytes.length > range.end) {
      return bytes.subarray(range.start, range.end + 1);
    }

    if (bytes.length > expectedLength) {
      return bytes.subarray(0, expectedLength);
    }

    return bytes;
  }

  async readDirectory(path: string): Promise<string[]> {
    const prefix = this.getDirectoryPrefix(path);
    const { keys, commonPrefixes } = await this.listObjects(prefix, '/');
    const directories = new Set<string>();

    for (const entry of commonPrefixes) {
      const relative = this.getRelativePath(entry, prefix).replace(/\/+$/g, '');
      if (!relative || relative.includes('/')) {
        continue;
      }

      directories.add(relative);
    }

    for (const key of keys) {
      const relative = this.getRelativePath(key, prefix);
      if (!relative.endsWith('/')) {
        continue;
      }

      const directoryName = relative.replace(/\/+$/g, '');
      if (!directoryName || directoryName.includes('/')) {
        continue;
      }

      directories.add(directoryName);
    }

    return Array.from(directories).sort((left, right) => left.localeCompare(right));
  }

  async write(path: string, content: Uint8Array): Promise<void> {
    const existing = await this.stat(path);
    if (existing) {
      throw new StorageError('EEXIST', `File already exists: ${path}`);
    }

    const key = this.getObjectKey(path);
    const response = await this.signedRequest({
      method: 'PUT',
      url: this.getObjectUrl(key),
      headers: {
        'If-None-Match': '*',
      },
      body: content,
    });

    if (response.status === 412 || response.status === 409) {
      throw new StorageError('EEXIST', `File already exists: ${path}`);
    }

    if (!response.ok) {
      throw new StorageError(
        'UNKNOWN',
        `S3 write failed: ${response.status} ${response.statusText}${await this.getErrorMessage(response)}`
      );
    }
  }

  async delete(path: string): Promise<void> {
    const key = this.getObjectKey(path);
    const response = await this.signedRequest({
      method: 'DELETE',
      url: this.getObjectUrl(key),
    });

    if (!response.ok && response.status !== 404) {
      throw new StorageError(
        'UNKNOWN',
        `S3 delete failed: ${response.status} ${response.statusText}${await this.getErrorMessage(response)}`
      );
    }
  }

  async stat(path: string): Promise<{ etag: string; size: number; lastModified?: Date } | null> {
    const key = this.getObjectKey(path);

    /*
     * Cached stat can cause infinite sync on versioned storage
     */
    const response = await this.signedRequest({
      method: 'HEAD',
      url: invalidateCache(this.getObjectUrl(key)),
      cache: 'no-store',
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new StorageError(
        'UNKNOWN',
        `S3 stat failed: ${response.status} ${response.statusText}${await this.getErrorMessage(response)}`
      );
    }

    const etag = response.headers.get('ETag') || response.headers.get('etag') || '';
    const contentLength =
      response.headers.get('Content-Length') || response.headers.get('content-length') || '0';
    const lastModifiedRaw =
      response.headers.get('Last-Modified') || response.headers.get('last-modified');
    const lastModified = lastModifiedRaw ? new Date(lastModifiedRaw) : undefined;

    return {
      etag,
      size: Number.parseInt(contentLength, 10) || 0,
      ...(lastModified && !Number.isNaN(lastModified.getTime()) ? { lastModified } : {}),
    };
  }

  async atomicUpdate(
    path: string,
    content: Uint8Array,
    previousEtag: string
  ): Promise<{ success: boolean; newEtag?: string }> {
    if (!previousEtag) {
      return { success: false };
    }

    const key = this.getObjectKey(path);
    const response = await this.signedRequest({
      method: 'PUT',
      url: this.getObjectUrl(key),
      headers: {
        'If-Match': previousEtag,
        'Content-Type': 'application/json',
      },
      body: content,
    });

    if (response.status === 412) {
      return { success: false };
    }

    if (!response.ok) {
      throw new StorageError(
        'UNKNOWN',
        `S3 atomic update failed: ${response.status} ${response.statusText}${await this.getErrorMessage(response)}`
      );
    }

    const newEtag = response.headers.get('ETag') || response.headers.get('etag');
    if (newEtag) {
      return { success: true, newEtag };
    }

    const stat = await this.stat(path);
    return { success: true, newEtag: stat?.etag ?? previousEtag };
  }

  async list(path: string): Promise<string[]> {
    const prefix = this.getDirectoryPrefix(path);
    const { keys } = await this.listObjects(prefix, '/');
    const files = new Set<string>();

    for (const key of keys) {
      const relative = this.getRelativePath(key, prefix);
      if (!relative || relative.includes('/') || relative.endsWith('/')) {
        continue;
      }

      files.add(relative);
    }

    return Array.from(files).sort((left, right) => left.localeCompare(right));
  }

  getMetadata(): StorageBackendMetadata {
    return {
      kind: 's3',
      provider: this.provider,
      endpoint: this.serializeEndpoint(),
      region: this.region,
      bucket: this.bucket,
      prefix: this.prefix,
    };
  }

  serialize(): S3Config {
    return {
      kind: 's3',
      provider: this.provider,
      endpoint: this.serializeEndpoint(),
      region: this.region,
      bucket: this.bucket,
      prefix: this.prefix,
      forcePathStyle: this.forcePathStyle,
      credentials: {
        accessKeyId: this.credentials.accessKeyId,
        secretAccessKey: this.credentials.secretAccessKey,
        ...(this.credentials.sessionToken ? { sessionToken: this.credentials.sessionToken } : {}),
      },
    };
  }

  static deserialize(config: unknown) {
    const { success, data } = configSchema.safeParse(config);
    if (!success) {
      return null;
    }

    return new S3Backend(data);
  }

  private serializeEndpoint(): string {
    return this.endpoint.toString().replace(/\/$/g, '');
  }

  private getObjectKey(path: string): string {
    const normalizedPath = normalizePath(path);
    if (!normalizedPath) {
      throw new StorageError('UNKNOWN', 'S3 object key cannot be empty.');
    }

    return this.prefix ? `${this.prefix}/${normalizedPath}` : normalizedPath;
  }

  private getDirectoryPrefix(path: string): string {
    const normalizedPath = normalizePath(path);
    if (!normalizedPath) {
      return this.prefix ? `${this.prefix}/` : '';
    }

    const key = this.prefix ? `${this.prefix}/${normalizedPath}` : normalizedPath;
    return `${key}/`;
  }

  private getRelativePath(key: string, prefix: string): string {
    if (prefix && key.startsWith(prefix)) {
      return key.slice(prefix.length);
    }

    return key;
  }

  private getBucketUrl(): URL {
    const url = new URL(this.endpoint.toString());
    const pathSegments = url.pathname.split('/').filter(Boolean);

    if (this.forcePathStyle) {
      pathSegments.push(encodeRfc3986(this.bucket));
    } else {
      url.hostname = `${this.bucket}.${url.hostname}`;
    }

    url.pathname = pathSegments.length ? `/${pathSegments.join('/')}` : '/';
    url.search = '';
    url.hash = '';

    return url;
  }

  private getObjectUrl(key: string): URL {
    const url = this.getBucketUrl();
    const keySegments = key
      .split('/')
      .filter(Boolean)
      .map(segment => encodeRfc3986(segment));
    if (keySegments.length) {
      const basePathSegments = url.pathname.split('/').filter(Boolean);
      url.pathname = `/${basePathSegments.concat(keySegments).join('/')}`;
    }

    return url;
  }

  private async listObjects(
    prefix: string,
    delimiter?: string
  ): Promise<{ keys: string[]; commonPrefixes: string[] }> {
    const keys: string[] = [];
    const commonPrefixes: string[] = [];

    let continuationToken: string | null = null;
    do {
      const url = this.getBucketUrl();
      url.searchParams.set('list-type', '2');
      if (prefix) {
        url.searchParams.set('prefix', prefix);
      }
      if (delimiter) {
        url.searchParams.set('delimiter', delimiter);
      }
      if (continuationToken) {
        url.searchParams.set('continuation-token', continuationToken);
      }

      const response = await this.signedRequest({
        method: 'GET',
        url,
      });

      if (!response.ok) {
        throw new StorageError(
          'UNKNOWN',
          `S3 list failed: ${response.status} ${response.statusText}${await this.getErrorMessage(response)}`
        );
      }

      const parsed = this.parseListObjectsResponse(await response.text());
      keys.push(...parsed.keys);
      commonPrefixes.push(...parsed.commonPrefixes);
      continuationToken = parsed.isTruncated ? parsed.continuationToken : null;
    } while (continuationToken);

    return { keys, commonPrefixes };
  }

  private parseListObjectsResponse(xml: string): ParsedListObjects {
    const parser = new DOMParser();
    const document = parser.parseFromString(xml, 'application/xml');

    if (document.getElementsByTagName('parsererror').length > 0) {
      throw new StorageError('UNKNOWN', 'Could not parse S3 list response.');
    }

    const readFirstText = (tagName: string): string =>
      document.getElementsByTagNameNS('*', tagName)[0]?.textContent?.trim() ?? '';

    const keyNodes = Array.from(document.getElementsByTagNameNS('*', 'Contents')).map(contentNode =>
      contentNode.getElementsByTagNameNS('*', 'Key')[0]?.textContent?.trim()
    );

    const commonPrefixNodes = Array.from(
      document.getElementsByTagNameNS('*', 'CommonPrefixes')
    ).map(prefixNode => prefixNode.getElementsByTagNameNS('*', 'Prefix')[0]?.textContent?.trim());

    return {
      keys: keyNodes.filter((key): key is string => !!key),
      commonPrefixes: commonPrefixNodes.filter((prefix): prefix is string => !!prefix),
      isTruncated: readFirstText('IsTruncated') === 'true',
      continuationToken: readFirstText('NextContinuationToken') || null,
    };
  }

  private async signedRequest({
    method,
    url,
    headers,
    body,
    cache,
  }: SignedRequestParams): Promise<Response> {
    const payloadHash = body ? await sha256Hex(body) : EMPTY_SHA256_HEX;
    const amzDate = toAmzDate(new Date());
    const dateStamp = toDateStamp(amzDate);

    const requestHeaders = new Map<string, string>();
    Object.entries(headers ?? {}).forEach(([name, value]) => {
      requestHeaders.set(name.toLowerCase(), normalizeHeaderValue(value));
    });

    requestHeaders.set('host', url.host);
    requestHeaders.set('x-amz-content-sha256', payloadHash);
    requestHeaders.set('x-amz-date', amzDate);
    if (this.credentials.sessionToken) {
      requestHeaders.set('x-amz-security-token', this.credentials.sessionToken);
    }

    const canonicalHeaderEntries = Array.from(requestHeaders.entries()).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    const canonicalHeaders = canonicalHeaderEntries
      .map(([name, value]) => `${name}:${value}\n`)
      .join('');
    const signedHeaders = canonicalHeaderEntries.map(([name]) => name).join(';');

    const canonicalRequest = [
      method,
      this.getCanonicalUri(url),
      this.getCanonicalQueryString(url),
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const credentialScope = `${dateStamp}/${this.region}/${S3_SERVICE}/aws4_request`;
    const stringToSign = [
      SIGV4_ALGORITHM,
      amzDate,
      credentialScope,
      await sha256Hex(canonicalRequest),
    ].join('\n');

    const signature = await this.signStringToSign(dateStamp, stringToSign);
    const authorization = `${SIGV4_ALGORITHM} Credential=${this.credentials.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const fetchHeaders = new Headers();
    canonicalHeaderEntries.forEach(([name, value]) => {
      fetchHeaders.set(name, value);
    });
    fetchHeaders.set('authorization', authorization);

    return fetch(url, {
      method,
      headers: fetchHeaders,
      body: body as Uint8Array<ArrayBuffer> | undefined,
      cache,
    });
  }

  private getCanonicalUri(url: URL): string {
    const canonicalPath = url.pathname
      .split('/')
      .map(segment => encodeRfc3986(safeDecodeURIComponent(segment)))
      .join('/');

    if (!canonicalPath) {
      return '/';
    }

    return canonicalPath.startsWith('/') ? canonicalPath : `/${canonicalPath}`;
  }

  private getCanonicalQueryString(url: URL): string {
    const pairs = Array.from(url.searchParams.entries()).map(([name, value]) => [
      encodeRfc3986(name),
      encodeRfc3986(value),
    ]);
    pairs.sort((left, right) => {
      const [leftName, leftValue] = left;
      const [rightName, rightValue] = right;
      if (leftName === rightName) {
        return leftValue.localeCompare(rightValue);
      }

      return leftName.localeCompare(rightName);
    });

    return pairs.map(([name, value]) => `${name}=${value}`).join('&');
  }

  private async signStringToSign(dateStamp: string, stringToSign: string): Promise<string> {
    const secret = textEncoder.encode(`AWS4${this.credentials.secretAccessKey}`);
    const kDate = await hmacSha256(secret, dateStamp);
    const kRegion = await hmacSha256(kDate, this.region);
    const kService = await hmacSha256(kRegion, S3_SERVICE);
    const kSigning = await hmacSha256(kService, 'aws4_request');
    const signature = await hmacSha256(kSigning, stringToSign);

    return toHex(signature);
  }

  private async getErrorMessage(response: Response): Promise<string> {
    try {
      const text = (await response.text()).trim();
      if (!text) {
        return '';
      }

      const parser = new DOMParser();
      const document = parser.parseFromString(text, 'application/xml');
      const code = document.getElementsByTagNameNS('*', 'Code')[0]?.textContent?.trim();
      const message = document.getElementsByTagNameNS('*', 'Message')[0]?.textContent?.trim();

      if (code && message) {
        return ` (${code}: ${message})`;
      }

      if (message) {
        return ` (${message})`;
      }

      return '';
    } catch {
      return '';
    }
  }
}
