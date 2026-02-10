import { GC_COOLDOWN_HOURS } from '@/constants';
import { manifestSchema } from '@/schemas';
import type { StorageBackend, Manifest } from '@/types';

const SHARDS_DIR = 'shards';
const SHARD_EXTENSION = '.clx';

export class GarbageCollector {
  private backend: StorageBackend;

  constructor(backend: StorageBackend) {
    this.backend = backend;
  }

  async run(): Promise<void> {
    try {
      // FIXME migrate this to manifest-manager
      const [allFiles, manifest] = await Promise.all([
        this.backend.list(SHARDS_DIR),
        this.fetchManifest(),
      ]);

      if (!manifest) {
        return;
      }

      const activeFiles = new Set(manifest.shardFiles.map(s => s.filename));
      const orphans = this.identifyOrphans(allFiles, activeFiles);

      await this.deleteOldOrphans(orphans);
    } catch (error) {
      console.warn('Garbage collection failed:', error);
    }
  }

  // FIXME remove this, in favor of manifest-manager
  private async fetchManifest(): Promise<Manifest | null> {
    try {
      const content = await this.backend.read('manifest.json');
      const parsed = JSON.parse(new TextDecoder().decode(content)) as unknown;
      const result = manifestSchema.safeParse(parsed);
      return result.success ? (result.data as Manifest) : null;
    } catch {
      return null;
    }
  }

  private identifyOrphans(allFiles: string[], activeFiles: Set<string>): string[] {
    return allFiles.filter(f => !activeFiles.has(f) && f.endsWith(SHARD_EXTENSION));
  }

  private async deleteOldOrphans(orphans: string[]): Promise<void> {
    const oneHourAgo = Date.now() - GC_COOLDOWN_HOURS * 60 * 60 * 1000;

    const deletePromises = orphans.map(async orphan => {
      try {
        const stat = await this.backend.stat(`${SHARDS_DIR}/${orphan}`);
        if (stat?.lastModified && stat.lastModified.getTime() < oneHourAgo) {
          await this.backend.delete(`${SHARDS_DIR}/${orphan}`);
        }
      } catch {
        // Skip if stat or delete fails
      }
    });

    await Promise.allSettled(deletePromises);
  }
}
