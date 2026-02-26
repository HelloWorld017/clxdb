export const UntestedWarning = () => (
  <div className={'my-3 rounded-xl border border-amber-200 bg-amber-50/85 px-4 py-3'}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <div className="text-sm font-semibold text-amber-900">This guide is not tested</div>
        <div className="mt-0.5 text-xs text-amber-700">
          Expect something broken. You can contribute it{' '}
          <a href="https://github.com/HelloWorld017/clxdb/discussions/categories/cors-guides">
            here.
          </a>
        </div>
      </div>
    </div>
  </div>
);

export const ThirdPartyCodeWarning = () => (
  <div className={'my-3 rounded-xl border border-amber-200 bg-amber-50/85 px-4 py-3'}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <div className="text-sm font-semibold text-amber-900">
          This guide involves executing third-party code.
        </div>
        <div className="mt-0.5 text-xs text-amber-700">Use it at your own risk.</div>
      </div>
    </div>
  </div>
);
