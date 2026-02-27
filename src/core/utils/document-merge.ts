import type { DocumentsMergeRule, ShardDocument } from '@/types';

export const isDocumentARecent = (documentA: ShardDocument, documentB: ShardDocument) => {
  if (documentA.seq > documentB.seq) {
    return true;
  }

  if (documentA.seq === documentB.seq && documentA.at > documentB.at) {
    return true;
  }

  return false;
};

export const mergeToLatestDocument: DocumentsMergeRule = async (database, changes) => {
  const pendingIdsSet = new Set(await database.readPendingIds());
  const timestampByPendingId = new Map(
    (await database.read(Array.from(pendingIdsSet))).filter(x => !!x).map(doc => [doc.id, doc.at])
  );

  return changes.filter(change => {
    const localTimestamp = timestampByPendingId.get(change.id);
    return !localTimestamp || localTimestamp < change.at;
  });
};
