export const ExportTab = () => (
  <div className="space-y-4">
    <div>
      <h3 className="text-default-900 text-lg font-semibold">Export and import</h3>
      <p className="text-default-600 mt-1 text-sm">
        Prepare JSON backup workflows. Action wiring is intentionally left to your app.
      </p>
    </div>

    <article className="border-default-200 bg-default-50/70 rounded-2xl border p-4">
      <p className="text-default-900 text-sm font-semibold">JSON export</p>
      <p className="text-default-500 mt-1 text-xs leading-relaxed">
        Download the current database state as a JSON payload for manual backup and audit.
      </p>

      <button
        type="button"
        disabled
        className="border-default-300 text-default-500 mt-4 inline-flex items-center justify-center
          rounded-xl border bg-white px-4 py-2.5 text-sm font-medium"
      >
        Export JSON
      </button>
    </article>

    <article className="border-default-200 bg-default-50/70 rounded-2xl border p-4">
      <p className="text-default-900 text-sm font-semibold">JSON import</p>
      <p className="text-default-500 mt-1 text-xs leading-relaxed">
        Restore database data from an exported JSON file in a future implementation.
      </p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="file"
          accept="application/json"
          disabled
          className="border-default-300 text-default-500 file:bg-primary file:text-default-100 block
            flex-1 rounded-xl border bg-white px-3 py-2 text-xs file:mr-3 file:rounded-lg
            file:border-0 file:px-3 file:py-1.5 file:text-xs file:font-semibold"
        />
        <button
          type="button"
          disabled
          className="border-default-300 text-default-500 inline-flex items-center justify-center
            rounded-xl border bg-white px-4 py-2.5 text-sm font-medium"
        >
          Import JSON
        </button>
      </div>
    </article>
  </div>
);
