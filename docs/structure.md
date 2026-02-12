# `clxdb` Design Specification

This document defines the architecture of **clxdb**, a serverless synchronization engine that uses WebDAV and OPFS as backends.

---

## 1. Architecture Overview

### Design Philosophy

* **Bring Your Own Cloud (BYOC):** Leverages the user's own WebDAV storage.
* **Immutable Log-Structured:** All write operations (Create/Update/Delete) are handled by creating new files (Append-only). Existing files are never overwritten.
* **Tiered Storage:** A hierarchical structure (Level 0 -> 1 -> 2) balances write speed and read performance.

### Expected Workload

* **Documents:** 100 creations/hr, 10 updates/hr, 1 deletion/hr. Total ~20,000 docs, expected to grow up to 100MB.
* **Blobs:** 10 creations/hr, 0.1 deletions/hr. Total ~5,000 files, expected to grow up to 4GB.
* **Sync:** ~5 devices. Low concurrency is expected.

---

## 2. File System Structure

All binary data utilizes **Little Endian** byte ordering.

### 2.1 Directory Structure

```text
/
├── manifest.json                # [Mutable] Global State, Target for CAS
├── shards/                      # [Immutable] Document Logs (Includes C/U/D)
│   └── shard_{hash}.clx         # Level 0: Real-time, Level 1: Merged, Level 2: Stale
└── blobs/{hash:2}               # [Mutable] Binary Resource Packs
    ├── {hash}_{filename}.{ext}  # [Mutable] Uses sanitized filenames
    └── ...

```

### 2.2 `manifest.json` (Global State)

```typescript
interface Manifest {
  version: number;        // Protocol version (2)
  lastSequence: number;   // Logical clock (Lamport Clock)
  
  // Active shard list (Must be sorted from Oldest -> Newest)
  shardFiles: Array<{
    filename: string;           // Filename (includes hash)
    level: number;           // Packing level
    range: { min: number, max: number }; // Sequence range
  }>;
}

```

### 2.3 Document Shard (`*.clx`)

* **Format:** `[Header Length(4B)]` + `[Header JSON]` + `[Body JSONs]`
* **Content:** `INSERT`, `UPDATE`, and `DELETE` operations are all recorded as JSON Documents.

```typescript
interface ShardHeader {
  docs: Array<{
    id: string;         // Document ID
    at: number;         // Timestamp
    seq: number;        // Sequence number
    del: boolean;       // Deleted (Tombstone)
    offset: number;     // Starting byte position in Body
    len: number;        // Data length
  }>;
}

```

---

## 3. Tiered Compaction Strategy

To reduce WebDAV HTTP request overhead, clxdb adopts an **LSM-Tree** inspired approach.
Following is an example of 3-level sharding. The user can change the level of sharding.

* Initial Shards (Level 0)
  * Created when user creates/updates/deletes documents. (after debounce)
  * Real-time changes. Small file size (few KB). Count increases rapidly.

* Merged Shards (Level 1)
  * When there are >= 10 level 0 shards, they are packed into a shard

* Stale Shards (Level 2)
  * For the yielded shards whose size is larger than 5MB, it becomes a stale shard and not targeted for the compaction.

| Level | Creation Trigger | Description |
| --- | --- | --- |
| **Level 0** | User Write (after Debounce) |  |
| **Level 1** | When ≥ 10 shards | Intermediate files created by merging deltas (tens to hundreds of KB). |
| **Level 2** | When Level 1 files total ~5MB | Final optimized 5MB files |

---

## 4. Synchronization Protocol

### 4.1 WRITE (Push Process) - Idempotency & Completion Guarantee

The process of safely recording Database changes to the server.

1. **Buffer & Pack (Local):**
* Buffer database change logs (C/U/D) in memory.
* Serialize buffer into a Level 0 Shard and generate a filename via hash (`{hash}.clx`).


2. **Check Idempotency (Server):**
* Send `HEAD /shards/{hash}.clx`.
* **File exists:** Already uploaded (duplicate request or remnant of previous attempt). **Skip upload.**
* **File missing:** Upload file via `PUT`.


3. **Atomic Commit (Manifest CAS):**
* `GET` the `manifest.json`, append the new delta to the `shardFiles` list.
* Update via `PUT` using the `If-Match` header.
* On failure (412 Error), re-read the Manifest and retry.


