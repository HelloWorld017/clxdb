import { _t } from '@/ui/i18n';

export const ExportTab = () => (
  <div className="space-y-4">
    <div>
      <h3 className="text-lg font-semibold text-default-900">
        <_t>{['exportTab.title']}</_t>
      </h3>
      <p className="mt-1 text-sm text-default-600">
        <_t>{['exportTab.description']}</_t>
      </p>
    </div>

    <article className="rounded-2xl border border-default-200 bg-default-50/70 p-4">
      <p className="text-sm font-semibold text-default-900">
        <_t>{['exportTab.section.export.title']}</_t>
      </p>
      <p className="mt-1 text-xs leading-relaxed text-default-500">
        <_t>{['exportTab.section.export.description']}</_t>
      </p>

      <button
        type="button"
        disabled
        className="mt-4 inline-flex items-center justify-center rounded-xl border border-default-300
          bg-surface px-4 py-2.5 text-sm font-medium text-default-500"
      >
        <_t>{['exportTab.button.export']}</_t>
      </button>
    </article>

    <article className="rounded-2xl border border-default-200 bg-default-50/70 p-4">
      <p className="text-sm font-semibold text-default-900">
        <_t>{['exportTab.section.import.title']}</_t>
      </p>
      <p className="mt-1 text-xs leading-relaxed text-default-500">
        <_t>{['exportTab.section.import.description']}</_t>
      </p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="file"
          accept="application/json"
          disabled
          className="block flex-1 rounded-xl border border-default-300 bg-surface px-3 py-2 text-xs
            text-default-500 file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3
            file:py-1.5 file:text-xs file:font-semibold file:text-primary-foreground"
        />
        <button
          type="button"
          disabled
          className="inline-flex items-center justify-center rounded-xl border border-default-300
            bg-surface px-4 py-2.5 text-sm font-medium text-default-500"
        >
          <_t>{['exportTab.button.import']}</_t>
        </button>
      </div>
    </article>
  </div>
);
