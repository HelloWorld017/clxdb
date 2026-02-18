# AGENTS.md

## Project Snapshot

`clxdb` is a browser-first, local-first synchronization library with optional UI helpers.

Main capabilities:

- append-only shard-based document sync
- immutable, digest-addressed blob storage
- optional encryption (master password + per-device quick unlock)
- optional React UI flows (storage picker, unlock, settings, sync indicator)

## Runtime and Toolchain

- Package manager: `pnpm@10.18.3`
- Language: TypeScript (`strict: true`, `moduleResolution: bundler`)
- Module type: ESM (`"type": "module"`)
- Bundler: Vite library mode (`vite.config.ts`)
  - `src/index.ts` (core entry)
  - `src/ui/index.ts` (UI entry)
- Current `dist/` artifacts include:
  - `clxdb.js`, `clxdb.cjs`
  - `ui.js`, `ui.cjs`
  - hashed shared chunks (`index-*.js`, `index-*.cjs`)

## Repository Layout (Current)

```text
src/
  index.ts
  constants/
    index.ts
  schemas/
    index.ts
  types/
    index.ts
    utils.ts
  utils/
    backoff.ts
    classes.ts
    device-name.ts
    event-emitter.ts
    json.ts
    mime.ts
    promise-pool.ts
    storage-error.ts
  core/
    index.ts
    clxdb.ts
    types.ts
    engines/
      blobs-engine.ts
      compaction-engine.ts
      garbage-collector-engine.ts
      sync-engine.ts
      vacuum-engine.ts
    managers/
      cache-manager.ts
      crypto-manager.ts
      manifest-manager.ts
      shard-manager.ts
    utils/
      generate.ts
      inspect.ts
      options.ts
      shard-merge.ts
      shard-utils.ts
  storages/
    filesystem.ts
    index.ts
    webdav.ts
  ui/
    index.ts
    clxui.tsx
    constants.ts
    style.css
    types.ts
    hooks/
      use-debounced-value.ts
    components/
      database-unlock.tsx
      sync-indicator.tsx
      common/
        dialog.tsx
        pin-input.tsx
        presence.tsx
      storage-picker/
        directory-picker.tsx
        icons.tsx
        index.ts
        storage-picker.tsx
        utils.ts
      database-settings/
        database-settings.tsx
        devices-tab.tsx
        encryption-tab.tsx
        export-tab.tsx
        icons.tsx
        index.ts
        overview-tab.tsx
        types.ts
        utils.ts
  definitions/
    global.d.ts

examples/
  diary/
    index.html
  todo/
    index.html
    index.css
    index.tsx
```

## Public API Surface

From `src/index.ts`:

- `createClxDB(params)`
- `generateNewClxDB(params)`
- `inspectClxDBStatus(storage, options?)`
- `createStorageBackend(config)`
- core/storage/schema type exports

From `src/ui/index.ts`:

- `createClxUI(options?)`
- `ClxUI`, `ClxUIOptions`
- `DatabaseUnlockOperation`
- storage picker selection types

Important:

- `startClxDBWithUI(...)` exists in `src/ui/clxui.tsx`, but is not re-exported by
  `src/ui/index.ts`.

## Core Architecture

### Main class (`src/core/clxdb.ts`)

`ClxDB` wires managers and engines, and owns lifecycle/state.

State machine:

- `idle`
- `pending`
- `syncing`

`init()` flow:

1. `manifestManager.initialize()`
2. `database.initialize(uuid)`
3. `cacheManager.initialize(uuid)`
4. `cryptoManager.initialize()`
5. `shardManager.initialize()`
6. `syncEngine.initialize()`
7. `sync()`
8. `touchCurrentDeviceKey()`
9. optional fire-and-forget GC/vacuum on start
10. subscribe to `database.replicate(...)`
11. start interval sync if `syncInterval > 0`

### Managers

- `ManifestManager`: reads/parses manifest, caches etag/manifest, CAS updates with retry.
- `ShardManager`: writes/reads shard files and headers, range reads, header cache persistence.
- `CacheManager`: IndexedDB wrapper for sequence/header/device-key cache entries.
- `CryptoManager`: root key lifecycle, shard/blob encryption, manifest signing, device registry.

### Engines

- `SyncEngine`: pull first, then push local pending docs.
- `CompactionEngine`: merges shard groups by level when threshold is met.
- `VacuumEngine`: rewrites stale-level shards when dead-data ratio crosses threshold.
- `GarbageCollectorEngine`: deletes orphan shard files after a grace period.
- `ClxBlobs`: digest-based blob put/get/delete and streaming decode.

## Storage Data Layout

```text
/
  manifest.json
  shards/
    shard_<sha256>.clx
  blobs/
    <digest_prefix_2>/
      <digest>.clb
```

- `manifest.json` is the only mutable file and must be updated via `atomicUpdate`.
- shard/blob files are immutable writes (`write` should fail when file already exists).

## Adapter Contracts

### StorageBackend (`src/types/index.ts`)

Required methods:

- `read(path, range?)`
- `ensureDirectory(path)`
- `write(path, content)`
- `delete(path)`
- `stat(path)`
- `atomicUpdate(path, content, previousEtag)`
- `list(path)`

Optional:

- `readDirectory(path)` (used by directory picker UI)
- `getMetadata()` (used by settings overview UI)

Built-in implementations:

- `WebDAVBackend`
- `FileSystemBackend` (`filesystem-access` and `opfs`)

### DatabaseBackend (`src/types/index.ts`)

Required methods:

- `initialize(uuid)`
- `read(ids)` (must preserve input order)
- `readPendingIds()`
- `upsert(data)`
- `delete(data)`
- `replicate(onUpdate)`

Behavior expectations:

- user-originated writes/deletes are staged with `seq: null`
- `replicate` should notify when those staged local changes appear
- push ack currently goes through `database.upsert(...)` with synced shard documents,
  including tombstones
- pull applies non-deleted docs via `upsert` and deleted docs via `delete`

## Crypto Model (Current Implementation)

- Encryption algorithm: `AES-GCM`
- Per encrypted chunk/part overhead: IV 12 bytes + auth tag 16 bytes
- Manifest integrity: HMAC signature over stable JSON payload
- Encrypted manifest stores:
  - wrapped root key (`masterKey`, `masterKeySalt`)
  - per-device quick unlock registry (`deviceKey`)
  - `nonce`, `timestamp`, `signature`
- Quick unlock is per-device and uses IndexedDB-cached device key material.

If you modify crypto behavior, inspect `src/core/managers/crypto-manager.ts` carefully.

## Defaults (`normalizeOptions`)

From `src/core/utils/options.ts`:

- `syncInterval`: `60_000`
- `compactionThreshold`: `4`
- `desiredShardSize`: `5 * 1024 * 1024`
- `maxShardLevel`: `6`
- `gcOnStart`: `true`
- `gcGracePeriod`: `60 * 60 * 1000`
- `vacuumOnStart`: `true`
- `vacuumThreshold`: `0.15`
- `vacuumCount`: `3`
- `cacheStorageKey`: `clxdb_cache`
- `databasePersistent`: `true`

## Development Commands

- `pnpm dev`
- `pnpm build`
- `pnpm typecheck`
- `pnpm lint`

## Testing Status

No dedicated automated test suite is configured yet.
Manual verification is usually done through `examples/todo` and `examples/diary`.
