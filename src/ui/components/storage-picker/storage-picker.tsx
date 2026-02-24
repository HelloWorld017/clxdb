import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { createStorageBackend } from '@/storages';
import { useDebouncedValue } from '@/ui/hooks/use-debounced-value';
import { classes } from '@/utils/classes';
import { DirectoryPicker } from './directory-picker';
import { FileSystemIcon, OPFSIcon, S3Icon, WebDAVIcon } from './icons';
import { StoragePickerFilesystemAccess } from './storage-picker-filesystem-access';
import { StoragePickerOpfs } from './storage-picker-opfs';
import { StoragePickerS3 } from './storage-picker-s3';
import { StoragePickerWebdav } from './storage-picker-webdav';
import { supportsFileSystemAccess, supportsOpfs } from './utils';
import type { OnStoragePickerConfigChange } from './types';
import type { StorageConfig } from '@/storages';
import type { StorageBackend } from '@/types';

export type StoragePickerBackendType = 'filesystem-access' | 'opfs' | 'webdav' | 's3';

export interface StoragePickerProps {
  onSelect: (selection: StorageConfig) => Promise<void> | void;
  onCancel?: () => void;
  className?: string;
  disabled?: boolean;
  initialType?: StoragePickerBackendType;
  submitLabel?: string;
}

