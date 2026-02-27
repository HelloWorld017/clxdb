import {
  initialize as initializeCorsManager,
  isInitialized as isCorsManagerInitialized,
  fetchCors as fetchViaCorsManager,
} from 'cors-manager';
import {
  hasInstall as isCorsUnblockInitialized,
  requestHosts as requestCorsUnblockHost,
} from 'cors-unblock';

type RequestKind = 'cors-manager' | 'fetch' | 'default';
const state = {
  originMap: new Map<string, RequestKind>(),
  hasInitializedCorsManager: false,
};

const getRequestURL = (input: URL | RequestInfo) => {
  try {
    return new URL(new Request(input).url);
  } catch {
    return null;
  }
};

export const fetchCors: typeof fetch = async (input, init) => {
  let lastError: unknown = null;

  const requestURL = getRequestURL(input);
  if (typeof window === 'undefined' || !requestURL) {
    return fetch(input, init);
  }

  const { origin: requestOrigin, hostname: requestHost } = requestURL;

  // Use Native Fetch
  const requestMethod = (requestOrigin && state.originMap.get(requestOrigin)) || 'default';
  if (requestMethod === 'default' || requestMethod === 'fetch') {
    const result = await fetch(input, init).then(
      result => ({ success: true as const, result }),
      error => ({ success: false as const, error: error as unknown })
    );

    if (result.success) {
      return result.result;
    }

    lastError = result.error;
    if (requestMethod === 'fetch') {
      throw lastError;
    }
  }

  // Use CORS Unblock
  if (isCorsUnblockInitialized()) {
    const result = await requestCorsUnblockHost({
      hosts: [requestHost],
    });

    if (result === 'accept') {
      state.originMap.set(requestOrigin, 'fetch');
      return fetch(input, init);
    }
  }

  // Use CORS Manager
  if (!state.hasInitializedCorsManager) {
    void initializeCorsManager();
    state.hasInitializedCorsManager = true;
  }

  if (isCorsManagerInitialized()) {
    const result = await fetchViaCorsManager(input, init);
    state.originMap.set(requestOrigin, 'cors-manager');
    return result;
  }

  throw lastError;
};

/*
 * cache: 'no-store' does not work with the cors-manager fetcher
 */
export const invalidateCache = <T extends URL | string>(url: T): T => {
  const urlInternal = new URL(url);
  urlInternal.searchParams.append('__t', `${Date.now()}`);

  return (typeof url === 'string' ? urlInternal.href : urlInternal) as T;
};
