import { useEffect, useRef, useState } from 'react';

export function useDebouncedValue<T>(value: T, timeout: number, key: unknown = null) {
  const [outputValue, setOutputValue] = useState(value);
  const keyRef = useRef(key);

  useEffect(() => {
    if (keyRef.current !== key) {
      setOutputValue(value);
      keyRef.current = key;
      return;
    }

    const timeoutId = window.setTimeout(() => setOutputValue(value), timeout);
    return () => clearTimeout(timeoutId);
  }, [value, timeout, key]);

  return outputValue;
}
