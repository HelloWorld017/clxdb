import { StorageConfig } from '../types';
import { createStorageBackend } from './storage-factory';
import { SyncEngine } from './sync-engine';
import type { StorageBackend, ClxDBOptions, SyncState, ClxDBEvents } from '../types';

export { SyncEngine } from './sync-engine';
export { createStorageBackend } from './storage-factory';

export function createSyncEngine(backend: StorageBackend, options?: ClxDBOptions): SyncEngine {
  return new SyncEngine(backend, options);
}

export function createClxDB(params: { storage: StorageBackend; options?: ClxDBOptions }): {
  syncEngine: SyncEngine;
  init: () => Promise<void>;
  start: () => void;
  stop: () => void;
  triggerSync: () => Promise<void>;
  forceCompaction: () => Promise<void>;
  getSyncState: () => SyncState;
  on: <K extends keyof ClxDBEvents>(event: K, listener: ClxDBEvents[K]) => () => void;
} {
  const syncEngine = createSyncEngine(params.storage, params.options);

  return {
    syncEngine,
    init: () => syncEngine.init(),
    start: () => syncEngine.start(),
    stop: () => syncEngine.stop(),
    triggerSync: () => syncEngine.triggerSync(),
    forceCompaction: () => syncEngine.forceCompaction(),
    getSyncState: () => syncEngine.getState(),
    on: (event, listener) => syncEngine.on(event, listener),
  };
}
