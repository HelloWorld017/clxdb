import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { createClxDB, createStorageBackend } from '@/index';
import type { DatabaseBackend } from '@/types';

declare global {
  interface Window {
    showDirectoryPicker(): Promise<FileSystemDirectoryHandle>;
  }
}

// ==================== Types ====================

type TodoData = {
  id: string;
  at: number;
  del: boolean;
  seq: number | null;
  data?: Todo;
};

type Todo = {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
};

type TodoInput = {
  text: string;
  completed?: boolean;
};

type TodoListener = (todos: Todo[]) => void;
type ClxDBClient = ReturnType<typeof createClxDB>;

const TODO_DB_NAME = 'clxdb_todo_example';
const TODO_DB_VERSION = 1;
const TODO_STORE_NAME = 'todos';
const QUICK_UNLOCK_CACHE_KEY = 'clxdb_todo_quick_unlock';

// ==================== Todo Database (React App Interface) ====================

class TodoDatabase {
  private dbPromise: Promise<IDBDatabase>;
  private listeners: Set<TodoListener> = new Set();
  private replicationListeners: Set<() => void> = new Set();

  constructor() {
    this.dbPromise = this.openDatabase();
  }

  private requestToPromise = <T,>(request: IDBRequest<T>): Promise<T> =>
    new Promise((resolve, reject) => {
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        reject(request.error ?? new Error('IndexedDB request failed'));
      };
    });

  private transactionToPromise = (transaction: IDBTransaction): Promise<void> =>
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

  private openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB is not available in this environment'));
        return;
      }

      const request = window.indexedDB.open(TODO_DB_NAME, TODO_DB_VERSION);

      request.onupgradeneeded = () => {
        const database = request.result;
        if (database.objectStoreNames.contains(TODO_STORE_NAME)) {
          return;
        }

        const store = database.createObjectStore(TODO_STORE_NAME, { keyPath: 'id' });
        store.createIndex('seq', 'seq', { unique: false });
      };

      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => {
          database.close();
        };
        resolve(database);
      };

      request.onerror = () => {
        reject(request.error ?? new Error('Failed to open IndexedDB'));
      };
    });
  }

  private async getRow(id: string): Promise<TodoData | null> {
    const database = await this.dbPromise;
    const transaction = database.transaction(TODO_STORE_NAME, 'readonly');
    const store = transaction.objectStore(TODO_STORE_NAME);
    const request = store.get(id) as IDBRequest<TodoData | undefined>;
    const row = await this.requestToPromise(request);
    return row ?? null;
  }

  private async getRows(): Promise<TodoData[]> {
    const database = await this.dbPromise;
    const transaction = database.transaction(TODO_STORE_NAME, 'readonly');
    const store = transaction.objectStore(TODO_STORE_NAME);
    const request = store.getAll() as IDBRequest<TodoData[]>;
    return this.requestToPromise(request);
  }

  private async putRow(row: TodoData): Promise<void> {
    const database = await this.dbPromise;
    const transaction = database.transaction(TODO_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(TODO_STORE_NAME);
    store.put(row);
    await this.transactionToPromise(transaction);
  }

  private async deleteRows(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    const database = await this.dbPromise;
    const transaction = database.transaction(TODO_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(TODO_STORE_NAME);
    ids.forEach(id => {
      store.delete(id);
    });
    await this.transactionToPromise(transaction);
  }

  private emitReplicationUpdate(): void {
    this.replicationListeners.forEach(listener => {
      listener();
    });
  }

  private async notify(): Promise<void> {
    const todos = await this.getAll();
    this.listeners.forEach(listener => {
      listener(todos);
    });
  }

  // Get adapter for clxDB
  getClxDBAdapter(): DatabaseBackend {
    return {
      read: async ids => {
        const rows = await Promise.all(ids.map(id => this.getRow(id)));
        return rows;
      },

      readPendingIds: async () => {
        const rows = await this.getRows();
        return rows.filter(row => row.seq === null).map(row => row.id);
      },

      upsert: async docs => {
        const rowsToUpsert: TodoData[] = [];
        const idsToDelete: string[] = [];

        docs.forEach(doc => {
          if (doc.del) {
            idsToDelete.push(doc.id);
            return;
          }

          const todo = doc.data as Todo | undefined;
          if (!todo) {
            return;
          }

          rowsToUpsert.push({
            id: doc.id,
            at: doc.at,
            del: false,
            seq: doc.seq,
            data: todo,
          });
        });

        if (rowsToUpsert.length > 0) {
          const database = await this.dbPromise;
          const transaction = database.transaction(TODO_STORE_NAME, 'readwrite');
          const store = transaction.objectStore(TODO_STORE_NAME);
          rowsToUpsert.forEach(row => {
            store.put(row);
          });
          idsToDelete.forEach(id => {
            store.delete(id);
          });
          await this.transactionToPromise(transaction);
        } else {
          await this.deleteRows(idsToDelete);
        }

        await this.notify();
      },

      delete: async docs => {
        await this.deleteRows(docs.map(doc => doc.id));
        await this.notify();
      },

      replicate: onUpdate => {
        this.replicationListeners.add(onUpdate);
        return () => {
          this.replicationListeners.delete(onUpdate);
        };
      },
    };
  }

  // Insert new todo (React app uses this)
  async insert(data: TodoInput): Promise<Todo> {
    const id = crypto.randomUUID();
    const now = Date.now();
    const todo: Todo = {
      id,
      text: data.text,
      completed: data.completed ?? false,
      createdAt: now,
    };

    await this.putRow({ id, at: now, del: false, data: todo, seq: null });
    await this.notify();
    this.emitReplicationUpdate();
    return todo;
  }

  // Update existing todo (React app uses this)
  async update(id: string, data: Partial<TodoInput>): Promise<Todo | null> {
    const existing = await this.getById(id);
    if (!existing) {
      return null;
    }

    const todo: Todo = {
      ...existing,
      ...data,
    };

    await this.putRow({ id, at: Date.now(), del: false, data: todo, seq: null });
    await this.notify();
    this.emitReplicationUpdate();
    return todo;
  }

  // Delete todo (React app uses this)
  async delete(id: string): Promise<boolean> {
    const existing = await this.getRow(id);
    const existed = !!existing;
    if (existed) {
      await this.putRow({ id, at: Date.now(), del: true, seq: null });
      await this.notify();
      this.emitReplicationUpdate();
    }
    return existed;
  }

  // Get all todos
  async getAll(): Promise<Todo[]> {
    const rows = await this.getRows();
    return rows
      .filter(row => !row.del && !!row.data)
      .map(row => row.data)
      .filter((data): data is Todo => !!data)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  // Get todo by id
  async getById(id: string): Promise<Todo | undefined> {
    const row = await this.getRow(id);
    if (!row || row.del || !row.data) {
      return undefined;
    }

    return row.data;
  }

  // Subscribe to changes
  subscribe(listener: TodoListener): () => void {
    this.listeners.add(listener);
    void this.getAll().then(todos => {
      listener(todos);
    });

    return () => {
      this.listeners.delete(listener);
    };
  }
}

// ==================== React Components ====================

interface TodoAppProps {
  todoDB: TodoDatabase;
  clxdb: ClxDBClient;
}

const TodoApp: React.FC<TodoAppProps> = ({ todoDB, clxdb }) => {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [syncState, setSyncState] = useState<string>('idle');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Subscribe to todo database changes
    const unsubscribe = todoDB.subscribe(newTodos => {
      setTodos(newTodos);
    });

    return unsubscribe;
  }, [todoDB]);

  useEffect(() => {
    const handleSyncStart = () => setSyncState('syncing');
    const handleSyncComplete = () => setSyncState('idle');
    const handleSyncError = (error: Error) => {
      setSyncState('error');
      console.error(error);
    };

    clxdb.on('syncStart', handleSyncStart);
    clxdb.on('syncComplete', handleSyncComplete);
    clxdb.on('syncError', handleSyncError);

    return () => {
      clxdb.off('syncStart', handleSyncStart);
      clxdb.off('syncComplete', handleSyncComplete);
      clxdb.off('syncError', handleSyncError);
    };
  }, [clxdb]);

  const addTodo = async () => {
    try {
      if (!inputValue.trim()) {
        return;
      }

      // Just insert - clxDB will detect changes via replicate and handle sync
      await todoDB.insert({ text: inputValue.trim(), completed: false });
      setInputValue('');
      inputRef.current?.focus();
    } catch (error) {
      console.error('Failed to add todo:', error);
    }
  };

  const toggleTodo = async (id: string) => {
    try {
      const todo = await todoDB.getById(id);
      if (!todo) {
        return;
      }

      // Just update - clxDB will detect changes via replicate
      await todoDB.update(id, { completed: !todo.completed });
    } catch (error) {
      console.error('Failed to update todo:', error);
    }
  };

  const deleteTodo = async (id: string) => {
    try {
      // Just delete - clxDB will detect changes via replicate
      await todoDB.delete(id);
    } catch (error) {
      console.error('Failed to delete todo:', error);
    }
  };

  const clearCompleted = async () => {
    try {
      const completedTodos = todos.filter(todo => todo.completed);
      await Promise.all(completedTodos.map(todo => todoDB.delete(todo.id)));
    } catch (error) {
      console.error('Failed to clear completed todos:', error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      void addTodo();
    }
  };

  const activeCount = todos.filter(t => !t.completed).length;
  const completedCount = todos.length - activeCount;

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-light text-slate-800 mb-2 tracking-tight">Tasks</h1>
          <p className="text-slate-500 text-sm font-medium">
            {activeCount} active · {completedCount} completed
          </p>
        </div>

        {/* Sync Status */}
        <div className="flex justify-center mb-6">
          <div
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium transition-all duration-300 ${
              syncState === 'syncing'
                ? 'bg-blue-50 text-blue-600'
                : syncState === 'error'
                  ? 'bg-red-50 text-red-600'
                  : 'bg-emerald-50 text-emerald-600'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                syncState === 'syncing'
                  ? 'bg-blue-500 animate-pulse'
                  : syncState === 'error'
                    ? 'bg-red-500'
                    : 'bg-emerald-500'
              }`}
            />
            {syncState === 'syncing'
              ? 'Syncing...'
              : syncState === 'error'
                ? 'Sync failed'
                : 'Synced'}
          </div>
        </div>

        {/* Input */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-2 mb-6">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="What needs to be done?"
              className="flex-1 px-4 py-3 bg-transparent text-slate-700 placeholder-slate-400 text-base outline-none rounded-xl"
            />
            <button
              type="button"
              onClick={() => void addTodo()}
              disabled={!inputValue.trim()}
              className="px-6 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors duration-200"
            >
              Add
            </button>
          </div>
        </div>

        {/* Todo List */}
        <div className="space-y-2">
          {todos.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-slate-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <title>Empty task list</title>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                  />
                </svg>
              </div>
              <p className="text-slate-400 text-sm">No tasks yet. Add one above!</p>
            </div>
          ) : (
            todos.map(todo => (
              <div
                key={todo.id}
                className="group bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4 hover:border-blue-300 hover:shadow-sm transition-all duration-200"
              >
                <button
                  type="button"
                  onClick={() => void toggleTodo(todo.id)}
                  className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
                    todo.completed
                      ? 'bg-blue-500 border-blue-500'
                      : 'border-slate-300 hover:border-blue-400'
                  }`}
                >
                  {todo.completed && (
                    <svg
                      className="w-3.5 h-3.5 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <title>Completed</title>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </button>

                <span
                  className={`flex-1 text-base transition-all duration-200 ${
                    todo.completed ? 'text-slate-400 line-through' : 'text-slate-700'
                  }`}
                >
                  {todo.text}
                </span>

                <button
                  type="button"
                  onClick={() => void deleteTodo(todo.id)}
                  className="opacity-0 group-hover:opacity-100 p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all duration-200"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <title>Delete</title>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer Actions */}
        {todos.length > 0 && completedCount > 0 && (
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => void clearCompleted()}
              className="text-sm text-slate-500 hover:text-red-500 transition-colors duration-200"
            >
              Clear completed ({completedCount})
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ==================== Directory Selection Component ====================

const DirectorySelector: React.FC<{ onSelect: (handle: FileSystemDirectoryHandle) => void }> = ({
  onSelect,
}) => {
  const [isLoading, setIsLoading] = useState(false);

  const selectDirectory = async () => {
    try {
      setIsLoading(true);
      const handle = await window.showDirectoryPicker();
      onSelect(handle);
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('Failed to select directory:', error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="text-center">
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-blue-50 flex items-center justify-center">
          <svg
            className="w-10 h-10 text-blue-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <title>Folder</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
            />
          </svg>
        </div>

        <h1 className="text-3xl font-light text-slate-800 mb-3">TODO App</h1>
        <p className="text-slate-500 mb-8 max-w-sm">
          Select a folder to store your tasks. Your data will be synchronized to this location.
        </p>

        <button
          type="button"
          onClick={selectDirectory}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-6 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors duration-200"
        >
          {isLoading ? (
            <>
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <title>Loading</title>
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Opening...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <title>Select</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z"
                />
              </svg>
              Select Folder
            </>
          )}
        </button>
      </div>
    </div>
  );
};

// ==================== Main App ====================

interface QuickUnlockScreenProps {
  directoryHandle: FileSystemDirectoryHandle;
  onUnlock: (password: string) => Promise<void>;
  onChangeDirectory: () => void;
  isLoading: boolean;
  error: string | null;
}

const QuickUnlockScreen: React.FC<QuickUnlockScreenProps> = ({
  directoryHandle,
  onUnlock,
  onChangeDirectory,
  isLoading,
  error,
}) => {
  const [password, setPassword] = useState('');

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!password || isLoading) {
      return;
    }

    void onUnlock(password);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-emerald-50 flex items-center justify-center">
            <svg
              className="w-7 h-7 text-emerald-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <title>Quick unlock</title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M12 11c1.657 0 3-1.343 3-3S13.657 5 12 5 9 6.343 9 8s1.343 3 3 3zm0 0v2m-6 6h12a2 2 0 002-2v-1a5 5 0 00-5-5H9a5 5 0 00-5 5v1a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-light text-slate-800 mb-2">Quick Unlock</h2>
          <p className="text-sm text-slate-500">
            Enter a quick unlock password for <strong>{directoryHandle.name}</strong>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            autoComplete="current-password"
            placeholder="Quick unlock password"
            className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
          />

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button
            type="submit"
            disabled={isLoading || !password}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors duration-200"
          >
            {isLoading ? 'Unlocking...' : 'Unlock & Sync'}
          </button>
        </form>

        <button
          type="button"
          onClick={onChangeDirectory}
          disabled={isLoading}
          className="w-full mt-3 text-sm text-slate-500 hover:text-slate-700 disabled:text-slate-400 transition-colors duration-200"
        >
          Choose another folder
        </button>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [directoryHandle, setDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [todoDB] = useState(() => new TodoDatabase());
  const [clxdb, setClxdb] = useState<ClxDBClient | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const clxdbRef = useRef<ClxDBClient | null>(null);
  const unlockAttemptRef = useRef(0);

  const replaceClient = (client: ClxDBClient | null) => {
    if (clxdbRef.current && clxdbRef.current !== client) {
      clxdbRef.current.destroy();
    }

    clxdbRef.current = client;
    setClxdb(client);
  };

  const handleDirectorySelect = (handle: FileSystemDirectoryHandle) => {
    unlockAttemptRef.current += 1;
    setUnlockError(null);
    replaceClient(null);
    setDirectoryHandle(handle);
  };

  const handleChangeDirectory = () => {
    unlockAttemptRef.current += 1;
    setUnlockError(null);
    replaceClient(null);
    setDirectoryHandle(null);
  };

  const unlockDatabase = async (password: string): Promise<void> => {
    if (!directoryHandle || isUnlocking) {
      return;
    }

    const attempt = ++unlockAttemptRef.current;
    setIsUnlocking(true);
    setUnlockError(null);

    try {
      const storage = createStorageBackend({
        type: 'filesystem-access',
        handle: directoryHandle,
      });

      if (attempt !== unlockAttemptRef.current) {
        return;
      }

      const client = createClxDB({
        database: todoDB.getClxDBAdapter(),
        storage,
        crypto: {
          kind: 'quick-unlock',
          password,
        },
        options: {
          syncInterval: 5000,
          gcOnStart: true,
          gcGracePeriod: 1000,
          vacuumOnStart: true,
          cacheStorageKey: QUICK_UNLOCK_CACHE_KEY,
        },
      });

      await client.init();
      if (attempt !== unlockAttemptRef.current) {
        client.destroy();
        return;
      }

      replaceClient(client);
    } catch (error) {
      if (attempt === unlockAttemptRef.current) {
        replaceClient(null);
        setUnlockError(error instanceof Error ? error.message : 'Failed to unlock database');
      }
      console.error('Failed to initialize ClxDB:', error);
    } finally {
      if (attempt === unlockAttemptRef.current) {
        setIsUnlocking(false);
      }
    }
  };

  useEffect(
    () => () => {
      unlockAttemptRef.current += 1;
      if (clxdbRef.current) {
        clxdbRef.current.destroy();
      }
      clxdbRef.current = null;
    },
    []
  );

  if (!directoryHandle) {
    return <DirectorySelector onSelect={handleDirectorySelect} />;
  }

  if (!clxdb) {
    return (
      <QuickUnlockScreen
        directoryHandle={directoryHandle}
        onUnlock={unlockDatabase}
        onChangeDirectory={handleChangeDirectory}
        isLoading={isUnlocking}
        error={unlockError}
      />
    );
  }

  return <TodoApp todoDB={todoDB} clxdb={clxdb} />;
};

// Mount the app
const container = document.getElementById('app');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
