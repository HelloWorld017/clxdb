export const ExportTab = () => (
  <div className="space-y-4">
    <div>
      <h3 className="text-lg font-semibold text-[var(--clxdb-color-900)]">Export and import</h3>
      <p className="mt-1 text-sm text-[var(--clxdb-color-600)]">
        Prepare JSON backup workflows. Action wiring is intentionally left to your app.
      </p>
    </div>

    <article
      className="rounded-2xl border border-[var(--clxdb-color-200)] bg-[var(--clxdb-color-50)]/70
        p-4"
    >
      <p className="text-sm font-semibold text-[var(--clxdb-color-900)]">JSON export</p>
      <p className="mt-1 text-xs leading-relaxed text-[var(--clxdb-color-500)]">
        Download the current database state as a JSON payload for manual backup and audit.
      </p>

      <button
        type="button"
        disabled
        className="mt-4 inline-flex items-center justify-center rounded-xl border
          border-[var(--clxdb-color-300)] bg-[var(--clxdb-color-surface)] px-4 py-2.5 text-sm
          font-medium text-[var(--clxdb-color-500)]"
      >
        Export JSON
      </button>
    </article>

    <article
      className="rounded-2xl border border-[var(--clxdb-color-200)] bg-[var(--clxdb-color-50)]/70
        p-4"
    >
      <p className="text-sm font-semibold text-[var(--clxdb-color-900)]">JSON import</p>
      <p className="mt-1 text-xs leading-relaxed text-[var(--clxdb-color-500)]">
        Restore database data from an exported JSON file in a future implementation.
      </p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="file"
          accept="application/json"
          disabled
          className="block flex-1 rounded-xl border border-[var(--clxdb-color-300)]
            bg-[var(--clxdb-color-surface)] px-3 py-2 text-xs text-[var(--clxdb-color-500)]
            file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--clxdb-color-900)] file:px-3
            file:py-1.5 file:text-xs file:font-semibold file:text-[var(--clxdb-color-100)]"
        />
        <button
          type="button"
          disabled
          className="inline-flex items-center justify-center rounded-xl border
            border-[var(--clxdb-color-300)] bg-[var(--clxdb-color-surface)] px-4 py-2.5 text-sm
            font-medium text-[var(--clxdb-color-500)]"
        >
          Import JSON
        </button>
      </div>
    </article>
  </div>
);
