export const normalizeDirectoryPath = (path: string): string =>
  path.trim().split('/').filter(Boolean).join('/');

export const normalizeWebDavUrl = (value: string) => {
  const parsed = new URL(value.trim());
  return parsed.toString().replace(/\/$/, '');
};

export const toWebDavDirectoryUrl = (baseUrl: string, directoryPath: string): string => {
  const normalizedPath = normalizeDirectoryPath(directoryPath);
  if (!normalizedPath) {
    return baseUrl;
  }

  const parsed = new URL(baseUrl);
  const pathname = parsed.pathname.replace(/\/$/, '');
  const encodedPath = normalizedPath
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/');

  parsed.pathname = `${pathname}/${encodedPath}`;
  return parsed.toString().replace(/\/$/, '');
};

export const resolveDirectoryHandle = async (
  rootHandle: FileSystemDirectoryHandle,
  directoryPath: string
): Promise<FileSystemDirectoryHandle> => {
  const segments = normalizeDirectoryPath(directoryPath).split('/').filter(Boolean);
  let currentHandle = rootHandle;

  for (const segment of segments) {
    currentHandle = await currentHandle.getDirectoryHandle(segment);
  }

  return currentHandle;
};

export const supportsFileSystemAccess = () =>
  typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';

type StorageManagerWithDirectory = StorageManager & Required<Pick<StorageManager, 'getDirectory'>>;

export const getNavigatorStorageWithDirectory = (): StorageManagerWithDirectory | null => {
  if (typeof navigator === 'undefined') {
    return null;
  }

  const candidate = navigator.storage;
  if (typeof candidate?.getDirectory !== 'function') {
    return null;
  }

  return candidate as StorageManagerWithDirectory;
};

export const supportsOpfs = () => !!getNavigatorStorageWithDirectory();
