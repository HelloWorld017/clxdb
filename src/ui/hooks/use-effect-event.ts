import { useCallback, useRef } from 'react';

// Shim for react/useEffectEvent
export const useEffectEvent = <
  TArguments extends never[],
  TReturnValue,
  T extends (...args: TArguments) => TReturnValue,
>(
  callback: T
): T => {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const effectEvent = useCallback((...args: TArguments) => callbackRef.current(...args), []);
  return effectEvent as T;
};
