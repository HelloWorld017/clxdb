# `clxdb` Design Specification

This document describes the current architectural decisions of **clxdb**.

---

## 1. Architecture Overview

### 1.1 Design Philosophy

- **Bring Your Own Cloud (BYOC):** clxdb does not require a central service. Storage is provided by user-owned backends (WebDAV or browser file systems).
- **Immutable data files + single mutable index:** shard/blob files are immutable; `manifest.json` is the only mutable coordination file.
- **Local-first convergence:** local changes are accepted immediately by the host database and reconciled through periodic pull/push.
- **Pluggable boundaries:** both storage and local database are adapter-based so host apps can integrate their existing stacks.

### 1.2 Runtime Scope

- Browser-first runtime
- Typical low-concurrency multi-device sync (personal/team small scale)
- No dedicated server process required

---

## 2. Storage Model

All binary lengths/footers use **Little Endian** where applicable.

### 2.1 Directory Layout

```text
/
├── manifest.json
├── shards/
│   └── shard_{hash}.clx
└── blobs/{hash:2}/
    └── {hash}.clb
```

### 2.2 Manifest as Global Coordination Point

`manifest.json` is the system index and coordination primitive:

- protocol version
- database UUID
- global sequence frontier (`lastSequence`)
- active shard index (`shardFiles[]` with level + sequence range)
- optional crypto envelope/signature metadata

Design rule:

- manifest updates must use **CAS semantics** (`atomicUpdate` + previous etag)

### 2.3 Shard Files (`*.clx`)

Shard concept:

- append-only immutable log segments for document mutations
- each shard carries compact metadata (`id`, `seq`, `timestamp`, tombstone flag, byte ranges)

Physical idea:

- header length prefix
- header payload
- body payloads

This supports:

- cheap metadata-first reads
- selective document body fetch
- deterministic sequence range indexing per shard

### 2.4 Blob Files (`*.clb`)

Blob concept:

- digest-addressed immutable binary object storage
- content keyed by SHA-256 digest
- chunked payload + footer metadata

Design goals:

- dedup-friendly addressing
- stream-friendly read path
- optional per-chunk encryption

---

## 3. Sharding, Compaction, and Leveling Strategy

clxdb follows an LSM-inspired model.

### 3.1 Level Assignment

- shard level is derived from size relative to target sizing parameters
- `desiredShardSize` defines long-term target size
- `compactionThreshold` influences growth ratio between levels
- `maxShardLevel` marks "stale"/high-level shards that stop normal upward compaction

Implication:

- applications can tune for write-heavy or read-heavy behavior

### 3.2 Compaction

Compaction merges dense shard sets within lower levels when threshold is reached.

Primary goals:

- reduce read amplification
- remove dead history (overwritten revisions, expired tombstones)
- keep manifest shard index manageable

Safety rule:

- compaction is skipped while unresolved local pending writes exist

### 3.3 Vacuum

Vacuum targets high-level/stale shards when live-data utilization drops below threshold.

Primary goals:

- reclaim dead space in long-lived shards
- reduce long-term storage bloat

This is complementary to compaction:

- compaction handles accumulation pressure
- vacuum handles low-utilization cleanup pressure

---

## 4. Synchronization Protocol

### 4.1 Push (Local -> Storage)

Design flow:

1. read local pending IDs (`seq: null`)
2. materialize documents to sync
3. pack immutable shard
4. append shard metadata via manifest CAS update
5. only after successful manifest commit, acknowledge local rows with concrete sequence

Design guarantees:

- manifest commit is the authoritative "sync success" boundary
- immutable shard writes make duplicate/retry attempts safe

### 4.2 Pull (Storage -> Local)

Design flow:

1. read latest manifest
2. select candidate shards by sequence range
3. fetch/parse headers first
4. fetch only relevant bodies
5. apply upserts/deletes to local database
6. advance local sequence frontier

### 4.3 Conflict Resolution Principle

When a document has local pending state and remote updates arrive,
remote application uses timestamp comparison (`at`) to avoid blindly overwriting newer local intent.

### 4.4 Pull-First Ordering

A sync cycle is intentionally **pull-first, then push**.

Why:

- pushes allocate new sequence numbers
- pulling first reduces divergence and avoids assigning sequences on stale local manifest state

---

## 5. Maintenance and Recovery

