import { createClxDB, generateNewClxDB, type ClxDB } from '@/core';
import { normalizeOptions } from '@/core/utils/options';
import { createStorageBackend, deserializeStorageBackend } from '@/storages';
import {
  openIndexedDB,
  readIndexedDBValue,
  removeIndexedDBValue,
  writeIndexedDBValue,
} from '@/utils/indexeddb';
import { createClxUI, type ClxUI, type ClxUIOptions } from './clxui';
import type { ClxDBClientOptions, ClxDBOptions, DatabaseBackend, StorageBackend } from '@/types';

type ClxDBWithUI = ClxDB & { ui: ClxUI };
interface ClxDBWithUIOptions {
  database: DatabaseBackend;
  options?: ClxDBClientOptions;
  ui?: ClxUIOptions & {
    root?: HTMLElement;
    syncIndicator?: boolean;
  };
}

const UI_INDEXEDDB_VERSION = 1;
const UI_INDEXEDDB_STORE_NAME = 'ui';
const UI_LAST_STORAGE_KEY = 'last-storage-selection';

const resolveUIIndexedDBName = (options?: ClxDBOptions) =>
  `${options?.cacheStorageKey ?? 'clxdb_cache'}_ui`;

const openUIIndexedDB = async (options?: ClxDBOptions): Promise<IDBDatabase | null> => {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return null;
  }

  try {
    return await openIndexedDB({
      name: resolveUIIndexedDBName(options),
      version: UI_INDEXEDDB_VERSION,
      onUpgrade: database => {
        if (!database.objectStoreNames.contains(UI_INDEXEDDB_STORE_NAME)) {
          database.createObjectStore(UI_INDEXEDDB_STORE_NAME);
        }
      },
    });
  } catch {
    return null;
  }
};

const clearStoredStorageSelection = async (database: IDBDatabase | null): Promise<void> => {
  if (!database) {
    return;
  }

  try {
    await removeIndexedDBValue(database, UI_INDEXEDDB_STORE_NAME, UI_LAST_STORAGE_KEY);
  } catch {
    return;
  }
};

const readStoredStorageSelection = async (
  database: IDBDatabase | null
): Promise<StorageBackend | null> => {
  if (!database) {
    return null;
  }

  try {
    const storedSelection = await readIndexedDBValue<unknown>(
      database,
      UI_INDEXEDDB_STORE_NAME,
      UI_LAST_STORAGE_KEY
    );
    if (!storedSelection) {
      return null;
    }

    const storage = await deserializeStorageBackend(storedSelection);
    if (storage) {
      return storage;
    }

    await clearStoredStorageSelection(database);
    return null;
  } catch {
    return null;
  }
};

const persistStorageSelection = async (
  database: IDBDatabase | null,
  storage: StorageBackend
): Promise<void> => {
  if (!database) {
    return;
  }

  const serializedStorage = storage.serialize?.();
  if (!serializedStorage) {
    return;
  }

  try {
    await writeIndexedDBValue(
      database,
      UI_INDEXEDDB_STORE_NAME,
      UI_LAST_STORAGE_KEY,
      serializedStorage
    );
  } catch {
    return;
  }
};

export const startClxDBWithUI = async ({
  database,
  options: clientOptions,
  ui,
}: ClxDBWithUIOptions) => {
  const options = normalizeOptions(clientOptions);
  const clxui = createClxUI(ui);
  clxui.mount(ui?.root);

  const uiIndexedDB = await openUIIndexedDB(options);

  try {
    let storage = await readStoredStorageSelection(uiIndexedDB);
    let shouldPersistStorageSelection: boolean | null = null;

    while (true) {
      if (!storage) {
        const storageSelection = await clxui.openStoragePicker({ showPersistOption: true });
        if (!storageSelection) {
          return null;
        }

        shouldPersistStorageSelection = storageSelection.persist === true;
        storage = createStorageBackend(storageSelection);
      }

      const unlock = await clxui.openDatabaseUnlock({
        storage,
        allowStorageChange: true,
      });

      if (!unlock) {
        return;
      }

      if (unlock.mode === 'change-storage') {
        await clearStoredStorageSelection(uiIndexedDB);
        storage = null;
        continue;
      }

      const client = await (unlock.mode === 'open' ? createClxDB : generateNewClxDB)({
        database,
        storage,
        crypto: unlock.crypto,
        options,
      });

      await client.init();
      if (ui?.syncIndicator ?? true) {
        clxui.showSyncIndicator({ client });
      }

      if (unlock.update) {
        await unlock.update(client);
      }

      if (shouldPersistStorageSelection === true) {
        await persistStorageSelection(uiIndexedDB, storage);
      } else {
        await clearStoredStorageSelection(uiIndexedDB);
      }

      const clientWithUI = client as ClxDBWithUI;
      clientWithUI.ui = clxui;
      return clientWithUI;
    }
  } finally {
    uiIndexedDB?.close();
  }
};
