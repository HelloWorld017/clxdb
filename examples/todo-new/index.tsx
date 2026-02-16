import { useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { createClxUI, createStorageBackend } from '@/index';

const TodoExampleApp = () => {
  const clxUI = useMemo(
    () =>
      createClxUI({
        position: ['bottom', 'left'],
        theme: 'light',
      }),
    []
  );

  useEffect(() => {
    clxUI.mount();
    return () => clxUI.unmount();
  }, []);

  const startInitFlow = async () => {
    const storageSettings = await clxUI.openStoragePicker();
    if (storageSettings === null) {
      return;
    }

    const storage = createStorageBackend(storageSettings);
    const databaseSettings = await clxUI.openDatabaseUnlock({ storage });
  };

  return <button onClick={startInitFlow}>Open DB</button>;
};

const container = document.getElementById('app');
if (container) {
  const root = createRoot(container);
  root.render(<TodoExampleApp />);
}