### 5.1 Garbage Collection (Orphan Shards)

GC identifies shard files present in storage but not referenced by manifest.

Deletion is delayed by a grace period (`gcGracePeriod`) and only attempted when backend metadata (`lastModified`) allows safe age checks.

Why delayed deletion:

- avoid deleting files that may have been uploaded by another client but not yet committed into manifest

### 5.2 Startup Maintenance Policy

GC and vacuum can run on startup as background maintenance tasks.
They are designed to be opportunistic and non-blocking for normal open/sync flow.

---

## 6. Crypto and Trust Model

### 6.1 Encryption Modes

- `none`: no encryption
- `master`: unlock with master password
- `quick-unlock`: unlock with per-device quick password/PIN material

### 6.2 Key Hierarchy

Design hierarchy:

1. user master password is stretched with a high work-factor KDF (1,500,000 iterations)
2. derived master key decrypts a stored wrapped root key
3. root key is used to derive context-specific keys for:
   - shard encryption
   - blob encryption
   - quick-unlock wrapping
   - manifest integrity signing

Benefits:

- key separation between domains (shards/blobs/signing)
- easier rotation/enrollment workflows

### 6.3 Manifest Integrity

Encrypted manifests carry an integrity signature (HMAC-based) over a stable JSON payload.
Any mismatch is treated as tampering/corruption.

### 6.4 Device Registry for Quick Unlock

Manifest crypto metadata stores a per-device registry:

- device id
- encrypted device-specific wrapped key
- device name
- last-used timestamp

Local quick-unlock material is cached in IndexedDB.

Design intent:

- master password remains global authority
- quick unlock is device-scoped convenience and revocable per device

### 6.5 Rotation and Recovery

- **Master password update:** re-wraps root-key envelope and resets quick-unlock registry policy accordingly
- **Quick unlock update:** enrolls or refreshes current device entry
- **Device removal:** revokes that device's quick unlock path without re-encrypting all data

### 6.6 Encryption Overhead

Per encrypted part overhead is AES-GCM IV + auth tag:

- IV: 12 bytes
- tag: 16 bytes

This overhead is accounted for in shard/blob sizing logic.

---

## 7. Adapter Contracts (Design-Level)

### 7.1 Storage Adapter

A storage adapter must support:

- byte reads (with range support)
- immutable file writes
- CAS-style manifest update
- listing/deletion/stat
- directory ensure/create behavior

Additional optional capabilities:

- directory browsing (`readDirectory`) for UI pickers
- self-describing metadata (`getMetadata`) for settings UX

### 7.2 Database Adapter

A database adapter must support:

- initialization per clxdb UUID
- ordered batched read by IDs
- pending-id enumeration
- applying synced upserts/deletes
- change subscription (`replicate`)

Core invariant:

- user-originated changes must be staged as `seq: null` until clxdb commit acknowledgement

---

## 8. Runtime Defaults and Tunables

Current defaults:

| Option                | Default           |
| --------------------- | ----------------- |
| `syncInterval`        | `60_000`          |
| `compactionThreshold` | `4`               |
| `desiredShardSize`    | `5 * 1024 * 1024` |
| `maxShardLevel`       | `6`               |
| `gcOnStart`           | `true`            |
| `gcGracePeriod`       | `60 * 60 * 1000`  |
| `vacuumOnStart`       | `true`            |
| `vacuumThreshold`     | `0.15`            |
| `vacuumCount`         | `3`               |
| `cacheStorageKey`     | `clxdb_cache`     |
| `databasePersistent`  | `true`            |

Design guidance:

- lower `compactionThreshold` favors read performance earlier (more merge activity)
- higher `maxShardLevel` tolerates more historical layering before vacuum pressure
- shorter `syncInterval` improves freshness but increases storage/network churn

---

## 9. Optional UI Layer

clxdb includes an optional React-based UI helper package for common flows:

- storage selection (WebDAV / FileSystem Access / OPFS)
- database unlock/create (master + quick unlock)
- settings (overview/encryption/devices/export placeholder)
- sync indicator

UI is an integration convenience, not a requirement of the sync core.

---

## 10. Current Boundaries and Non-Goals

- No central coordinator service (manifest + immutable files are the coordination model)
- No bundled server-managed auth lifecycle (BYOC model delegates to storage backend)
