## `clxdb`

![Coded With AI](https://img.shields.io/badge/coded-with%20ai-black?style=flat-square)

### Description

A serverless synchronization engine that uses WebDAV or the FileSystem Access API for storage.
Sync documents and blobs via _your own cloud_. Designed for single-html applications.

### Warnings
> [!WARNING] DO NOT USE THIS IN PRODUCTION.
> ClxDB is not battle-tested. Use at your own risk.

### Screenshot

| ![Storage Selector](./docs/images/screenshot_storage.png) | ![Onboarding](./docs/images/screenshot_open.png) | ![Settings](./docs/images/screenshot_settings.png) |
| --------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------- |
| Storage Selector                                          | Onboarding                                       | Settings                                           |

### Features

- Bring-your-own-cloud sync
- Encryption support
- Optional UI components

### Example

```ts
import { createClxDB, createStorageBackend, generateNewClxDB } from 'clxdb';
import { createClxUI } from 'clxdb/ui';

// Assume these exist in your app.
const database = createDatabase();
const databaseAdapter = createDatabaseClxDBAdapter(database);

export const openClxDB = async () => {
  const clxui = createClxUI();

  // You can use the predefined UI for storage selection
  const storageSelection = await clxui.openStoragePicker();
  if (!storageSelection) {
    return;
  }

  const storage = createStorageBackend(storageSelection);

  // You can also use the predefined UI for unlock database
  const unlock = await clxui.openDatabaseUnlock({ storage });
  if (!unlock) {
    return;
  }

  const client = (unlock.mode === 'open' ? createClxDB : generateNewClxDB)({
    database: databaseAdapter,
    storage,
    crypto: unlock.crypto,
    options: {},
  });

  await client.init();

  if (unlock.update) {
    await unlock.update(client);
  }

  return client;
};

const client = await openClxDB();

// Write using your own database API.
// They will be synced automatically.
await database.updateDocument('doc-1', {
  title: 'Updated title',
  attachmentDigest: blobDigest,
});

// Write blobs
const blobDigest = await client.blobs.putBlob(
  new Blob(['hello clxdb']),
  { name: 'hello.txt' }
);
```

### Database Backend Interface

You should implement these methods to integrate your own backend with ClxDB.

```ts
import type { DatabaseDocument, ShardDocument } from 'clxdb';

export interface DatabaseBackend {
  // Initialize local storage for this clxdb instance uuid.
  initialize(uuid: string): Promise<void>;

  // Return documents in the same order as ids. Missing docs must be null.
  read(ids: string[]): Promise<(DatabaseDocument | null)[]>;

  // Return ids currently staged for sync (seq === null).
  readPendingIds(): Promise<string[]>;

  // Apply remote/synced upserts (seq is a concrete number).
  upsert(data: ShardDocument[]): Promise<void>;

  // Apply remote/synced deletions.
  delete(data: ShardDocument[]): Promise<void>;

  /**
   * Subscribe to local user-originated changes.
   * - User writes/deletes should be staged with seq: null.
   * - Only seq === null changes should trigger onUpdate.
   * - Return an unsubscribe function.
   */
  replicate(onUpdate: () => void): () => void;
}
```

You should know that the update by user must be handled in a two-step mechanism.  
If the deletion hinder you, consider to not delete. (use soft-delete)

> [!INFO] There are one single rule:  
> The user-originated updates are always `seq: null`

* Insertion / Update
  1. Mark as seq: null
  2. After the ClxDB sync, the ClxDB calls `upsert()` and updates the seq.
     This does not need to be replicated, but replicating it would not make any error.
* Deletion
  1. Mark as del: true, seq: null
  2. After the ClxDB sync, it commits the real deletion.
     This does not need to be replicated, but replicating it would not make any error.

### Expected Workload

- **Documents:** 100 creations/hr, 10 updates/hr, 1 deletion/hr. Total ~20,000 docs, expected to grow up to 100MB.
- **Blobs:** 10 creations/hr, 0.1 deletions/hr. Total ~5,000 files, expected to grow up to 4GB.
- **Sync:** ~5 devices. Low concurrency is expected.

These are not a hard limit, but exceeding these limits will make your database suboptimal.

### Storage Structure

```
/
├── manifest.json
├── shards/
│   └── shard_{hash}.clx
└── blobs/{hash:2}
    ├── {hash}.{clb}
    └── ...
```
