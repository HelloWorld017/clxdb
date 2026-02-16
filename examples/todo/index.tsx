import { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClxDB, createClxUI, createStorageBackend, generateNewClxDB } from '@/index';
import type { ClxDB, DatabaseBackend, ShardDocument, DatabaseDocument } from '@/index';
import type { SubmitEvent } from 'react';

const TODO_DB_NAME_PREFIX = 'clxdb_todo_example_';
const TODO_DB_VERSION = 1;
const TODO_STORE_NAME = 'todos';

type Todo = {
  id: string;
  at: number;
  del: boolean;
  seq: number | null;
  text: string;
  completed: boolean;
  createdAt: number;
};

type TodoData = Pick<Todo, 'text' | 'completed' | 'createdAt'>;

interface TodoDatabaseBackend extends DatabaseBackend {
  listTodos(): Promise<Todo[]>;
  createTodo(text: string): Promise<void>;
  toggleTodo(id: string): Promise<void>;
  removeTodo(id: string): Promise<void>;
  destroy(): void;
}

type TodoSession = {
  client: ClxDB;
  database: TodoDatabaseBackend;
};

const requestToPromise = <T,>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB request failed.'));
    };
  });

const transactionToPromise = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => {
      resolve();
    };

    transaction.onabort = () => {
      reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
    };

    transaction.onerror = () => {
      reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
    };
  });

const openTodoDatabase = (name: string) =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(name, TODO_DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(TODO_STORE_NAME)) {
        database.createObjectStore(TODO_STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error ?? new Error('Could not open local todo database.'));
    };

    request.onblocked = () => {
      reject(new Error('Local todo database is blocked by another browser tab.'));
    };
  });

