import type { BlobMetadata } from '@/schemas';
import type { S3Provider } from '@/storages/s3';

export type StorageBackendMetadata =
  | {
      kind: 'webdav';
      endpoint: string;
    }
  | {
      kind: 's3';
      provider: S3Provider;
      endpoint: string;
      region: string;
      bucket: string;
      prefix: string;
    }
  | {
      kind: 'filesystem';
      provider: 'filesystem-access' | 'opfs';
      directoryName: string;
    };

export interface StorageBackend {
  read(path: string, range?: { start: number; end: number }): Promise<Uint8Array<ArrayBuffer>>;
  readDirectory?(path: string): Promise<string[]>;
  ensureDirectory?(path: string): Promise<void>;
  write(path: string, content: Uint8Array<ArrayBuffer>): Promise<void>;
  delete(path: string): Promise<void>;
  stat(path: string): Promise<{ etag: string; size: number; lastModified?: Date } | null>;
  atomicUpdate(
    path: string,
    content: Uint8Array,
    previousEtag: string
  ): Promise<{ success: boolean; newEtag?: string }>;
  list(path: string): Promise<string[]>;
  getMetadata?(): StorageBackendMetadata;
  serialize?(): unknown;
}

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
  initialize(uuid: string): Promise<void>;
  read(id: string[]): Promise<(DatabaseDocument | null)[]>;
  readPendingIds(): Promise<string[]>;
  upsert(data: ShardDocument[]): Promise<void>;
  delete(data: ShardDocument[]): Promise<void>;

  /**
   * Two-step update
   * * The update by user must be handled using a two-step mechanism.
   * * If deleting hinders you, consider using a soft-delete instead.
   *
   * > [!NOTE]
   * > There is one single rule:
   * > The user-originated updates are always `seq: null`
   *
   * * Insertion / Update
   *   1. Mark as `seq: null`
   *   2. After the ClxDB sync, the ClxDB calls `upsert()` and updates the seq.
   *      This does not need to be replicated, but doing so won't cause any errors.
   * * Deletion
   *   1. Mark as `del: true`, `seq: null`
   *   2. After the ClxDB sync, it commits the real deletion.
   *      This does not need to be replicated, but doing so won't cause any errors.
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
  cacheStorageKey?: string;
  databasePersistent?: boolean;
}

export type ClxDBOptions = Required<ClxDBClientOptions>;

export type ClxDBCrypto =
  | { kind: 'master'; password: string }
  | { kind: 'quick-unlock'; password: string }
  | { kind: 'none' };

export interface ClxDBParams {
  database: DatabaseBackend;
  storage: StorageBackend;
  crypto: ClxDBCrypto;
  options?: ClxDBClientOptions;
}

export type SyncState = 'idle' | 'pending' | 'syncing';

export type ClxDBEvents = {
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
};

export interface StoredBlob {
  digest: string;
  file(): Promise<File>;
  metadata(): Promise<BlobMetadata>;
  stream(): ReadableStream<Uint8Array>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type * from '@/schemas';
export type * from './utils';
