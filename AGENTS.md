# AGENTS.md

## Project Snapshot

`clxdb` is a browser-first local-first sync library.

- Core: append-only shard-based synchronization engine.
- Storage: BYOC style adapters (WebDAV, FileSystem Access API, OPFS).
- Security: optional encryption with master password + per-device quick unlock.
- UI: optional React components for storage selection, unlock flows, and settings.

This file reflects the current codebase structure and behavior.

## Runtime, Build, and Packaging

- Package manager: `pnpm@10.18.3`
- Language: TypeScript (`strict: true`, `moduleResolution: bundler`)
- Module type: ESM (`"type": "module"`)
- Library bundler: Vite library mode
- Build outputs:
  - ESM: `dist/clxdb.js`
  - CJS/UMD: `dist/clxdb.umd.cjs`

## Current Tech Stack

### Runtime dependencies

- `react@19.2.x`
- `react-dom@19.2.x`
- `zod@4.3.x`

### Tooling

- `typescript@6.0.0-beta`
- `vite@7.3.x`
- `@vitejs/plugin-react-swc`
- `tailwindcss@4.1.x` + `@tailwindcss/vite`
- `eslint@9.39.x` + `typescript-eslint@8.54.x` + `eslint-plugin-import-x`
- `prettier@3.8.x` (+ tailwind/classnames/merge plugins)

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
    event-emitter.ts
    promise-pool.ts
    backoff.ts
    storage-error.ts
    device-name.ts
    json.ts
  core/
    clxdb.ts
    types.ts
    engines/
      sync-engine.ts
      compaction-engine.ts
      vacuum-engine.ts
      garbage-collector-engine.ts
    managers/
      manifest-manager.ts
      shard-manager.ts
      cache-manager.ts
      crypto-manager.ts
    utils/
      options.ts
      generate.ts
      inspect.ts
      shard-utils.ts
      shard-merge.ts
  storages/
    index.ts
    webdav.ts
    filesystem.ts
  ui/
    index.ts
    storage-picker.tsx
    database-unlock.tsx
    common/
      pin-input.tsx
    database-settings/
      database-settings.tsx
      overview-tab.tsx
      encryption-tab.tsx
      devices-tab.tsx
      export-tab.tsx
      types.ts
      utils.ts
  definitions/
    global.d.ts

examples/
  storage-picker/
    index.html
    index.css
    index.tsx
  todo/
    index.html
    index.css
    index.tsx
