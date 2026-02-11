# AGENTS.md

## Project Overview

**clxdb** is a BYOC (Bring Your Own Cloud) local-first synchronized database. It provides a serverless synchronization engine that uses WebDAV or FileSystem Access API as storage backends, designed for single-page applications.

### Key Characteristics

- **Language**: TypeScript (strict mode enabled)
- **Package Manager**: pnpm (v10.18.3)
- **Module System**: ES Modules (`"type": "module"`)
- **Target**: Browser/SPA applications
- **License**: MIT

## Technology Stack

### Core Dependencies

- **zod** (^4.3.6) - Schema validation and type inference

### Dev Dependencies

- **TypeScript** (^5.9.3) with strict configuration
- **ESLint** (^9.39.2) with TypeScript support
- **Prettier** (^3.8.1) for code formatting
- **rxjs** (^7.8.2) - Reactive programming (peer dependency pattern)
- **rxdb** (17.0.0-beta.7) - Local-first database (peer dependency pattern)

## Project Structure

```
src/
├── core/
│   ├── clxdb.ts              # Main entry point
│   ├── types.ts              # Core internal types
│   ├── engines/              # Background processing engines
│   │   ├── sync-engine.ts    # Push/pull synchronization
│   │   ├── compaction-engine.ts  # Shard merging
│   │   ├── garbage-collector-engine.ts  # Orphan cleanup
│   │   └── vacuum-engine.ts  # Dead row removal
│   ├── managers/             # Resource managers
│   │   ├── manifest-manager.ts  # Manifest.json operations
│   │   └── shard-manager.ts     # Shard file operations
│   └── utils/
│       └── shard-utils.ts    # Shard encoding/decoding
├── storages/                 # Storage backend implementations
│   ├── webdav.ts
│   ├── filesystem.ts
│   └── index.ts
├── types/                    # Public API types
│   └── index.ts
├── schemas/                  # Zod schemas
│   └── index.ts
├── utils/                    # Shared utilities
│   ├── event-emitter.ts
│   ├── backoff.ts
│   ├── promise-pool.ts
│   ├── local-storage.ts
│   └── storage-error.ts
└── constants/                # Configuration constants
    └── index.ts
```

## Code Style & Conventions

### TypeScript Configuration

- **Strict mode**: Enabled (`strict: true`)
- **Module resolution**: Bundler
- **Path alias**: `@/*` maps to `./src/*`
- **No emit**: Type checking only (`noEmit: true`)
- **Composite**: Enabled for project references support

### Formatting (Prettier)

```yaml
arrowParens: avoid
bracketSameLine: false
quoteProps: consistent
semi: true
singleQuote: true
tabWidth: 2
trailingComma: es5
printWidth: 100
```

### Naming Conventions

- **Classes**: PascalCase (e.g., `SyncEngine`, `ManifestManager`)
- **Interfaces**: PascalCase (e.g., `StorageBackend`, `EngineContext`)
- **Type aliases**: PascalCase (e.g., `SyncState`, `DocOperation`)
- **Functions**: camelCase (e.g., `createClxDB`, `calculateHash`)
- **Variables**: camelCase (e.g., `syncInterval`, `manifestManager`)
- **Constants**: UPPER_SNAKE_CASE for true constants (e.g., `DEFAULT_SYNC_INTERVAL`)
- **Private members**: Prefix with underscore not used; rely on `private` keyword
- **Files**: kebab-case (e.g., `sync-engine.ts`, `shard-utils.ts`)
- **Directories**: kebab-case or single word lowercase

### Import Organization

Imports must follow this order (enforced by ESLint):

1. Built-in modules
2. External dependencies
3. Internal modules (`@/*` aliases)
4. Parent/Index/Sibling imports
5. Type imports (marked with `type` keyword)

Example:

```typescript
import { z } from 'zod';
import { EventEmitter } from '@/utils/event-emitter';
import type { EngineContext } from '../types';
import type { StorageBackend, SyncState } from '@/types';
```

