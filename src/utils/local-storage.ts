import type { ZodType } from 'zod';

export interface LocalStorageOptions {
  cacheStorageKey: string;
}

export function readLocalStorage<T>(
  key: string,
  options: LocalStorageOptions,
  schema: ZodType<T>
): T | null {
  if (!options.cacheStorageKey) {
    return null;
  }

  const fullKey = `${options.cacheStorageKey}/${key}`;

  try {
    const item = localStorage.getItem(fullKey);
    if (item === null) {
      return null;
    }

    const parsed = JSON.parse(item) as unknown;
    const result = schema.safeParse(parsed);

    if (result.success) {
      return result.data;
    } else {
      console.warn(`Invalid data in localStorage for key "${fullKey}":`, result.error);
      return null;
    }
  } catch {
    return null;
  }
}

export function writeLocalStorage<T>(key: string, options: LocalStorageOptions, value: T): void {
  if (!options.cacheStorageKey) {
    return;
  }

  const fullKey = `${options.cacheStorageKey}/${key}`;

  try {
    localStorage.setItem(fullKey, JSON.stringify(value));
  } catch (error) {
    console.warn(`Failed to write to localStorage for key "${fullKey}":`, error);
  }
}

export function removeLocalStorage(key: string, options: LocalStorageOptions): void {
  if (!options.cacheStorageKey) {
    return;
  }

  const fullKey = `${options.cacheStorageKey}/${key}`;

  try {
    localStorage.removeItem(fullKey);
  } catch {
    // Ignore removal errors
  }
}
