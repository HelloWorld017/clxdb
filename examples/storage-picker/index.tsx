import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createStorageBackend, DatabaseUnlock, StoragePicker } from '@/index';
import './index.css';
import type {
  ClxDBStatus,
  DatabaseUnlockSubmission,
  StorageBackend,
  StoragePickerSelection,
} from '@/index';

type PreviewRow = {
  label: string;
  value: string;
};

type PanelPreview = {
  title: string;
  rows: PreviewRow[];
  json: string;
};

const maskSecret = (value: string) => {
  const visibleLength = Math.max(6, value.length);
  return '*'.repeat(Math.min(visibleLength, 24));
};

const toSelectionPreview = (selection: StoragePickerSelection): PanelPreview => {
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

const toStatusPreview = (status: ClxDBStatus): PanelPreview => ({
  title: 'inspection',
  rows: [
    { label: 'Database UUID', value: status.uuid ?? '(missing)' },
    { label: 'Manifest', value: status.hasDatabase ? 'Found' : 'Missing' },
    { label: 'Encrypted', value: status.isEncrypted ? 'Yes' : 'No' },
    {
      label: 'Quick unlock on this device',
      value: status.hasUsableDeviceKey ? 'Usable' : 'Unavailable',
    },
    { label: 'Registered device keys', value: String(status.registeredDeviceKeys.length) },
  ],
  json: JSON.stringify(status, null, 2),
});

const toUnlockPreview = (submission: DatabaseUnlockSubmission): PanelPreview => {
  const statusSnapshot = {
    uuid: submission.status.uuid,
    hasDatabase: submission.status.hasDatabase,
    isEncrypted: submission.status.isEncrypted,
    hasUsableDeviceKey: submission.status.hasUsableDeviceKey,
    registeredDeviceKeys: submission.status.registeredDeviceKeys.length,
  };

  if (submission.mode === 'create') {
    return {
      title: 'create',
      rows: [
        { label: 'Flow', value: 'Create encrypted DB' },
        { label: 'Master password', value: maskSecret(submission.masterPassword) },
        { label: 'Quick unlock PIN', value: maskSecret(submission.quickUnlockPin) },
      ],
      json: JSON.stringify(
        {
          mode: submission.mode,
          masterPassword: maskSecret(submission.masterPassword),
          quickUnlockPin: maskSecret(submission.quickUnlockPin),
          status: statusSnapshot,
        },
        null,
        2
      ),
    };
  }

  if (submission.mode === 'quick-unlock') {
    return {
      title: 'quick-unlock',
      rows: [
        { label: 'Flow', value: 'Unlock existing DB with PIN' },
        { label: 'Quick unlock PIN', value: maskSecret(submission.quickUnlockPin) },
      ],
      json: JSON.stringify(
        {
          mode: submission.mode,
          quickUnlockPin: maskSecret(submission.quickUnlockPin),
          status: statusSnapshot,
        },
        null,
        2
      ),
    };
  }

  return {
    title: 'master-recovery',
    rows: [
      { label: 'Flow', value: 'Master recovery + enroll PIN' },
      { label: 'Master password', value: maskSecret(submission.masterPassword) },
      { label: 'New quick unlock PIN', value: maskSecret(submission.quickUnlockPin) },
    ],
    json: JSON.stringify(
      {
        mode: submission.mode,
        masterPassword: maskSecret(submission.masterPassword),
        quickUnlockPin: maskSecret(submission.quickUnlockPin),
        status: statusSnapshot,
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
  const [selectionAppliedAt, setSelectionAppliedAt] = useState<number | null>(null);
  const [statusSnapshot, setStatusSnapshot] = useState<ClxDBStatus | null>(null);
  const [unlockPreview, setUnlockPreview] = useState<PanelPreview | null>(null);
  const [unlockAppliedAt, setUnlockAppliedAt] = useState<number | null>(null);

  const selectionPreview = useMemo(() => {
    if (!selection) {
      return null;
    }

    return toSelectionPreview(selection);
  }, [selection]);

  const inspectionPreview = useMemo(() => {
    if (!statusSnapshot) {
      return null;
    }

    return toStatusPreview(statusSnapshot);
  }, [statusSnapshot]);

  const storageBackend = useMemo<StorageBackend | null>(() => {
    if (!selection) {
      return null;
    }

    return createStorageBackend(selection);
  }, [selection]);

  const unlockKey = useMemo(() => {
    if (!selection) {
      return 'none';
    }

    if (selection.type === 'webdav') {
      return `webdav:${selection.url}:${selection.auth.user}`;
    }

    return `filesystem-access:${selection.handle.name}:${selection.handle.kind}`;
  }, [selection]);

  const handleSelect = (nextSelection: StoragePickerSelection) => {
    setSelection(nextSelection);
    setSelectionAppliedAt(Date.now());
    setStatusSnapshot(null);
    setUnlockPreview(null);
    setUnlockAppliedAt(null);
  };

  const handleUnlockSubmit = (submission: DatabaseUnlockSubmission) => {
    setUnlockPreview(toUnlockPreview(submission));
    setUnlockAppliedAt(Date.now());
  };

  return (
    <main className="min-h-screen px-4 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto grid w-full max-w-7xl gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <StoragePicker onSelect={handleSelect} submitLabel="Use selected storage" />

          {storageBackend ? (
            <DatabaseUnlock
              key={unlockKey}
              storage={storageBackend}
              onSubmit={handleUnlockSubmit}
              onStatusChange={setStatusSnapshot}
            />
          ) : (
            <section
              className="rounded-[1.75rem] border border-zinc-200 bg-white/80 p-6
                shadow-[0_32px_64px_-52px_rgba(24,24,27,0.45)] backdrop-blur-sm"
            >
              <p className="text-[11px] font-semibold tracking-[0.2em] text-zinc-500 uppercase">
                Database Unlock
              </p>
              <h2 className="mt-3 text-lg font-semibold text-zinc-900">
                Waiting for storage selection
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                Complete Storage Picker first. Once a backend is selected, the unlock UI will
                inspect manifest state and render the proper access path.
              </p>
            </section>
          )}
        </div>

        <aside
          className="rounded-[1.75rem] border border-zinc-200 bg-white/85 p-6
            shadow-[0_32px_64px_-52px_rgba(24,24,27,0.45)] backdrop-blur-sm"
        >
          <p className="text-[11px] font-semibold tracking-[0.2em] text-zinc-500 uppercase">
            Integration Preview
          </p>

          <section className="mt-5">
            <h2 className="text-sm font-semibold text-zinc-900">Storage Selection</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Applied at: {formatAppliedAt(selectionAppliedAt)}
            </p>

            {selectionPreview ? (
              <div className="mt-3 space-y-2">
                {selectionPreview.rows.map(row => (
                  <div
                    key={`selection-${row.label}`}
                    className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs"
                  >
                    <p className="font-medium text-zinc-500">{row.label}</p>
                    <p className="mt-0.5 break-all text-zinc-800">{row.value}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p
                className="mt-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-3 py-3
                  text-xs text-zinc-500"
              >
                Pick a backend to initialize this section.
              </p>
            )}
          </section>

          <section className="mt-6">
            <h2 className="text-sm font-semibold text-zinc-900">Inspection Snapshot</h2>

            {inspectionPreview ? (
              <div className="mt-3 space-y-2">
                {inspectionPreview.rows.map(row => (
                  <div
                    key={`status-${row.label}`}
                    className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs"
                  >
                    <p className="font-medium text-zinc-500">{row.label}</p>
                    <p className="mt-0.5 break-all text-zinc-800">{row.value}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p
                className="mt-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-3 py-3
                  text-xs text-zinc-500"
              >
                No inspection result yet.
              </p>
            )}
          </section>

          <section className="mt-6">
            <h2 className="text-sm font-semibold text-zinc-900">Unlock Submission</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Applied at: {formatAppliedAt(unlockAppliedAt)}
            </p>

            {unlockPreview ? (
              <div className="mt-3 space-y-2">
                {unlockPreview.rows.map(row => (
                  <div
                    key={`unlock-${row.label}`}
                    className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs"
                  >
                    <p className="font-medium text-zinc-500">{row.label}</p>
                    <p className="mt-0.5 break-all text-zinc-800">{row.value}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p
                className="mt-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-3 py-3
                  text-xs text-zinc-500"
              >
                Submit unlock/create form to view payload wiring.
              </p>
            )}
          </section>

          <div className="mt-5 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-900/95">
            <pre className="max-h-64 overflow-auto px-3 py-3 text-xs leading-relaxed text-zinc-100">
              {unlockPreview?.json ?? selectionPreview?.json ?? '{\n  "preview": null\n}'}
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
