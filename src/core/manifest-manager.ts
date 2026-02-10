import { PROTOCOL_VERSION } from '@/constants';
import { delayWithBackoff } from '@/utils/backoff';
import type { StorageBackend, Manifest, ShardFileInfo } from '@/types';

const MANIFEST_PATH = 'manifest.json';
const MAX_RETRIES = 10;

export class ManifestManager {
  private backend: StorageBackend;
  private lastEtag: string = '';

  constructor(backend: StorageBackend) {
    this.backend = backend;
  }

  async initialize(): Promise<Manifest> {
    const stat = await this.backend.stat(MANIFEST_PATH);

    if (stat) {
      this.lastEtag = stat.etag;
      const content = await this.backend.read(MANIFEST_PATH);
      return this.parseManifest(content);
    }

    const manifest = this.createInitialManifest();
    await this.backend.write(
      MANIFEST_PATH,
      new TextEncoder().encode(JSON.stringify(manifest, null, 2))
    );

    const newStat = await this.backend.stat(MANIFEST_PATH);
    this.lastEtag = newStat!.etag;
    return manifest;
  }

  async read(): Promise<{ manifest: Manifest; etag: string } | null> {
    const stat = await this.backend.stat(MANIFEST_PATH);
    if (!stat) {
      return null;
    }

    const content = await this.backend.read(MANIFEST_PATH);
    return {
      manifest: this.parseManifest(content),
      etag: stat.etag,
    };
  }

  async addShard(shardInfo: ShardFileInfo, filesToRemove?: ShardFileInfo[]): Promise<string> {
    return this.updateManifestWithRetry(manifest => {
      let newShards = [...manifest.shardFiles, shardInfo];
      newShards.sort((a, b) => a.range.min - b.range.min);

      if (filesToRemove) {
        const removeSet = new Set(filesToRemove.map(f => f.filename));
        newShards = newShards.filter(s => !removeSet.has(s.filename));
      }

      return {
        version: PROTOCOL_VERSION,
        lastSequence: Math.max(manifest.lastSequence, shardInfo.range.max),
        shardFiles: newShards,
      };
    });
  }

  getLastEtag(): string {
    return this.lastEtag;
  }

  updateLastEtag(etag: string): void {
    this.lastEtag = etag;
  }

  private async updateManifestWithRetry(
    updater: (manifest: Manifest) => Manifest
  ): Promise<string> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const stat = await this.backend.stat(MANIFEST_PATH);
      if (!stat) {
        throw new Error('Manifest not found');
      }

      const content = await this.backend.read(MANIFEST_PATH);
      const manifest = this.parseManifest(content);
      const newManifest = updater(manifest);
      const newContent = new TextEncoder().encode(JSON.stringify(newManifest, null, 2));

      const result = await this.backend.atomicUpdate(MANIFEST_PATH, newContent, stat.etag);

      if (result.success) {
        this.lastEtag = result.newEtag || stat.etag;
        return this.lastEtag;
      }

      if (attempt < MAX_RETRIES - 1) {
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
    return JSON.parse(new TextDecoder().decode(content)) as Manifest;
  }
}
