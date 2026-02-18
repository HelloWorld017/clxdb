export const PROTOCOL_VERSION = 2;
export const MAX_SYNC_AGE_DAYS = 365;
export const LITTLE_ENDIAN = true;

// Options
export const DEFAULT_SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes
export const DEFAULT_COMPACTION_THRESHOLD = 4;
export const DEFAULT_GC_GRACE_PERIOD = 1 * 60 * 60 * 1000;
export const DEFAULT_DESIRED_SHARD_SIZE = 5 * 1024 * 1024; // 5MB
export const DEFAULT_MAX_SHARD_LEVEL = 6;
export const DEFAULT_VACUUM_THRESHOLD = 0.15; // 15%
export const DEFAULT_VACUUM_COUNT = 3;
export const DEFAULT_CACHE_STORAGE_KEY = 'clxdb_cache';

// Manifest
export const MANIFEST_PATH = 'manifest.json';

// Shards
export const SHARDS_DIR = 'shards';
export const SHARD_VERSION = 1;
export const SHARD_EXTENSION = '.clx';
export const SHARD_HEADER_LENGTH_BYTES = 4;

// Blobs
export const BLOBS_DIR = 'blobs';
export const BLOB_VERSION = 1;
export const BLOB_EXTENSION = '.clb';
export const BLOB_MAX_FILENAME_SIZE = 128;
export const BLOB_CHUNK_SIZE = 1024 * 1024;
export const BLOB_FOOTER_LENGTH_BYTES = 4;

// Cache Keys
export const CACHE_DEVICE_KEY_STORE_KEY = 'device_key';
export const CACHE_LAST_SEQUENCE_KEY = 'lastSequence';
export const CACHE_HEADERS_KEY = 'headers';
export const CACHE_HEADERS_VERSION = 1;

// Crypto
export const CRYPTO_ENCRYPTION_ALGORITHM = 'AES-GCM';
export const CRYPTO_HASH_ALGORITHM = 'SHA-256';
export const CRYPTO_DERIVATION_ALGORITHM = 'HKDF';
export const CRYPTO_DERIVATION_MASTER_ALGORITHM = 'HKDF';
export const CRYPTO_AUTH_ALGORITHM = 'HMAC';
export const CRYPTO_DERIVATION_MASTER_ITERATIONS = 1_500_000;
export const CRYPTO_ENCRYPTION_IV_SIZE = 12;
export const CRYPTO_ENCRYPTION_AUTH_TAG_SIZE = 16;