```

## Public API Surface

From `src/index.ts`:

- Core creators:
  - `createClxDB(...)`
  - `generateNewClxDB(...)`
  - `inspectClxDBStatus(...)`
- Storage factory:
  - `createStorageBackend(...)`
- UI exports:
  - `StoragePicker`
  - `DatabaseUnlock`
  - `DatabaseSettings`
- Type exports:
  - core/runtime/storage/UI related public types

## Core Architecture

### Main class (`ClxDB`)

`src/core/clxdb.ts` wires managers + engines and owns lifecycle/state:

- State machine: `idle | pending | syncing`
- Lifecycle:
  1. `manifestManager.initialize()`
  2. `database.initialize(uuid)`
  3. `cacheManager.initialize(uuid)`
  4. `cryptoManager.initialize()`
  5. `shardManager.initialize()`
  6. `syncEngine.initialize()`
  7. initial `sync()`
  8. optional background GC/Vacuum
  9. replication callback hookup (`database.replicate(...)`)

### Engines

- `SyncEngine`
  - Pulls remote updates by manifest diff and shard header/body reads.
  - Pushes local pending documents (`seq === null`) as new shards.
- `CompactionEngine`
  - Merges shard groups per level when threshold is reached.
- `VacuumEngine`
  - Rewrites stale shards when utilization drops below threshold.
- `GarbageCollectorEngine`
  - Deletes orphaned shard files older than `gcGracePeriod`.

### Managers

- `ManifestManager`
  - Reads/parses manifest and performs CAS update via `atomicUpdate`.
- `ShardManager`
  - Reads/writes encrypted shard headers + bodies.
  - Maintains in-memory + IndexedDB header cache.
- `CacheManager`
  - IndexedDB wrapper for cache objects (`lastSequence`, headers, device key).
- `CryptoManager`
  - Handles master-key, quick-unlock device key, shard encryption, manifest signing.

## Crypto and Security Model

- Encryption algorithm: `AES-GCM`
- Key derivation:
  - master password: `PBKDF2` (`1_500_000` iterations, `SHA-256`)
  - shard and quick-unlock derivations: `HKDF`
- Manifest integrity: `HMAC SHA-256` signature over stable JSON payload.
- Device registry is stored in `manifest.crypto.deviceKey` and can be managed from `ClxDB` methods/UI.

## Storage Contract

Any adapter must satisfy `StorageBackend` in `src/types/index.ts`:

- `read(path, range?)`
- `write(path, content)`
- `delete(path)`
- `stat(path)`
- `atomicUpdate(path, content, previousEtag)`
- `list(path)`
- Optional `getMetadata()` for UI overview cards

Implemented adapters:

- `WebDAVBackend` (`src/storages/webdav.ts`)
- `FileSystemBackend` for `filesystem-access` and `opfs` (`src/storages/filesystem.ts`)

## Database Contract

Any local database adapter passed to `createClxDB(...)` must satisfy `DatabaseBackend` in
`src/types/index.ts`:

- `initialize(uuid)`
- `read(ids)`
- `readPendingIds()`
- `upsert(data)`
- `delete(data)`
- `replicate(onUpdate)`

Behavioral expectations:

- User-originated create/update/delete operations should be staged with `seq: null`.
- `readPendingIds()` should return IDs currently staged with `seq: null`.
- `replicate(onUpdate)` should notify ClxDB when local staged changes occur.
- Sync-ack writes from ClxDB (`upsert/delete` with concrete `seq`) should not re-trigger
  replication callbacks.
- `read(ids)` must preserve input order and return `(DatabaseDocument | null)[]`.

Reference implementation:

- Example adapter in `examples/todo/index.tsx` (`TodoDatabase.getClxDBAdapter()`).

## Defaults and Important Constants

From `src/constants/index.ts` + `normalizeOptions(...)`:

- `syncInterval`: 5 minutes
- `compactionThreshold`: 4
- `desiredShardSize`: 5 MB
- `maxShardLevel`: 6
- `gcOnStart`: `true`
- `gcGracePeriod`: 1 hour
- `vacuumOnStart`: `true`
- `vacuumThreshold`: `0.15`
- `vacuumCount`: `3`
- `cacheStorageKey`: `clxdb_cache`
- `MAX_SYNC_AGE_DAYS`: `365`

## Coding Conventions

### TypeScript

- Keep strict typing; avoid `any`.
- Prefer explicit exported types for public APIs.
- Use `type` imports where applicable (`@typescript-eslint/consistent-type-imports`).

### Imports

ESLint enforces this group order:

1. `builtin`
2. `external`
3. `internal` (`@/...`)
4. `parent`
5. `index`
6. `sibling`
7. `type`

### Lint/style rules to preserve

- Single quotes
- Curly braces required (`curly: all`)
- `console.log` is disallowed (`console.warn`/`console.error` allowed)
- Camelcase rule enabled (`properties: never`)
- Prettier is integrated via ESLint (`prettier/prettier`)

### Formatting

From `.prettierrc`:

- `semi: true`
- `singleQuote: true`
- `printWidth: 100`
- `tabWidth: 2`

## Development Commands

- Start dev server: `pnpm dev`
- Build library bundle: `pnpm build`
- Type check: `pnpm typecheck`
- Lint: `pnpm lint`

Examples are plain Vite entry HTML files under `examples/*/index.html`.

## Testing Status

There is no dedicated automated test suite configured yet.

When adding tests later, prefer covering:

- sync conflict scenarios
- manifest CAS retries
- shard merge/vacuum behavior
- crypto/unlock flows

## Common Workflows

### Create a brand-new database

Use `generateNewClxDB(...)`.

- It creates and writes `manifest.json`.
- It signs initial manifest when encryption is enabled.

### Open an existing database

Use `createClxDB(...)` + `await client.init()`.

- `ManifestManager.initialize()` expects existing manifest.
- If manifest does not exist, creation path must be used.

### Add a storage backend

1. Implement `StorageBackend`
2. Respect immutable-write semantics (existing file => error)
3. Implement CAS in `atomicUpdate`
4. Export from `src/storages/index.ts`
5. Optionally expose `getMetadata()` for `DatabaseSettings` overview

### Add or modify UI settings features

- Main container: `src/ui/database-settings/database-settings.tsx`
- Tab-level logic:
  - `overview-tab.tsx`
  - `encryption-tab.tsx`
  - `devices-tab.tsx`
  - `export-tab.tsx`
- Integration contract: `DatabaseSettingsClient` in `src/ui/database-settings/types.ts`

## Gotchas

- `createClxDB` does not create database files; it assumes manifest exists.
- Compaction and vacuum skip work while local pending updates exist.
- GC and vacuum are enabled on start by default via normalized options.
- Cache behavior depends on browser IndexedDB availability.
- UI export/import tab is currently presentation-only (disabled actions).
