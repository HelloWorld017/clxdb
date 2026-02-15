import { useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { createClxUI } from '@/index';

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
    clxUI.mount(document.querySelector('#clxui')!);
    return () => clxUI.unmount();
  }, []);

  return <button onClick={() => clxUI.openStoragePicker()}>Open DB</button>;
};

const container = document.getElementById('app');
if (container) {
  const root = createRoot(container);
  root.render(<TodoExampleApp />);
}
