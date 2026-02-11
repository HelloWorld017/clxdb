## `clxdb`

![Coded With AI](https://img.shields.io/badge/coded-with%20ai-black?style=flat-square)

### Description

A serverless synchronization engine that uses WebDAV or the FileSystem Access API for storage.
Sync documents and blobs via _your own cloud_. Designed for single-html applications.

### Features

- Bring-your-own-cloud sync
- Encryption support
- Optional UI components

### Expected Workload

- **Documents:** 100 creations/hr, 10 updates/hr, 1 deletion/hr. Total ~20,000 docs, expected to grow up to 100MB.
- **Blobs:** 10 creations/hr, 0.1 deletions/hr. Total ~5,000 files, expected to grow up to 4GB.
- **Sync:** ~5 devices. Low concurrency is expected.

### Storage Structure

```
/
├── manifest.json
├── shards/
│   └── shard_{hash}.clx
└── blobs/{hash:2}
    ├── {hash}_{filename}.{ext}
    └── ...
```
