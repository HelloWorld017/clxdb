import {
  openIndexedDB,
  readIndexedDBValue,
  removeIndexedDBValue,
  writeIndexedDBValue,
} from '@/utils/indexeddb';
import type { ClxDBOptions } from '@/types';
import type { ZodType } from 'zod';

const STORE_NAME = 'cache';
const DB_VERSION = 1;

export class CacheManager {
  private options: ClxDBOptions;
  private cacheDatabase: IDBDatabase | null = null;

  constructor(options: ClxDBOptions) {
    this.options = options;
  }

  async initialize(uuid: string) {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return null;
    }

    if (this.cacheDatabase) {
      return this.cacheDatabase;
    }

    const openedDb = await openIndexedDB({
      name: `${this.options.cacheStorageKey}_${uuid}`,
      version: DB_VERSION,
      onUpgrade: database => {
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME);
        }
      },
    });

    openedDb.onversionchange = () => {
      openedDb.close();
      this.cacheDatabase = null;
    };

    this.cacheDatabase = openedDb;
  }

  destroy() {
    this.cacheDatabase?.close();
  }

  async readIndexedDB<T>(key: string, schema: ZodType<T>): Promise<T | null> {
    try {
      const database = this.cacheDatabase;
      if (!database) {
        return null;
      }

      const value = await readIndexedDBValue<unknown>(database, STORE_NAME, key);

      if (value === null) {
        return null;
      }

      const result = schema.safeParse(value);
      if (result.success) {
        return result.data;
      }

      console.warn(
        `Invalid data in IndexedDB for key "${this.options.cacheStorageKey}/${key}":`,
        result.error
      );
      return null;
    } catch {
      return null;
    }
  }

  async writeIndexedDB<T>(key: string, value: T): Promise<void> {
    try {
      const database = this.cacheDatabase;
      if (!database) {
        return;
      }

      await writeIndexedDBValue(database, STORE_NAME, key, value);
    } catch (error) {
      console.warn(
        `Failed to write to IndexedDB for key "${this.options.cacheStorageKey}/${key}":`,
        error
      );
    }
  }

  async removeIndexedDB(key: string): Promise<void> {
    try {
      const database = this.cacheDatabase;
      if (!database) {
        return;
      }

      await removeIndexedDBValue(database, STORE_NAME, key);
    } catch {
      // Ignore removal errors
    }
  }
}