### Code Patterns

1. **Type Imports**: Use `type` keyword for type-only imports (`@typescript-eslint/consistent-type-imports`)

2. **Arrow Functions**: Prefer arrow functions with implicit returns when possible (`arrow-body-style: as-needed`)

3. **Curly Braces**: Always use curly braces for control flow (`curly: all`)

4. **Quotes**: Single quotes for strings, template literals when needed

5. **Trailing Commas**: ES5 compatible (omit after last parameter)

6. **Unused Variables**: Prefix with underscore to ignore (`_unusedVar`)

7. **Error Handling**: Prefer explicit error types; use `StorageError` class for storage operations

8. **Async Patterns**: Use `Promise<void>` for async operations; avoid floating promises (use `void` prefix if intentional)

9. **Console**: Only `console.warn` and `console.error` allowed; use events for user-facing messages

## Architecture Patterns

### Engine Pattern

Background processing is organized into "Engines":

- Each engine extends `EventEmitter` for event-based communication
- Engines receive an `EngineContext` with shared dependencies
- Engines are initialized in `ClxDB.init()`

### Manager Pattern

Resource management uses "Managers":

- Encapsulate operations on specific resources (manifest, shards)
- Provide high-level APIs for complex operations
- Handle error recovery and retries

### Storage Backend Pattern

Storage implementations must conform to `StorageBackend` interface:

- Immutable writes (never overwrite existing files)
- Range read support for partial file access
- Atomic updates with CAS (Compare-And-Swap) for manifest.json
- List operations for directory scanning

### Event Emitter Pattern

All major components extend `EventEmitter`:

- Type-safe events using generic type parameters
- Events: `stateChange`, `syncStart`, `syncComplete`, `syncError`, `compactionStart`, `compactionComplete`, `documentsChanged`

## Commands

### Linting

```bash
pnpm run lint
```

Runs ESLint with TypeScript checking on all source files.

### Type Checking

TypeScript checking is integrated into ESLint via `typescript-eslint`. No separate `tsc` command is configured.

### Build

No build script is currently configured. The project is designed to be consumed as TypeScript source or bundled by the consumer.

## Testing

No test suite is currently configured. When adding tests:

- Consider using Vitest or Jest
- Mock storage backends for unit tests
- Test sync scenarios with controlled timing

## Common Tasks

### Adding a New Engine

1. Create file in `src/core/engines/{name}-engine.ts`
2. Extend `EventEmitter<ClxDBEvents>`
3. Accept `EngineContext` in constructor
4. Add initialization logic in `initialize()` method
5. Wire up in `ClxDB` class constructor

### Adding a New Storage Backend

1. Create file in `src/storages/{name}.ts`
2. Implement `StorageBackend` interface from `@/types`
3. Handle all required methods: `read`, `write`, `delete`, `stat`, `atomicUpdate`, `list`
4. Export from `src/storages/index.ts`

### Adding New Constants

1. Add to `src/constants/index.ts`
2. Use UPPER_SNAKE_CASE naming
3. Include units in comments (e.g., `// 5 minutes`)
4. Provide default values in `ClxDBOptions` interface

## Design Principles

1. **Immutable Storage**: Never overwrite existing files; write new files and update manifest
2. **CAS Operations**: All manifest updates use Compare-And-Swap for consistency
3. **Idempotency**: Uploads check file existence before writing
4. **Event-Driven**: Components communicate via events, not direct callbacks
5. **Tiered Sharding**: L0 (real-time) → L1 (merged) → L2 (optimized) compaction strategy
6. **Lazy Loading**: Fetch only required data using range requests
7. **Graceful Degradation**: Handle offline scenarios and partial failures

## Important Notes

- **No console.log**: Use events or the `warn`/`error` levels only
- **Strict TypeScript**: All code must pass strict type checking
- **No floating promises**: Prefix intentional floating promises with `void`
- **Error handling**: Emit an event on failures
- **GC Cooldown**: Garbage collection has a 1-hour cooldown to prevent race conditions
