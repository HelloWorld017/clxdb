import { GC_COOLDOWN_HOURS, SHARDS_DIR, SHARD_EXTENSION } from '@/constants';
import type { ManifestManager } from '../managers/manifest-manager';
import type { EngineContext } from '../types';
import type { StorageBackend } from '@/types';

export class GarbageCollectorEngine {
  private storage: StorageBackend;
  private manifestManager: ManifestManager;

  constructor({ storage, manifestManager }: EngineContext) {
    this.storage = storage;
    this.manifestManager = manifestManager;
  }

  async garbageCollect(): Promise<void> {
    try {
      const [allFiles, manifest] = await Promise.all([
        this.storage.list(SHARDS_DIR),
        this.manifestManager.read(),
      ]);

      if (!manifest) {
        return;
      }

      const activeFiles = new Set(manifest.manifest.shardFiles.map(s => s.filename));
      const orphans = this.identifyOrphans(allFiles, activeFiles);
      await this.deleteOldOrphans(orphans);
    } catch (error) {
      console.warn('Garbage collection failed:', error);
    }
  }

  private identifyOrphans(allFiles: string[], activeFiles: Set<string>): string[] {
    return allFiles.filter(f => !activeFiles.has(f) && f.endsWith(SHARD_EXTENSION));
  }

  private async deleteOldOrphans(orphans: string[]): Promise<void> {
    const oneHourAgo = Date.now() - GC_COOLDOWN_HOURS * 60 * 60 * 1000;

    const deletePromises = orphans.map(async orphan => {
      try {
        const stat = await this.storage.stat(`${SHARDS_DIR}/${orphan}`);
        if (stat?.lastModified && stat.lastModified.getTime() < oneHourAgo) {
          await this.storage.delete(`${SHARDS_DIR}/${orphan}`);
        }
      } catch {
        // Skip if stat or delete fails
      }
    });

    await Promise.allSettled(deletePromises);
  }
}