4. **Ack to Database Backend:**
* **Only after the Manifest update succeeds (200 OK)**, send the "Sync Complete" signal to database backend.
* If previous steps fail, database backend treats it as "Failed" and retries in the next cycle (Exponential Backoff).



### 4.2 READ (Pull Process)

1. **Fetch Manifest:** Periodically poll `manifest.json`.
2. **Diff:** Compare the local "last seen" file list with the server list to identify **new files**.
3. **Partial Fetch:**
* Read only the **Header** of new files using a `Range Request`.
* Compare Document IDs and Revisions in the header with the local DB.


4. **Apply:** Download only the Bodies of documents newer than the local state and apply them to database backend (`bulkUpsert`).

> [!IMPORTANT]
> Pulling is prohibited for devices outdated by more than 1 year to prevent "Zombie" data issues.

---

## 5. Maintenance & Recovery

### 5.1 Compaction Process

Runs in the background to optimize read performance.

* **Definition of a "Dead Row":**
* A newer revision of the document exists.
* OR, it is a Tombstone (deleted) and is older than 1 year.



1. **Trigger:** Analyze Manifest `shardFiles` list (e.g., Level 0 files > 10).
2. **Merge:** Download target files and merge in memory. Remove Dead Rows.
3. **Write New Shard:** Create and upload a Level 1 or Level 2 Shard from the merged result.
4. **Switch Manifest:**
* Remove old files and add the new merged file in the Manifest.
* Perform CAS update.


5. **Mark for GC:** Files removed from the Manifest become "Orphans" and targets for GC (not deleted immediately).

### 5.2 Safe Garbage Collection (Dangling Shard Cleanup)

Safely removes "garbage files" caused by sync interruptions or conflicts.

* **Execution:** Executed **Asynchronously (Fire-and-Forget)** when `clxdb.init()` is called.
* **Algorithm (Cool-down Rule):**
1. Get the full server file list (`All`) and the Manifest file list (`Active`).
2. Identify `Orphans = All - Active`.
3. Check `Last-Modified` header for each Orphan.
4. Send `DELETE` only if **`(Current Time - Modified Time) > 1 hour`**.


* *Reason:* A recently uploaded file might be a "valid file" currently being added to the Manifest by another client.



### 5.3 Vacuum Process

Similar to Compaction, but based on the **Utilization Rate** of a shard.

1. **Trigger:** When the Utilization Rate drops below a threshold (e.g., Dead Rows in a shard exceed 15%).
2. **Write New Shards:** Generate a shard of `max(level - 1, 0)` after purging Dead Rows.
3. **Manifest CAS:** Follows the same procedure as Compaction.

---

## 6. Library API (Developer Interface)

```typescript
import { createClxDB, WebDAVBackend } from 'clxdb';

// 1. Backend Setup
const storage = new WebDAVBackend({
  url: 'https://my-cloud.com/dav',
  auth: { ... }
});

// 2. Initialization & Options
const clxdb = createClxDB({
  database: myRxDBInstance,
  storage,
  options: {
    syncInterval: 1000 * 60 * 5, // Sync every 5 mins (recommended)
    compactionThreshold: 10,     // Merge when 10 deltas accumulate
    gcOnStart: true              // Cleanup orphaned files older than 1hr on start
  }
});

// 3. Execution
await clxdb.init();

// 4. Blob Lazy Loading
const clxblobs = createClxBlobs({ storage });
const url = await clxblobs.getBlobUrl(digest);

```

---

## 7. Storage Interface (Storage Adapter API)

All backends (WebDAV, FileSystem Access API, etc.) must implement this interface.

```typescript
export interface StorageBackend {
  // 1. Read: Range requests required (to read headers only)
  read(path: string, range?: { start: number, end: number }): Promise<Uint8Array>;

  // 2. Write: Immutable files; must not overwrite (error if exists)
  write(path: string, content: Uint8Array): Promise<void>;

  // 3. Delete: Used for cleanup after Vacuum
  delete(path: string): Promise<void>;

  // 4. Metadata: To check ETag/Size
  stat(path: string): Promise<{ etag: string, size: number } | null>;

  // 5. Atomic Update: Exclusively for manifest.json
  // Local storage uses Locks; Remote storage uses If-Match ETag check.
  // Must fail (412 Precondition Failed) if previousEtag doesn't match server.
  atomicUpdate(path: string, content: Uint8Array, previousEtag: string): Promise<{ success: boolean, newEtag?: string }>;
}

```

