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
  seq: number;
  del: number | null;
  data?: DocData;
}

export interface DatabaseDocument {
  id: string;
  seq: number | null;
  data: DocData;
}

export interface DatabaseBackend {
  read(id: string[]): Promise<(DatabaseDocument | null)[]>;
  readPending?(): Promise<DatabaseDocument & { seq: null }[]>;
  upsert(data: ShardDocument[]): Promise<void>;
  delete(data: ShardDocument[]): Promise<void>;
  replicate(onUpdate: (updatedId: string) => void): () => void;
}

export interface ClxDBClientOptions {
  database: DatabaseBackend;
  storage: StorageBackend;
  syncInterval?: number;
  compactionThreshold?: number;
  desiredShardSize?: number;
  maxShardLevel?: number;
  gcOnStart?: boolean;
  vacuumOnStart?: boolean;
  vacuumCount?: number;
  vacuumThreshold?: number;
  cacheStorageKey?: string;
}

export type ClxDBOptions = Required<ClxDBClientOptions>;

export type SyncState = 'idle' | 'pending' | 'syncing';

export interface ClxDBEvents {
  stateChange: (state: SyncState) => void;
  syncStart: () => void;
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
