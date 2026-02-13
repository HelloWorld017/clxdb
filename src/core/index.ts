import { ClxDB } from './clxdb';

export const createClxDB = (...args: ConstructorParameters<typeof ClxDB>) => new ClxDB(...args);
export const inspectClxDBStatus = (...args: Parameters<typeof ClxDB.inspectDatabaseStatus>) =>
  ClxDB.inspectDatabaseStatus(...args);

export type { ClxDBDatabaseStatus } from './clxdb';