const createTodoId = () => {
  if (typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const toTodoData = (todo: Todo): TodoData => ({
  text: todo.text,
  completed: todo.completed,
  createdAt: todo.createdAt,
});

const parseTodoData = (
  data: Record<string, unknown> | undefined,
  fallbackTimestamp: number
): TodoData => {
  const text = typeof data?.text === 'string' ? data.text : '';
  const completed = typeof data?.completed === 'boolean' ? data.completed : false;
  const createdAt = typeof data?.createdAt === 'number' ? data.createdAt : fallbackTimestamp;

  return {
    text,
    completed,
    createdAt,
  };
};

const toDatabaseDocument = (todo: Todo): DatabaseDocument => ({
  id: todo.id,
  at: todo.at,
  seq: todo.seq,
  del: todo.del,
  data: toTodoData(todo),
});

const fromShardDocument = (document: ShardDocument): Todo => {
  const payload = parseTodoData(document.data, document.at);

  return {
    id: document.id,
    at: document.at,
    seq: document.seq,
    del: document.del,
    text: payload.text,
    completed: payload.completed,
    createdAt: payload.createdAt,
  };
};

const formatErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
};

class TodoDatabase implements TodoDatabaseBackend {
  private database: IDBDatabase | null = null;
  private uuid: string | null = null;
  private listeners = new Set<() => void>();

  async initialize(uuid: string): Promise<void> {
    if (this.database && this.uuid === uuid) {
      return;
    }

    if (this.database) {
      this.database.close();
      this.database = null;
    }

    this.database = await openTodoDatabase(`${TODO_DB_NAME_PREFIX}${uuid}`);
    this.uuid = uuid;
  }

  async read(ids: string[]): Promise<(DatabaseDocument | null)[]> {
    if (!ids.length) {
      return [];
    }

    const database = this.requireDatabase();
    const transaction = database.transaction(TODO_STORE_NAME, 'readonly');
    const store = transaction.objectStore(TODO_STORE_NAME);
    const rows = await Promise.all(
      ids.map(async id => {
        const request = store.get(id) as IDBRequest<Todo | undefined>;
        const row = await requestToPromise(request);
        return row ? toDatabaseDocument(row) : null;
      })
    );

    await transactionToPromise(transaction);
    return rows;
  }

  async readPendingIds(): Promise<string[]> {
    const database = this.requireDatabase();
    const transaction = database.transaction(TODO_STORE_NAME, 'readonly');
    const store = transaction.objectStore(TODO_STORE_NAME);
    const pendingIds: string[] = [];

    await new Promise<void>((resolve, reject) => {
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve();
          return;
        }

        const row = cursor.value as Todo;
        if (row.seq === null) {
          pendingIds.push(row.id);
        }

        cursor.continue();
      };

      request.onerror = () => {
        reject(request.error ?? new Error('Could not list pending todos.'));
      };
    });

    await transactionToPromise(transaction);
    return pendingIds;
  }

  async upsert(data: ShardDocument[]): Promise<void> {
    if (!data.length) {
      return;
    }

    const database = this.requireDatabase();
    const transaction = database.transaction(TODO_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(TODO_STORE_NAME);

    data.forEach(document => {
      if (document.del) {
        store.delete(document.id);
        return;
      }

      store.put(fromShardDocument(document));
    });

    await transactionToPromise(transaction);
    this.emitUpdate();
  }

  async delete(data: ShardDocument[]): Promise<void> {
    if (!data.length) {
      return;
    }

    const database = this.requireDatabase();
    const transaction = database.transaction(TODO_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(TODO_STORE_NAME);

    data.forEach(document => {
      store.delete(document.id);
    });

    await transactionToPromise(transaction);
    this.emitUpdate();
  }

  replicate(onUpdate: () => void): () => void {
    this.listeners.add(onUpdate);
    return () => {
      this.listeners.delete(onUpdate);
    };
  }

  async listTodos(): Promise<Todo[]> {
    const database = this.requireDatabase();
    const transaction = database.transaction(TODO_STORE_NAME, 'readonly');
    const store = transaction.objectStore(TODO_STORE_NAME);
    const request = store.getAll() as IDBRequest<Todo[]>;
    const rows = await requestToPromise(request);

    await transactionToPromise(transaction);
    return rows
      .filter(todo => !todo.del)
      .sort((left, right) => right.createdAt - left.createdAt || right.at - left.at);
  }

  async createTodo(text: string): Promise<void> {
    const normalizedText = text.trim();
    if (!normalizedText) {
      return;
    }

    const now = Date.now();
    await this.writeTodo({
      id: createTodoId(),
      at: now,
      del: false,
      seq: null,
      text: normalizedText,
      completed: false,
      createdAt: now,
    });

    this.emitUpdate();
  }

  async toggleTodo(id: string): Promise<void> {
    const row = await this.readTodo(id);
    if (!row || row.del) {
      return;
    }

    await this.writeTodo({
      ...row,
      at: Date.now(),
      seq: null,
      completed: !row.completed,
    });

    this.emitUpdate();
  }

  async removeTodo(id: string): Promise<void> {
    const row = await this.readTodo(id);
    if (!row || row.del) {
      return;
    }

    await this.writeTodo({
      ...row,
      at: Date.now(),
      seq: null,
      del: true,
    });

    this.emitUpdate();
  }

  destroy(): void {
    this.database?.close();
    this.database = null;
    this.uuid = null;
    this.listeners.clear();
  }

  private emitUpdate() {
    this.listeners.forEach(listener => {
      listener();
    });
  }

  private requireDatabase(): IDBDatabase {
    if (!this.database) {
      throw new Error('Todo database is not initialized yet.');
    }

    return this.database;
  }

  private async readTodo(id: string): Promise<Todo | null> {
    const database = this.requireDatabase();
    const transaction = database.transaction(TODO_STORE_NAME, 'readonly');
    const store = transaction.objectStore(TODO_STORE_NAME);
    const request = store.get(id) as IDBRequest<Todo | undefined>;
    const row = await requestToPromise(request);

    await transactionToPromise(transaction);
    return row ?? null;
  }

  private async writeTodo(todo: Todo): Promise<void> {
    const database = this.requireDatabase();
    const transaction = database.transaction(TODO_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(TODO_STORE_NAME);

    store.put(todo);
    await transactionToPromise(transaction);
  }
}

const createDatabaseBackend = (): TodoDatabaseBackend => new TodoDatabase();

const TodoExampleApp = () => {
  const [session, setSession] = useState<TodoSession | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTodoText, setNewTodoText] = useState('');
  const [isInitializing, setIsInitializing] = useState(false);
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [isOpeningSettings, setIsOpeningSettings] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const clxUI = useMemo(
    () =>
      createClxUI({
        position: ['bottom', 'left'],
        theme: 'light',
        style: {
          palette: '#0a7ef5',
          fontFamily: 'Avenir Next',
        },
      }),
    []
  );

  const refreshTodos = useCallback(async () => {
    if (!session) {
      setTodos([]);
      return;
    }

    const nextTodos = await session.database.listTodos();
    setTodos(nextTodos);
  }, [session]);

  useEffect(() => {
    void refreshTodos();
    session?.database.replicate(() => refreshTodos());
  }, [refreshTodos, session]);

  useEffect(() => () => clxUI.unmount(), [clxUI]);
  useEffect(() => {
    if (!session) {
      setTodos([]);
      return;
    }

    let cancelled = false;
    const hideIndicator = clxUI.showSyncIndicator({
      client: session.client,
      successDuration: 1600,
    });
    setErrorMessage(null);

    const offSyncError = session.client.on('syncError', error => {
      if (!cancelled) {
        setErrorMessage(error.message);
      }
    });

    return () => {
      cancelled = true;
      offSyncError();
      hideIndicator();
      session.client.destroy();
      session.database.destroy();
    };
  }, [clxUI, session]);

  const startInitFlow = useCallback(async () => {
    if (isInitializing) {
      return;
    }

    setIsInitializing(true);
    setErrorMessage(null);

    let nextClient: ClxDB | null = null;
    let nextDatabase: TodoDatabaseBackend | null = null;

    try {
      const storageSettings = await clxUI.openStoragePicker({ submitLabel: 'Connect storage' });
      if (!storageSettings) {
        return;
      }

      const storage = createStorageBackend(storageSettings);
      const unlockSettings = await clxUI.openDatabaseUnlock({ storage });
      if (!unlockSettings) {
        return;
      }

      nextDatabase = createDatabaseBackend();
      nextClient =
        unlockSettings.mode === 'open'
          ? createClxDB({
              database: nextDatabase,
              storage,
              crypto: unlockSettings.crypto,
              options: {},
            })
          : await generateNewClxDB({
              database: nextDatabase,
              storage,
              crypto: unlockSettings.crypto,
              options: {},
            });

      await nextClient.init();

      if (unlockSettings.update) {
        await unlockSettings.update(nextClient);
        await nextClient.sync();
      }

      setSession({ client: nextClient, database: nextDatabase });
      setNewTodoText('');
      nextClient = null;
      nextDatabase = null;
    } catch (error) {
      setErrorMessage(formatErrorMessage(error, 'Could not open the Todo example database.'));
    } finally {
      nextClient?.destroy();
      nextDatabase?.destroy();
      setIsInitializing(false);
    }
  }, [clxUI, isInitializing]);

  const syncNow = useCallback(async () => {
    if (!session || isManualSyncing) {
      return;
    }

    setIsManualSyncing(true);
    setErrorMessage(null);

    try {
      await session.client.sync();
    } catch (error) {
      setErrorMessage(formatErrorMessage(error, 'Manual sync failed.'));
    } finally {
      setIsManualSyncing(false);
    }
  }, [isManualSyncing, session]);

  const openDatabaseSettings = useCallback(async () => {
    if (!session || isOpeningSettings) {
      return;
    }

    setIsOpeningSettings(true);
    setErrorMessage(null);

    try {
      await clxUI.openDatabaseSettings({
        storage: session.client.storage,
        client: session.client,
      });
    } catch (error) {
      setErrorMessage(formatErrorMessage(error, 'Could not open database settings.'));
    } finally {
      setIsOpeningSettings(false);
    }
  }, [clxUI, isOpeningSettings, session]);

  const handleAddTodo = useCallback(
    async (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!session) {
        return;
      }

      const nextText = newTodoText.trim();
      if (!nextText) {
        return;
      }

      setErrorMessage(null);

      try {
        await session.database.createTodo(nextText);
        setNewTodoText('');
      } catch (error) {
        setErrorMessage(formatErrorMessage(error, 'Could not add a new todo.'));
      }
    },
    [newTodoText, session]
  );

  const toggleTodo = useCallback(
    async (id: string) => {
      if (!session) {
        return;
      }

      setErrorMessage(null);

      try {
        await session.database.toggleTodo(id);
      } catch (error) {
        setErrorMessage(formatErrorMessage(error, 'Could not update this todo.'));
      }
    },
    [session]
  );

  const removeTodo = useCallback(
    async (id: string) => {
      if (!session) {
        return;
      }

      setErrorMessage(null);

      try {
        await session.database.removeTodo(id);
      } catch (error) {
        setErrorMessage(formatErrorMessage(error, 'Could not delete this todo.'));
      }
    },
    [session]
  );

  const stats = useMemo(() => {
    const completed = todos.filter(todo => todo.completed).length;
    const pending = todos.filter(todo => todo.seq === null).length;

    return {
      total: todos.length,
      completed,
      pending,
      active: todos.length - completed,
    };
  }, [todos]);

  const timestampFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    []
  );

  if (!session) {
    return (
      <main className="todo-page">
        <section className="todo-shell todo-start-card">
          <p className="todo-kicker">clxdb / local-first sync</p>
          <h1 className="todo-title">Todo Example</h1>
          <p className="todo-subtitle">
            Pick a storage backend, unlock or create a database, then start managing todos with
            automatic sync.
          </p>

          {errorMessage && <p className="todo-error">{errorMessage}</p>}

          <div className="todo-start-actions">
            <button
              type="button"
              className="todo-button todo-button--primary"
              onClick={() => {
                void startInitFlow();
              }}
              disabled={isInitializing}
            >
              {isInitializing ? 'Opening...' : 'Open Todo Database'}
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="todo-page">
      <section className="todo-shell">
        <header className="todo-header">
          <div>
            <p className="todo-kicker">clxdb / local-first sync</p>
            <h1 className="todo-title">Shared Todo Board</h1>
            <p className="todo-subtitle">
              Changes are staged locally first, then synchronized across devices.
            </p>
          </div>

          <div className="todo-toolbar">
            <button
              type="button"
              className="todo-button todo-button--ghost"
              onClick={() => {
                void startInitFlow();
              }}
              disabled={isInitializing}
            >
              {isInitializing ? 'Connecting...' : 'Change Storage'}
            </button>
            <button
              type="button"
              className="todo-button todo-button--ghost"
              onClick={() => {
                void openDatabaseSettings();
              }}
              disabled={isOpeningSettings}
            >
              {isOpeningSettings ? 'Opening...' : 'Settings'}
            </button>
            <button
              type="button"
              className="todo-button todo-button--primary"
              onClick={() => {
                void syncNow();
              }}
              disabled={isManualSyncing}
            >
              {isManualSyncing ? 'Syncing...' : 'Sync Now'}
            </button>
          </div>
        </header>

        <div className="todo-status">
          <span>{stats.total} total</span>
          <span>{stats.active} active</span>
          <span>{stats.completed} completed</span>
          {stats.pending > 0 && <span>{stats.pending} pending upload</span>}
        </div>

        {errorMessage && <p className="todo-error">{errorMessage}</p>}

        <form
          className="todo-form"
          onSubmit={event => {
            void handleAddTodo(event);
          }}
        >
          <input
            className="todo-input"
            type="text"
            value={newTodoText}
            onChange={event => {
              setNewTodoText(event.target.value);
            }}
            placeholder="Write a task and hit Enter"
          />
          <button
            type="submit"
            className="todo-button todo-button--primary"
            disabled={!newTodoText.trim()}
          >
            Add
          </button>
        </form>

        {todos.length === 0 ? (
          <p className="todo-empty">No tasks yet. Add your first todo above.</p>
        ) : (
          <ul className="todo-list">
            {todos.map(todo => (
              <li
                key={todo.id}
                className={`todo-item ${todo.completed ? 'todo-item--completed' : ''}`}
              >
                <button
                  type="button"
                  className="todo-item__toggle"
                  aria-label={todo.completed ? 'Mark as not done' : 'Mark as done'}
                  onClick={() => {
                    void toggleTodo(todo.id);
                  }}
                >
                  <span>{todo.completed ? 'Done' : 'Todo'}</span>
                </button>

                <div className="todo-item__content">
                  <p className="todo-item__title">{todo.text}</p>
                  <p className="todo-item__meta">
                    {timestampFormatter.format(todo.createdAt)}
                    {todo.seq === null && <em className="todo-item__pending">Pending sync</em>}
                  </p>
                </div>

                <button
                  type="button"
                  className="todo-item__delete"
                  onClick={() => {
                    void removeTodo(todo.id);
                  }}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
};

const container = document.getElementById('app');
if (container) {
  const root = createRoot(container);
  root.render(<TodoExampleApp />);
}
