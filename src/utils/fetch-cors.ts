/*
 * cache: 'no-store' does not work with the userscript fetcher
 */
export const invalidateCache = <T extends URL | string>(url: T): T => {
  const urlInternal = new URL(url);
  urlInternal.searchParams.append('__t', `${Date.now()}`);

  return (typeof url === 'string' ? urlInternal.href : urlInternal) as T;
};