---

## 8. Key Scenarios Summary

| Situation | Action & Processing |
| --- | --- |
| **New Row Added** | Create L0 file -> Idempotency check -> Upload -> Update Manifest. |
| **Row Edit/Delete** | No modification of existing files; create new L0 file with changes (Append-only). |
| **Fragmentation** | Merge L0 to L1 when count ≥ 10. Merge to L2 when size reaches 5MB (Compaction). |
| **Garbage Files** | Background cleanup of "unreferenced files older than 1 hour" upon app start. |

---

## 9. Error Handling & Edge Cases

1. **404 on Range Read:**
* If a shard file is missing during Pull, it was likely deleted by another client's **Vacuum**.
* **Action:** Immediately stop sync, re-read `manifest.json` from scratch, and restart with the new file list.


2. **Offline:**
* Queue tasks locally; resume `Push` process when connection is restored.


3. **Shutdown while Sync:**
* **File uploaded, Manifest update failed:** Database backends treats as failure -> Next run checks file existence (Skips upload) -> Retries Manifest update.
* **File not uploaded:** Database backends keeps pending changes -> Next run retries upload and Manifest update.



---

## 10. Interfaces

### Core Types

```typescript
export interface ClxDBOptions {
  syncInterval?: number;        // default: 5 mins
  compactionThreshold?: number; // default: 10 files
  desiredShardSize?: number;    // default: 5 * 1024 * 1024
  gcOnStart?: boolean;          // default: true
}

export type SyncState = 
  | 'idle'      // Waiting (fully synced)
  | 'pending'   // Local changes exist (not yet pushed - e.g., offline)
  | 'syncing'   // Sync in progress (upload/download)
  | 'offline';  // Network disconnected

export class ClxDB implements EventEmitter {
  constructor(
    private backend: StorageBackend,
    private database: DatabaseBackend,
    private options: ClxDBOptions
  );

  async init(): Promise<void>;
  start(): void;
  stop(): void;
  triggerSync(): Promise<void>;
  forceCompaction(): Promise<void>;
  getSyncState(): SyncState;
}

export function createClxDB(params: {
  storage: StorageBackend;
  database: DatabaseBackend;
  options?: ClxDBOptions;
}): ClxDB;

export type StorageConfig = 
  | { type: 'opfs'; path: string }
  | { type: 'webdav'; url: string; auth: { user: string; pass: string } }
  | { type: 'filesystem-access'; handle: FileSystemDirectoryHandle };

export function createStorageBackend(config: StorageConfig): StorageBackend;

```

### Blobs

```typescript
export class ClxBlobs {
  /** Retrieves the Blob URL. Checks local cache or downloads from remote. */
  getBlobUrl(digest: string): Promise<string>; 
  
  /** Uploads Blob data. Calculates hash first for idempotency check. */
  putBlob(data: Blob): Promise<string>; 
}

export function createClxBlobs(params: {
  storage: StorageBackend;
}): ClxBlobs;

```

### Local/Migration Interfaces

```typescript
// For local-only usage (e.g., OPFS)
export function createClxBlobs(params: {
  storage: StorageBackend;
}): Promise<ClxBlobs>;

// Migrating existing database to a different storage
export function migrateDB(params: {
  storage: StorageBackend;
  database: DatabaseBackend;
  options?: ClxDBOptions;
}): Promise<ClxDB>;

export function migrateBlobs(params: {
  storage: StorageBackend;
  blobs: ClxBlobs;
}): Promise<ClxBlobs>;

```

### UI Plugin

```typescript
export interface ClxUIOptions {
  position?: 'bottom-left' | 'bottom-right'; // Default: bottom-left
  theme?: 'light' | 'dark' | 'auto';
  labels?: {
    selectStorage: string;
    // ... other labels
  };
}

/** Vanilla JS implementation for DOM/Event management */
export class ClxUI {
  /** Renders UI to DOM. Indicator shows immediately; dialog remains hidden. */
  mount(options?: ClxUIOptions): void;
  unmount(): void;
  openStorageDialog(): Promise<StorageConfig | null>;
}

export function createClxUI(params: {
  clxdb: ClxDB;
  options: ClxUIOptions;
}): ClxUI;

```
