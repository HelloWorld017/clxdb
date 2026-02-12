export interface StorageBackend {
  read(path: string, range?: { start: number; end: number }): Promise<Uint8Array>;
  write(path: string, content: Uint8Array): Promise<void>;
  delete(path: string): Promise<void>;
  stat(path: string): Promise<{ etag: string; size: number; lastModified?: Date } | null>;
  atomicUpdate(
    path: string,
    content: Uint8Array,
    previousEtag: string
  ): Promise<{ success: boolean; newEtag?: string }>;
  list(path: string): Promise<string[]>;
}

export type StorageConfig =
  | { type: 'opfs'; path: string }
  | { type: 'webdav'; url: string; auth: { user: string; pass: string } }
  | { type: 'filesystem-access'; handle: FileSystemDirectoryHandle };

export type DocData = Record<string, unknown>;

export interface ShardDocument {
  id: string;
  at: number;
  seq: number;
  del: boolean;
  data?: DocData;
}

export interface DatabaseDocument {
  id: string;
  at: number;
  seq: number | null;
  del: boolean;
  data?: DocData;
}

export interface DatabaseBackend {
  read(id: string[]): Promise<(DatabaseDocument | null)[]>;
  readPendingIds(): Promise<string[]>;
  upsert(data: ShardDocument[]): Promise<void>;
  delete(data: ShardDocument[]): Promise<void>;

  /**
   * Two-step update
   *   * The update by user should be handled in two-step
   *   * Insertion / Update
   *     1. Mark as seq: null
   *     2. After the ClxDB sync, the ClxDB calls `upsert()` and updates the seq.
   *        This should not be replicated.
   *   * Deletion
   *     1. Mark as del: true, seq: null
   *     2. After the ClxDB sync, it commits the real deletion.
   *        This should not be replicated.
   *
   *  The rule:
   *     1. User update is always seq: null
   *     2. Only seq === null updates should be replicated.
   */
  replicate(onUpdate: () => void): () => void;
}

export interface ClxDBClientOptions {
  syncInterval?: number;
  compactionThreshold?: number;
  desiredShardSize?: number;
  maxShardLevel?: number;
  gcOnStart?: boolean;
  gcGracePeriod?: number;
  vacuumOnStart?: boolean;
  vacuumCount?: number;
  vacuumThreshold?: number;
  cacheStorageKey?: string | null;
}

export type ClxDBOptions = Required<ClxDBClientOptions>;

export type ClxDBCrypto =
  | { kind: 'master'; password: string }
  | { kind: 'quick-unlock'; password: string }
  | { kind: 'none' };

export type SyncState = 'idle' | 'pending' | 'syncing';

export interface ClxDBEvents {
  stateChange: (state: SyncState) => void;
  syncStart: (isPending: boolean) => void;
  syncComplete: () => void;
  syncError: (error: Error) => void;
  compactionStart: () => void;
  compactionComplete: () => void;
  compactionError: (error: Error) => void;
  vacuumStart: () => void;
  vacuumComplete: () => void;
  vacuumError: (error: Error) => void;
  documentsChanged: (documents: ShardDocument[]) => void;
}

export interface ClxUIOptions {
  position?: 'bottom-left' | 'bottom-right';
  theme?: 'light' | 'dark' | 'auto';
  labels?: {
    selectStorage: string;
    webdavUrl: string;
    webdavUser: string;
    webdavPass: string;
    connect: string;
    cancel: string;
  };
}

export type * from '@/schemas';
export type * from './utils';
