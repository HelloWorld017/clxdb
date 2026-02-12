import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { ClxDB } from '../../src/core/clxdb';
import { FileSystemBackend } from '../../src/storages/filesystem';
import type { DatabaseBackend } from '../../src/types';

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

// ==================== Todo Database (React App Interface) ====================

class TodoDatabase {
  private todos: Map<string, TodoData> = new Map();
  private listeners: Set<TodoListener> = new Set();

  // Get adapter for clxDB
  getClxDBAdapter(): DatabaseBackend {
    /* eslint-disable @typescript-eslint/require-await */
    return {
      read: async ids => ids.map(id => this.todos.get(id) ?? null),
      readPendingIds: async () =>
        this.todos
          .values()
          .filter(row => row.seq === null)
          .map(row => row.id)
          .toArray(),

      upsert: async docs => {
        for (const doc of docs) {
          if (doc.del) {
            this.todos.delete(doc.id);
          } else if (doc.data) {
            this.todos.set(doc.id, doc as TodoData);
          }
        }
        this.notify();
      },

      delete: async docs => {
        for (const doc of docs) {
          this.todos.delete(doc.id);
        }
        this.notify();
      },

      replicate: onUpdate => this.subscribe(onUpdate),
    };
    /* eslint-enable @typescript-eslint/require-await */
  }

  // Insert new todo (React app uses this)
  insert(data: TodoInput): Todo {
    const id = crypto.randomUUID();
    const now = Date.now();
    const todo: Todo = {
      id,
      text: data.text,
      completed: data.completed ?? false,
      createdAt: now,
    };

    this.todos.set(id, { id, at: now, del: false, data: todo, seq: null });
    this.notify();
    return todo;
  }

  // Update existing todo (React app uses this)
  update(id: string, data: Partial<TodoInput>): Todo | null {
    const existing = this.todos.get(id)?.data;
    if (!existing) {
      return null;
    }

    const todo: Todo = {
      ...existing,
      ...data,
    };

    this.todos.set(id, { id, at: Date.now(), del: false, data: todo, seq: null });
    this.notify();
    return todo;
  }

  // Delete todo (React app uses this)
  delete(id: string): boolean {
    const existed = this.todos.has(id);
    if (existed) {
      this.todos.set(id, { id, at: Date.now(), del: true, seq: null });
      this.notify();
    }
    return existed;
  }

  // Get all todos
  getAll(): Todo[] {
    return Array.from(this.todos.values())
      .map(({ data }) => data)
      .filter(data => !!data)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  // Get todo by id
  getById(id: string): Todo | undefined {
    return this.todos.get(id)?.data ?? undefined;
  }

  // Subscribe to changes
  subscribe(listener: TodoListener): () => void {
    this.listeners.add(listener);
    listener(this.getAll());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const todos = this.getAll();
    this.listeners.forEach(listener => {
      listener(todos);
    });
  }
}

// ==================== React Components ====================

interface TodoAppProps {
  todoDB: TodoDatabase;
  clxdb: ClxDB;
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

  const addTodo = () => {
    if (!inputValue.trim()) {
      return;
    }

    // Just insert - clxDB will detect changes via replicate and handle sync
    todoDB.insert({ text: inputValue.trim(), completed: false });
    setInputValue('');
    inputRef.current?.focus();
  };

  const toggleTodo = (id: string) => {
    const todo = todoDB.getById(id);
    if (!todo) {
      return;
    }

    // Just update - clxDB will detect changes via replicate
    todoDB.update(id, { completed: !todo.completed });
  };

  const deleteTodo = (id: string) => {
    // Just delete - clxDB will detect changes via replicate
    todoDB.delete(id);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      addTodo();
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
              onClick={addTodo}
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
                  onClick={() => toggleTodo(todo.id)}
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
                  onClick={() => deleteTodo(todo.id)}
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
              onClick={() => {
                const completedTodos = todos.filter(t => t.completed);
                for (const t of completedTodos) {
                  todoDB.delete(t.id);
                }
              }}
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

const App: React.FC = () => {
  const [directoryHandle, setDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [todoDB] = useState(() => new TodoDatabase());
  const [clxdb, setClxdb] = useState<ClxDB | null>(null);

  useEffect(() => {
    if (!directoryHandle) {
      return;
    }

    const storage = new FileSystemBackend(directoryHandle);
    const client = new ClxDB({
      database: todoDB.getClxDBAdapter(),
      storage,
      options: {
        syncInterval: 5000,
        gcOnStart: true,
        gcGracePeriod: 1000,
        vacuumOnStart: true,
        cacheStorageKey: null,
      },
    });

    setClxdb(client);

    client.init().catch(err => {
      console.error('Failed to initialize ClxDB:', err);
    });

    return () => {
      client.destroy();
    };
  }, [directoryHandle, todoDB]);

  if (!directoryHandle || !clxdb) {
    return <DirectorySelector onSelect={setDirectoryHandle} />;
  }

  return <TodoApp todoDB={todoDB} clxdb={clxdb} />;
};

// Mount the app
const container = document.getElementById('app');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
