import { PROTOCOL_VERSION } from '@/constants';
import { manifestSchema } from '@/schemas';
import { delayWithBackoff } from '@/utils/backoff';
import type { StorageBackend, Manifest, ShardFileInfo } from '@/types';

const MANIFEST_PATH = 'manifest.json';
const MAX_RETRIES = 10;

export class ManifestManager {
  private storage: StorageBackend;
  private lastEtag: string = '';
  private lastManifest: Manifest | null = null;

  constructor(storage: StorageBackend) {
    this.storage = storage;
  }

  async initialize(): Promise<void> {
    const stat = await this.storage.stat(MANIFEST_PATH);

    if (stat) {
      this.lastEtag = stat.etag;
      const content = await this.storage.read(MANIFEST_PATH);
      const manifest = this.parseManifest(content);
      this.lastManifest = manifest;
      return;
    }

    const manifest = this.createInitialManifest();
    await this.storage.write(
      MANIFEST_PATH,
      new TextEncoder().encode(JSON.stringify(manifest, null, 2))
    );

    this.lastManifest = manifest;
    const newStat = await this.storage.stat(MANIFEST_PATH);
    this.lastEtag = newStat!.etag;
  }

  async read(): Promise<{ manifest: Manifest; etag: string } | null> {
    const stat = await this.storage.stat(MANIFEST_PATH);
    if (!stat) {
      return null;
    }

    if (stat.etag === this.lastEtag) {
      return { manifest: this.lastManifest!, etag: this.lastEtag };
    }

    const content = await this.storage.read(MANIFEST_PATH);
    return {
      manifest: this.parseManifest(content),
      etag: stat.etag,
    };
  }

  getLastEtag(): string {
    return this.lastEtag;
  }

  updateLastEtag(etag: string): void {
    this.lastEtag = etag;
  }

  getLastManifest(): Manifest {
    return this.lastManifest!;
  }

  async updateManifest(
    addedShards: ShardFileInfo[],
    removedShards: ShardFileInfo[],
    onPull: () => Promise<void>
  ): Promise<string> {
    const removedFiles = new Set(removedShards.map(shard => shard.filename));

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const stat = await this.storage.stat(MANIFEST_PATH);
      if (!stat) {
        throw new Error('Manifest not found');
      }

      const manifest = this.lastManifest;
      if (!manifest) {
        await onPull();
        continue;
      }

      const newShards = [...manifest.shardFiles, ...addedShards]
        .filter(shard => !removedFiles.has(shard.filename))
        .sort((a, b) => a.range.min - b.range.min);

      const newManifest = {
        ...manifest,
        version: PROTOCOL_VERSION,
        lastSequence: Math.max(manifest.lastSequence, ...newShards.map(shard => shard.range.max)),
        shardFiles: newShards,
      };

      const newContent = new TextEncoder().encode(JSON.stringify(newManifest, null, 2));

      const result = await this.storage.atomicUpdate(MANIFEST_PATH, newContent, stat.etag);
      if (result.success) {
        this.lastEtag = result.newEtag || stat.etag;
        return this.lastEtag;
      }

      if (attempt < MAX_RETRIES - 1) {
        await onPull();
        await delayWithBackoff(attempt);
      }
    }

    throw new Error(`Failed to update manifest after ${MAX_RETRIES} retries`);
  }

  private createInitialManifest(): Manifest {
    return {
      version: PROTOCOL_VERSION,
      lastSequence: 0,
      shardFiles: [],
    };
  }

  private parseManifest(content: Uint8Array): Manifest {
    const parsed = JSON.parse(new TextDecoder().decode(content)) as unknown;
    const result = manifestSchema.safeParse(parsed);

    if (result.success) {
      return result.data;
    } else {
      throw new Error(`Invalid manifest format: ${result.error.message}`);
    }
  }
}
