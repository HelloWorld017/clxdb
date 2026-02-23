export const requestToPromise = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB request failed'));
    };
  });

const transactionToPromise = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => {
      resolve();
    };

    transaction.onerror = () => {
      reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    };

    transaction.onabort = () => {
      reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    };
  });

interface OpenIndexedDBParams {
  name: string;
  version: number;
  onUpgrade?: (database: IDBDatabase, transaction: IDBTransaction | null) => void;
}

export const openIndexedDB = ({ name, version, onUpgrade }: OpenIndexedDBParams) =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(name, version);

    request.onupgradeneeded = () => {
      onUpgrade?.(request.result, request.transaction);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error ?? new Error('Failed to open IndexedDB database'));
    };

    request.onblocked = () => {
      reject(new Error(`IndexedDB open blocked: ${name}`));
    };
  });

export const readIndexedDBValue = async <T>(
  database: IDBDatabase,
  storeName: string,
  key: IDBValidKey
): Promise<T | null> => {
  const transaction = database.transaction(storeName, 'readonly');
  const store = transaction.objectStore(storeName);
  const value = await requestToPromise(store.get(key) as IDBRequest<T | undefined>);
  await transactionToPromise(transaction);
  return value ?? null;
};

export const writeIndexedDBValue = async <T>(
  database: IDBDatabase,
  storeName: string,
  key: IDBValidKey,
  value: T
): Promise<void> => {
  const transaction = database.transaction(storeName, 'readwrite');
  const store = transaction.objectStore(storeName);
  await requestToPromise(store.put(value, key));
  await transactionToPromise(transaction);
};

export const removeIndexedDBValue = async (
  database: IDBDatabase,
  storeName: string,
  key: IDBValidKey
): Promise<void> => {
  const transaction = database.transaction(storeName, 'readwrite');
  const store = transaction.objectStore(storeName);
  await requestToPromise(store.delete(key));
  await transactionToPromise(transaction);
};
