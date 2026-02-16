import { useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { createClxDB, createClxUI, createStorageBackend, generateNewClxDB } from '@/index';
import type { ClxDB } from '@/index';

const TODO_DB_NAME_PREFIX = 'clxdb_todo_example_';
const TODO_DB_VERSION = 1;
const TODO_STORE_NAME = 'todos';

type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

type Todo = {
  id: string;
  at: number;
  del: boolean;
  seq: number | null;

  text: string;
  completed: boolean;
  createdAt: number;
};

type TodoItem = PartialBy<Todo, 'id' | 'at' | 'del' | 'seq'>;

const createDatabaseBackend = () => {};

const TodoExampleApp = () => {
  const [clxDB, setClxDB] = useState<ClxDB | null>();
  const clxUI = useMemo(
    () =>
      createClxUI({
        position: ['bottom', 'left'],
        theme: 'light',
        style: { palette: '#0080ff', fontFamily: 'Metropolis' },
      }),
    []
  );

  useEffect(() => () => clxUI.unmount(), [clxUI]);

  const startInitFlow = async () => {
    const storageSettings = await clxUI.openStoragePicker();
    if (storageSettings === null) {
      return;
    }

    const storage = createStorageBackend(storageSettings);
    const unlockSettings = await clxUI.openDatabaseUnlock({ storage });
    if (unlockSettings === null) {
      return;
    }

    const database = createDatabaseBackend();
    const client =
      unlockSettings.mode === 'open'
        ? createClxDB({
            // FIXME
          })
        : generateNewClxDB({
            // FIXME
          });
  };

  if (!clxDB) {
    return; //FIXME
  }

  return; //FIXME
};

const container = document.getElementById('app');
if (container) {
  const root = createRoot(container);
  root.render(<TodoExampleApp />);
}
