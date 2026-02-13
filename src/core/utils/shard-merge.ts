import { MAX_SYNC_AGE_DAYS } from '@/constants';
import type { EngineContext } from '../types';
import type { ShardDocInfo, ShardFileInfo } from '@/schemas';
import type { ShardDocument } from '@/types';

type ShardDocumentWithLen = ShardDocument & { len: number };

export async function mergeAliveShardDocuments(
  ctx: Pick<EngineContext, 'database' | 'shardManager'>,
  shards: ShardFileInfo[]
): Promise<ShardDocumentWithLen[]> {
  const shardHeaders = await ctx.shardManager.fetchHeaders(shards);
  const docsHeader = shardHeaders.flatMap(header => header.docs);
  const docsHeaderLatest = new Map<string, ShardDocInfo>();
  docsHeader.forEach(header => {
    const existing = docsHeaderLatest.get(header.id);
    if (existing && existing.seq > header.seq) {
      return;
    }

    docsHeaderLatest.set(header.id, header);
  });

  const docsIds = Array.from(new Set(docsHeader.map(header => header.id)));
  const docs = new Map(
    (await ctx.database.read(docsIds))
      .map(doc => doc && ([doc.id, doc] as const))
      .filter(doc => !!doc)
  );

  const aliveDocs = docsIds
    .map(id => {
      const header = docsHeaderLatest.get(id)!;
      const doc = docs.get(id);

      if (header.del) {
        const tombstoneAge = Date.now() - header.at;
        if (tombstoneAge > MAX_SYNC_AGE_DAYS * 24 * 60 * 60 * 1000) {
          return null;
        }
      }

      if (!doc) {
        return header.del ? header : null;
      }

      if (!doc.seq || doc.seq < header.seq) {
        throw new Error('There is pending changes in database');
      }

      return doc.seq === header.seq ? { ...doc, ...header } : null;
    })
    .filter(x => !!x);

  return aliveDocs.filter(x => !!x);
}
