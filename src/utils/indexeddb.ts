import type { ZodType } from 'zod';

const STORE_NAME = 'cache';
const DB_VERSION = 1;

let db: IDBDatabase | null = null;
let dbName: string | null = null;

export interface IDBOptions {
  cacheStorageKey: string | null;
}

const requestToPromise = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB request failed'));
    };
  });

const ensureDatabase = async (options: IDBOptions): Promise<IDBDatabase | null> => {
  if (!options.cacheStorageKey || typeof window === 'undefined' || !window.indexedDB) {
    return null;
  }

  if (db && dbName === options.cacheStorageKey) {
    return db;
  }

  if (db && dbName !== options.cacheStorageKey) {
    db.close();
    db = null;
    dbName = null;
  }

  const request = window.indexedDB.open(options.cacheStorageKey, DB_VERSION);
  request.onupgradeneeded = () => {
    const opened = request.result;
    if (!opened.objectStoreNames.contains(STORE_NAME)) {
      opened.createObjectStore(STORE_NAME);
    }
  };

  const openedDb = await requestToPromise(request);
  openedDb.onversionchange = () => {
    openedDb.close();
    if (db === openedDb) {
      db = null;
      dbName = null;
    }
  };

  db = openedDb;
  dbName = options.cacheStorageKey;
  return db;
};

export async function readIndexedDB<T>(
  key: string,
  options: IDBOptions,
  schema: ZodType<T>
): Promise<T | null> {
  try {
    const database = await ensureDatabase(options);
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
      `Invalid data in IndexedDB for key "${options.cacheStorageKey}/${key}":`,
      result.error
    );
    return null;
  } catch {
    return null;
  }
}

export async function writeIndexedDB<T>(key: string, options: IDBOptions, value: T): Promise<void> {
  try {
    const database = await ensureDatabase(options);
    if (!database) {
      return;
    }

    const tx = database.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    await requestToPromise(store.put(value, key));
  } catch (error) {
    console.warn(
      `Failed to write to IndexedDB for key "${options.cacheStorageKey}/${key}":`,
      error
    );
  }
}

export async function removeIndexedDB(key: string, options: IDBOptions): Promise<void> {
  try {
    const database = await ensureDatabase(options);
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
