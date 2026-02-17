import { useEffect, useMemo, useState } from 'react';
import { classes } from '@/utils/classes';
import { normalizeDirectoryPath } from './utils';
import type { StorageBackend } from '@/types';
import type { SubmitEvent } from 'react';

type DirectoryPickerStorage = Pick<StorageBackend, 'ensureDirectory' | 'readDirectory'>;

export interface DirectoryPickerProps {
  storage: DirectoryPickerStorage;
  value: string;
  onChange: (path: string) => void;
  disabled?: boolean;
  className?: string;
}

const joinDirectoryPath = (basePath: string, nextSegment: string): string => {
  const normalizedBase = normalizeDirectoryPath(basePath);
  const normalizedSegment = normalizeDirectoryPath(nextSegment);
  if (!normalizedBase) {
    return normalizedSegment;
  }

  if (!normalizedSegment) {
    return normalizedBase;
  }

  return `${normalizedBase}/${normalizedSegment}`;
};

const getParentDirectoryPath = (path: string): string => {
  const segments = normalizeDirectoryPath(path).split('/').filter(Boolean);
  if (segments.length === 0) {
    return '';
  }

  segments.pop();
  return segments.join('/');
};

export function DirectoryPicker({
  storage,
  value,
  onChange,
  disabled = false,
  className,
}: DirectoryPickerProps) {
  const [directories, setDirectories] = useState<string[]>([]);
  const [isLoadingDirectories, setIsLoadingDirectories] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [manualPath, setManualPath] = useState('');
  const [isCreatingDirectory, setIsCreatingDirectory] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const normalizedValue = normalizeDirectoryPath(value);
  const canBrowseDirectories = typeof storage.readDirectory === 'function';

  useEffect(() => {
    setManualPath(normalizedValue);
  }, [normalizedValue]);

  useEffect(() => {
    let cancelled = false;

    if (!canBrowseDirectories || !storage.readDirectory) {
      setDirectories([]);
      setIsLoadingDirectories(false);
      return;
    }

    setIsLoadingDirectories(true);
    setErrorMessage(null);

    void storage
      .readDirectory(normalizedValue)
      .then(nextDirectories => {
        if (cancelled) {
          return;
        }

        setDirectories(nextDirectories);
      })
      .catch(error => {
        if (cancelled) {
          return;
        }

        const fallback = 'Could not read folders for this location.';
        setErrorMessage(error instanceof Error ? error.message : fallback);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingDirectories(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [canBrowseDirectories, normalizedValue, storage]);

  const pathSegments = useMemo(
    () => normalizeDirectoryPath(normalizedValue).split('/').filter(Boolean),
    [normalizedValue]
  );

  const navigateTo = (nextPath: string) => {
    setErrorMessage(null);
    onChange(normalizeDirectoryPath(nextPath));
  };

  const handleCreateDirectory = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled || isCreatingDirectory) {
      return;
    }

    const folderName = newFolderName.trim();
    if (!folderName) {
      setErrorMessage('Enter a folder name.');
      return;
    }

    if (folderName === '.' || folderName === '..' || folderName.includes('/')) {
      setErrorMessage('Folder names cannot include slashes or relative path markers.');
      return;
    }

    const targetPath = joinDirectoryPath(normalizedValue, folderName);
    setIsCreatingDirectory(true);
    setErrorMessage(null);

    try {
      await storage.ensureDirectory(targetPath);
      setNewFolderName('');
      navigateTo(targetPath);
    } catch (error) {
      const fallback = 'Could not create this folder.';
      setErrorMessage(error instanceof Error ? error.message : fallback);
    } finally {
      setIsCreatingDirectory(false);
    }
  };

  const applyManualPath = () => {
    if (disabled) {
      return;
    }

    navigateTo(manualPath);
  };

  return (
    <div
      className={classes(
        'rounded-2xl border border-default-200 bg-surface/80 p-4 sm:p-5',
        className
      )}
    >
      <p className="text-sm font-semibold text-default-800">Select Directory</p>

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="mt-2 flex flex-wrap items-center gap-1 text-xs">
          <button
            type="button"
            disabled={disabled}
            onClick={() => navigateTo('')}
            className="rounded-md border border-default-300 bg-surface px-2 py-1 text-default-700
              transition-colors duration-200 hover:border-default-400 hover:bg-default-100
              disabled:cursor-not-allowed disabled:border-default-200 disabled:bg-default-100
              disabled:text-default-400"
          >
            /
          </button>
          {pathSegments.map((segment, index) => {
            const partialPath = pathSegments.slice(0, index + 1).join('/');
            return (
              <button
                key={partialPath}
                type="button"
                disabled={disabled}
                onClick={() => navigateTo(partialPath)}
                className="rounded-md border border-default-300 bg-surface px-2 py-1
                  text-default-700 transition-colors duration-200 hover:border-default-400
                  hover:bg-default-100 disabled:cursor-not-allowed disabled:border-default-200
                  disabled:bg-default-100 disabled:text-default-400"
              >
                {segment}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          disabled={disabled || !normalizedValue}
          onClick={() => navigateTo(getParentDirectoryPath(normalizedValue))}
          className="inline-flex items-center rounded-lg border border-default-300 bg-surface px-2.5
            py-1.5 text-xs font-medium text-default-700 transition-colors duration-200
            hover:border-default-400 hover:bg-default-100 disabled:cursor-not-allowed
            disabled:border-default-200 disabled:bg-default-100 disabled:text-default-400"
        >
          New Folder
        </button>
      </div>

      {canBrowseDirectories ? (
        <div className="mt-3 rounded-lg border border-default-200 bg-surface p-2">
          {isLoadingDirectories ? (
            <p className="px-2 py-3 text-xs text-default-500">Loading folders...</p>
          ) : directories.length > 0 ? (
            <div className="grid gap-1">
              {directories.map(directoryName => {
                const directoryPath = joinDirectoryPath(normalizedValue, directoryName);
                return (
                  <button
                    key={directoryPath}
                    type="button"
                    disabled={disabled}
                    onClick={() => navigateTo(directoryPath)}
                    className="flex items-center justify-between rounded-lg px-2 py-2 text-left
                      text-xs font-medium text-default-700 transition-colors duration-200
                      hover:bg-default-100 disabled:cursor-not-allowed disabled:text-default-400"
                  >
                    <span>{directoryName}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="px-2 py-3 text-xs text-default-500">
              No subfolders in this location yet.
            </p>
          )}
        </div>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
          <input
            type="text"
            value={manualPath}
            disabled={disabled}
            onChange={event => setManualPath(event.target.value)}
            placeholder="folder/subfolder"
            className="w-full rounded-lg border border-default-300 bg-surface px-3 py-2 text-xs
              text-default-800 outline-none placeholder:text-default-400 focus:border-default-500
              disabled:cursor-not-allowed disabled:border-default-200 disabled:bg-default-100"
          />
          <button
            type="button"
            disabled={disabled}
            onClick={applyManualPath}
            className="inline-flex items-center justify-center rounded-lg border border-default-300
              bg-surface px-3 py-2 text-xs font-medium text-default-700 transition-colors
              duration-200 hover:border-default-400 hover:bg-default-100 disabled:cursor-not-allowed
              disabled:border-default-200 disabled:bg-default-100 disabled:text-default-400"
          >
            Apply path
          </button>
        </div>
      )}

      {errorMessage && (
        <p
          className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          {errorMessage}
        </p>
      )}
    </div>
  );
}
