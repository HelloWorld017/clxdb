import { MANIFEST_PATH, PROTOCOL_VERSION } from '@/constants';
import { manifestSchema } from '@/schemas';
import { delayWithBackoff } from '@/utils/backoff';
import type { StorageBackend, Manifest, ShardFileInfo, PossiblyPromise } from '@/types';

const MAX_RETRIES = 10;

export interface ManifestUpdateDescriptor {
  addedShardInfoList?: ShardFileInfo[];
  removedShardFilenameList?: string[];
  updatedFields?: Omit<Manifest, 'version' | 'lastSequence' | 'shardFiles'>;
  finalizeManifest?: (manifest: Manifest) => PossiblyPromise<Manifest>;
}

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

    if (stat.etag === this.lastEtag && this.lastManifest) {
      return { manifest: this.lastManifest, etag: this.lastEtag };
    }

    const content = await this.storage.read(MANIFEST_PATH);
    const manifest = this.parseManifest(content);
    this.lastManifest = manifest;
    this.lastEtag = stat.etag;

    return {
      manifest,
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

  async updateManifest<T extends ManifestUpdateDescriptor>(
    onUpdate: (manifest: Manifest) => PossiblyPromise<T>,
    onRetry: () => PossiblyPromise<void>
  ): Promise<T> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const latest = await this.read();
      if (!latest) {
        throw new Error('Manifest not found');
      }

      const { manifest, etag } = latest;

      const manifestUpdate = await onUpdate(manifest);
      const { addedShardInfoList, removedShardFilenameList, updatedFields, finalizeManifest } =
        manifestUpdate;
      if (!addedShardInfoList?.length && !removedShardFilenameList?.length && !updatedFields) {
        return manifestUpdate;
      }

      const removedFiles = new Set(removedShardFilenameList);
      const newShards = [...manifest.shardFiles, ...(addedShardInfoList ?? [])]
        .filter(shard => !removedFiles.has(shard.filename))
        .sort((a, b) => a.range.min - b.range.min);

      const newUniqueShards = Array.from(
        new Map(newShards.map(shard => [shard.filename, shard])).values()
      );

      let newManifest = {
        ...manifest,
        ...updatedFields,
        version: PROTOCOL_VERSION,
        lastSequence: Math.max(
          manifest.lastSequence,
          ...newUniqueShards.map(shard => shard.range.max)
        ),
        shardFiles: newUniqueShards,
      };

      if (finalizeManifest) {
        newManifest = await finalizeManifest(newManifest);
      }

      const newContent = new TextEncoder().encode(JSON.stringify(newManifest, null, 2));

      const result = await this.storage.atomicUpdate(MANIFEST_PATH, newContent, etag);
      if (result.success) {
        this.lastEtag = result.newEtag || etag;
        this.lastManifest = newManifest;
        return manifestUpdate;
      }

      if (attempt < MAX_RETRIES - 1) {
        await onRetry();
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
