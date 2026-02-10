export interface StorageBackend {
  /** Read file content, optionally with range request */
  read(path: string, range?: { start: number; end: number }): Promise<Uint8Array>;

  /** Write file content (immutable - should not overwrite existing files) */
  write(path: string, content: Uint8Array): Promise<void>;

  /** Delete a file */
  delete(path: string): Promise<void>;

  /** Get file metadata (etag and size) */
  stat(path: string): Promise<{ etag: string; size: number; lastModified?: Date } | null>;

  /** Atomic update with CAS (Compare-And-Swap) - exclusively for manifest.json */
  atomicUpdate(
    path: string,
    content: Uint8Array,
    previousEtag: string
  ): Promise<{ success: boolean; newEtag?: string }>;

  /** List files in a directory */
  list(path: string): Promise<string[]>;
}

export type StorageConfig =
  | { type: 'opfs'; path: string }
  | { type: 'webdav'; url: string; auth: { user: string; pass: string } }
  | { type: 'filesystem-access'; handle: FileSystemDirectoryHandle };

export interface Manifest {
  version: number;
  lastSequence: number;
  shardFiles: ShardFileInfo[];
}

export type DocData = Record<string, unknown>;

export interface ShardFileInfo {
  filename: string;
  level: 0 | 1 | 2;
  range: { min: number; max: number };
}

export interface ShardHeader {
  docs: ShardDocInfo[];
}

export interface ShardDocInfo {
  id: string;
  rev: string;
  seq: number;
  del: boolean;
  offset: number;
  len: number;
}

export interface ShardDocument {
  id: string;
  rev: string;
  seq: number;
  del: boolean;
  data?: DocData;
}

export type DocOperation =
  | { type: 'INSERT'; id: string; rev: string; seq: number; data: DocData }
  | { type: 'UPDATE'; id: string; rev: string; seq: number; data: DocData }
  | { type: 'DELETE'; id: string; rev: string; seq: number };

export interface ClxDBOptions {
  syncInterval?: number;
  compactionThreshold?: number;
  desiredShardSize?: number;
  gcOnStart?: boolean;
  vacuumThreshold?: number;
  cacheStorageKey?: string | null;
}

export type SyncState = 'idle' | 'pending' | 'syncing' | 'offline';

export interface ClxDBEvents {
  stateChange: (state: SyncState) => void;
  syncStart: () => void;
  syncComplete: () => void;
  syncError: (error: Error) => void;
  compactionStart: () => void;
  compactionComplete: () => void;
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
