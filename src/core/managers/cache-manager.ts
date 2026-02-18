import type { ClxDBOptions } from '@/types';
import type { ZodType } from 'zod';

const STORE_NAME = 'cache';
const DB_VERSION = 1;

const requestToPromise = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB request failed'));
    };
  });

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

    const request = window.indexedDB.open(`${this.options.cacheStorageKey}_${uuid}`, DB_VERSION);
    request.onupgradeneeded = () => {
      const opened = request.result;
      if (!opened.objectStoreNames.contains(STORE_NAME)) {
        opened.createObjectStore(STORE_NAME);
      }
    };

    const openedDb = await requestToPromise(request);
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

      const tx = database.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const value = await requestToPromise<unknown>(store.get(key));

      if (value === undefined) {
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

      const tx = database.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      await requestToPromise(store.put(value, key));
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

      const tx = database.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      await requestToPromise(store.delete(key));
    } catch {
      // Ignore removal errors
    }
  }
}