export function StoragePicker({
  onSelect,
  onCancel,
  className,
  disabled = false,
  initialType = 'filesystem-access',
  submitLabel = 'Save storage settings',
}: StoragePickerProps) {
  const [selectedType, setSelectedType] = useState<StoragePickerBackendType>(initialType);
  const [directoryPath, setDirectoryPath] = useState('');
  const [selectedConfigUndebounced, setSelectedConfigUndebounced] = useState<StorageConfig | null>(
    null
  );
  const [configDebounceKey, setConfigDebounceKey] = useState(`${initialType}:init`);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [isSelectionValid, setIsSelectionValid] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const pickerId = useId();

  const storageGroupName = `${pickerId}-storage`;

  const filesystemSupported = supportsFileSystemAccess();
  const opfsSupported = supportsOpfs();

  const availableTypes = useMemo(() => {
    const types: StoragePickerBackendType[] = ['s3', 'webdav'];

    if (opfsSupported) {
      types.unshift('opfs');
    }

    if (filesystemSupported) {
      types.unshift('filesystem-access');
    }

    return types;
  }, [filesystemSupported, opfsSupported]);

  useEffect(() => {
    if (!availableTypes.includes(selectedType)) {
      const fallbackType = availableTypes[0];
      setSelectedType(fallbackType);
      setDirectoryPath('');
      setSelectedConfigUndebounced(null);
      setConfigDebounceKey(`${fallbackType}:fallback`);
      setValidationMessage(null);
      setIsSelectionValid(false);
      setErrorMessage(null);
    }
  }, [availableTypes, selectedType]);

  const controlsLocked = disabled || isSubmitting;

  const storageOptions = [
    {
      type: 'filesystem-access' as const,
      label: 'FileSystem Access API',
      description: 'Save to a local folder with explicit read/write permission.',
      icon: FileSystemIcon,
      supported: filesystemSupported,
      unsupportedReason: 'FileSystem Access API is not supported in this browser.',
    },
    {
      type: 'opfs' as const,
      label: 'Origin Private File System',
      description: 'Use browser-managed private storage for this origin and profile.',
      icon: OPFSIcon,
      supported: opfsSupported,
      unsupportedReason: 'Origin Private File System is not supported in this browser.',
    },
    {
      type: 's3' as const,
      label: 'S3 Compatible',
      description: 'Connect Amazon S3, Cloudflare R2, MinIO, and S3-compatible APIs.',
      icon: S3Icon,
      supported: true,
      unsupportedReason: '',
    },
    {
      type: 'webdav' as const,
      label: 'WebDAV',
      description: 'Connect a WebDAV endpoint to sync data across devices.',
      icon: WebDAVIcon,
      supported: true,
      unsupportedReason: '',
    },
  ];

  const onStorageConfigChange = useCallback<OnStoragePickerConfigChange>(change => {
    setSelectedConfigUndebounced(change.config);
    setConfigDebounceKey(change.debounceKey);
    setValidationMessage(change.validationMessage);
    setIsSelectionValid(change.isValid);
    setErrorMessage(null);
  }, []);

  const selectedConfigDebounced = useDebouncedValue(
    selectedConfigUndebounced,
    500,
    configDebounceKey
  );

  const rootStorageBackend = useMemo<StorageBackend | null>(() => {
    if (!selectedConfigDebounced) {
      return null;
    }

    try {
      return createStorageBackend(selectedConfigDebounced);
    } catch {
      return null;
    }
  }, [selectedConfigDebounced]);

  const handleDirectoryPathChange = useCallback((nextPath: string) => {
    setDirectoryPath(nextPath);
    setErrorMessage(null);
  }, []);

  const selectStorageType = (nextType: StoragePickerBackendType) => {
    setSelectedType(nextType);
    setDirectoryPath('');
    setSelectedConfigUndebounced(null);
    setConfigDebounceKey(`${nextType}:switch`);
    setValidationMessage(null);
    setIsSelectionValid(false);
    setErrorMessage(null);
  };

  const handleSubmit = async () => {
    if (controlsLocked) {
      return;
    }

    if (!selectedConfigUndebounced || !isSelectionValid) {
      setErrorMessage(validationMessage ?? 'Please check the details and try again.');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await onSelect(selectedConfigUndebounced);
    } catch (error) {
      const fallback = 'Could not save storage settings. Please try again.';
      setErrorMessage(error instanceof Error ? error.message : fallback);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section
      className={classes(
        `relative isolate mx-auto h-150 overflow-hidden rounded-[2rem] border border-default-200
        bg-default-100 p-3 shadow-ui-soft`,
        className
      )}
    >
      <div className="absolute top-0 left-0 z-[-1] h-full w-full overflow-hidden">
        <div
          className="pointer-events-none absolute -top-24 -left-24 h-56 w-56 rounded-full
            bg-default-300/45 blur-3xl"
        />
      </div>

      <div className="flex h-full flex-col overflow-auto p-3 pb-0 sm:p-5 sm:pb-0">
        <header className="mb-8 space-y-2">
          <p className="text-xs font-semibold tracking-[0.2em] text-default-500 uppercase">
            Storage Backend
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-default-900 sm:text-3xl">
            Choose storage and folder
          </h2>
          <p className="max-w-2xl text-sm leading-relaxed text-default-600">
            Pick FileSystem Access API, Origin Private File System, WebDAV, or an S3-compatible
            provider, then choose where ClxDB should store its files.
          </p>
        </header>

        <div className="flex flex-1 flex-col space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {storageOptions.map(option => {
              const active = selectedType === option.type;
              const isDisabled = controlsLocked || !option.supported;

              return (
                <label
                  key={option.type}
                  aria-label={option.label}
                  className={classes(
                    'group relative rounded-2xl border p-4 text-left transition-all duration-200',
                    active
                      ? `border-primary bg-primary text-primary-foreground shadow-md
                        shadow-primary/25`
                      : `cursor-pointer border-default-200 bg-surface/70 text-default-700
                        hover:border-default-400 hover:bg-surface/90`,
                    isDisabled &&
                      'cursor-not-allowed border-default-200 bg-default-100/80 text-default-400'
                  )}
                >
                  <input
                    type="radio"
                    name={storageGroupName}
                    value={option.type}
                    checked={active}
                    disabled={isDisabled}
                    onChange={() => selectStorageType(option.type)}
                    className="sr-only"
                  />

                  <div className="mb-6 flex items-center justify-between">
                    <option.icon
                      className={classes(
                        'h-5 w-5 transition-colors duration-200',
                        active ? 'text-primary-foreground' : 'text-default-500',
                        isDisabled && 'text-default-400'
                      )}
                    />
                    {!option.supported && (
                      <span
                        className="rounded-full border border-default-300 px-2 py-0.5 text-[10px]
                          font-semibold tracking-wide text-default-500 uppercase"
                      >
                        Unsupported
                      </span>
                    )}
                  </div>

                  <p className="text-sm font-semibold">{option.label}</p>
                  <p
                    className={classes(
                      'mt-1 text-xs leading-relaxed',
                      active ? 'text-primary-foreground-muted' : 'text-default-500',
                      isDisabled && 'text-default-400'
                    )}
                  >
                    {option.description}
                  </p>

                  {!option.supported && (
                    <p
                      className="mt-3 text-[11px] font-medium tracking-wide text-default-400
                        uppercase"
                    >
                      {option.unsupportedReason}
                    </p>
                  )}
                </label>
              );
            })}
          </div>

          {selectedType === 'filesystem-access' && (
            <StoragePickerFilesystemAccess
              controlsLocked={controlsLocked}
              directoryPath={directoryPath}
              onDirectoryPathChange={handleDirectoryPathChange}
              onConfigChange={onStorageConfigChange}
            />
          )}

          {selectedType === 'opfs' && (
            <StoragePickerOpfs
              directoryPath={directoryPath}
              onConfigChange={onStorageConfigChange}
            />
          )}

          {selectedType === 's3' && (
            <StoragePickerS3
              controlsLocked={controlsLocked}
              directoryPath={directoryPath}
              onConfigChange={onStorageConfigChange}
            />
          )}

          {selectedType === 'webdav' && (
            <StoragePickerWebdav
              controlsLocked={controlsLocked}
              directoryPath={directoryPath}
              onConfigChange={onStorageConfigChange}
            />
          )}

          {rootStorageBackend ? (
            <DirectoryPicker
              storage={rootStorageBackend}
              value={directoryPath}
              onChange={handleDirectoryPathChange}
              disabled={controlsLocked}
            />
          ) : (
            <div className="rounded-2xl border border-default-200 bg-surface/80 p-4 sm:p-5">
              <p className="text-sm font-semibold text-default-800">Select Directory</p>
              <p className="mt-1 text-xs text-default-500">Choose storage first.</p>
            </div>
          )}

          {errorMessage && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {errorMessage}
            </p>
          )}

          <div className="flex-1" />
          <div
            className="sticky bottom-0 flex flex-col-reverse gap-2 pb-4 sm:flex-row sm:justify-end
              sm:pb-6"
          >
            <div
              className="absolute inset-0 z-[-1] bg-linear-to-t from-default-100 from-20%
                to-transparent"
            />
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={controlsLocked}
                className="inline-flex items-center justify-center rounded-xl border
                  border-default-300 bg-surface px-4 py-2.5 text-sm font-medium text-default-700
                  shadow-xs transition-colors duration-200 hover:border-default-400
                  hover:bg-default-100 disabled:cursor-not-allowed disabled:border-default-200
                  disabled:bg-default-100 disabled:text-default-400"
              >
                Cancel
              </button>
            )}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={controlsLocked}
              className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5
                text-sm font-semibold text-primary-foreground shadow-md transition-colors
                duration-200 hover:bg-primary-hover disabled:cursor-not-allowed
                disabled:bg-default-300"
            >
              {isSubmitting ? 'Applying...' : submitLabel}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
