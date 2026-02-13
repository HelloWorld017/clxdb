export const ExportTab = () => (
  <div className="space-y-4">
    <div>
      <h3 className="text-lg font-semibold text-zinc-900">Export and import</h3>
      <p className="mt-1 text-sm text-zinc-600">
        Prepare JSON backup workflows. Action wiring is intentionally left to your app.
      </p>
    </div>

    <article className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4">
      <p className="text-sm font-semibold text-zinc-900">JSON export</p>
      <p className="mt-1 text-xs leading-relaxed text-zinc-500">
        Download the current database state as a JSON payload for manual backup and audit.
      </p>

      <button
        type="button"
        disabled
        className="mt-4 inline-flex items-center justify-center rounded-xl border border-zinc-300
          bg-white px-4 py-2.5 text-sm font-medium text-zinc-500"
      >
        Export JSON
      </button>
    </article>

    <article className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4">
      <p className="text-sm font-semibold text-zinc-900">JSON import</p>
      <p className="mt-1 text-xs leading-relaxed text-zinc-500">
        Restore database data from an exported JSON file in a future implementation.
      </p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="file"
          accept="application/json"
          disabled
          className="block flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs
            text-zinc-500 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-3
            file:py-1.5 file:text-xs file:font-semibold file:text-zinc-100"
        />
        <button
          type="button"
          disabled
          className="inline-flex items-center justify-center rounded-xl border border-zinc-300
            bg-white px-4 py-2.5 text-sm font-medium text-zinc-500"
        >
          Import JSON
        </button>
      </div>
    </article>
  </div>
);
