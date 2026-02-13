import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { StoragePicker } from '@/index';
import './index.css';
import type { StoragePickerSelection } from '@/index';

type PreviewRow = {
  label: string;
  value: string;
};

type SelectionPreview = {
  title: string;
  rows: PreviewRow[];
  json: string;
};

const maskSecret = (value: string) => {
  const visibleLength = Math.max(8, value.length);
  return '*'.repeat(Math.min(visibleLength, 24));
};

const toSelectionPreview = (selection: StoragePickerSelection): SelectionPreview => {
  if (selection.type === 'webdav') {
    return {
      title: 'webdav',
      rows: [
        { label: 'Endpoint', value: selection.url },
        { label: 'Username', value: selection.auth.user },
        { label: 'Password', value: maskSecret(selection.auth.pass) },
      ],
      json: JSON.stringify(
        {
          type: selection.type,
          url: selection.url,
          auth: {
            user: selection.auth.user,
            pass: maskSecret(selection.auth.pass),
          },
        },
        null,
        2
      ),
    };
  }

  return {
    title: 'filesystem-access',
    rows: [
      { label: 'Directory name', value: selection.handle.name || '(root)' },
      { label: 'Handle kind', value: selection.handle.kind },
      { label: 'Adapter type', value: 'filesystem-access' },
    ],
    json: JSON.stringify(
      {
        type: selection.type,
        handle: {
          name: selection.handle.name || '(root)',
          kind: selection.handle.kind,
        },
      },
      null,
      2
    ),
  };
};

const formatAppliedAt = (timestamp: number | null) => {
  if (!timestamp) {
    return 'Not applied yet';
  }

  return new Date(timestamp).toLocaleString();
};

function StoragePickerExampleApp() {
  const [selection, setSelection] = useState<StoragePickerSelection | null>(null);
  const [appliedAt, setAppliedAt] = useState<number | null>(null);

  const preview = useMemo(() => {
    if (!selection) {
      return null;
    }

    return toSelectionPreview(selection);
  }, [selection]);

  const handleSelect = (nextSelection: StoragePickerSelection) => {
    setSelection(nextSelection);
    setAppliedAt(Date.now());
  };

  return (
    <main className="min-h-screen px-4 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto grid w-full max-w-7xl gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <StoragePicker
          onSelect={handleSelect}
          title="Choose a storage backend"
          description="Use this page to verify Storage Picker wiring and inspect the selection payload."
          submitLabel="Apply selection"
        />

        <aside
          className="rounded-[1.75rem] border border-zinc-200 bg-white/85 p-6
            shadow-[0_32px_64px_-52px_rgba(24,24,27,0.45)] backdrop-blur-sm"
        >
          <p className="text-[11px] font-semibold tracking-[0.2em] text-zinc-500 uppercase">
            Selection Preview
          </p>
          <h2 className="mt-3 text-lg font-semibold text-zinc-900">
            {preview ? `Backend: ${preview.title}` : 'No selection yet'}
          </h2>
          <p className="mt-1 text-xs text-zinc-500">Applied at: {formatAppliedAt(appliedAt)}</p>

          {preview ? (
            <div className="mt-5 space-y-2">
              {preview.rows.map(row => (
                <div
                  key={row.label}
                  className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs"
                >
                  <p className="font-medium text-zinc-500">{row.label}</p>
                  <p className="mt-0.5 break-all text-zinc-800">{row.value}</p>
                </div>
              ))}
            </div>
          ) : (
            <p
              className="mt-5 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-3 py-3
                text-xs text-zinc-500"
            >
              Pick a backend and submit to populate this panel.
            </p>
          )}

          <p className="mt-5 text-xs leading-relaxed text-zinc-500">
            OPFS resolves to the same output shape as FileSystem Access API: `filesystem-access`
            plus a `FileSystemDirectoryHandle`.
          </p>

          <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-900/95">
            <pre className="max-h-64 overflow-auto px-3 py-3 text-xs leading-relaxed text-zinc-100">
              {preview?.json ?? '{\n  "selection": null\n}'}
            </pre>
          </div>
        </aside>
      </div>
    </main>
  );
}

const container = document.getElementById('app');
if (container) {
  const root = createRoot(container);
  root.render(<StoragePickerExampleApp />);
}
