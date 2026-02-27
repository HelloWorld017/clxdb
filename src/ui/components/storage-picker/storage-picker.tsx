import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { createStorageBackend } from '@/storages';
import { useDebouncedValue } from '@/ui/hooks/use-debounced-value';
import { _t, useI18n } from '@/ui/i18n';
import { classes } from '@/utils/classes';
import { CorsGuideMessage } from './cors-guide';
import { DirectoryPicker } from './directory-picker';
import { FileSystemIcon, OPFSIcon, S3Icon, WebDAVIcon } from './icons';
import { StoragePickerFilesystemAccess } from './storage-picker-filesystem-access';
import { StoragePickerOpfs } from './storage-picker-opfs';
import { StoragePickerS3 } from './storage-picker-s3';
import { StoragePickerWebdav } from './storage-picker-webdav';
import { supportsFileSystemAccess, supportsOpfs } from './utils';
import type { OnStoragePickerConfigChange, StoragePickerSelection } from './types';
import type { StorageConfig } from '@/storages';
import type { StorageBackend } from '@/types';

export type StoragePickerBackendType = 'filesystem-access' | 'opfs' | 'webdav' | 's3';

export interface StoragePickerProps {
  onSelect: (selection: StoragePickerSelection) => Promise<void> | void;
  onCancel?: () => void;
  className?: string;
  disabled?: boolean;
  initialType?: StoragePickerBackendType;
  submitLabel?: string;
  showPersistOption?: boolean;
}

export function StoragePicker({
  onSelect,
  onCancel,
  className,
  disabled = false,
  initialType = 'filesystem-access',
  submitLabel,
  showPersistOption = false,
}: StoragePickerProps) {
  const { t } = useI18n();
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
  const [persistSelection, setPersistSelection] = useState(false);
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
  const resolvedSubmitLabel = submitLabel ?? t('storagePicker.submit.default');

  const storageOptions = [
    {
      type: 'filesystem-access' as const,
      label: t('storagePicker.option.filesystem.label'),
      description: t('storagePicker.option.filesystem.description'),
      icon: FileSystemIcon,
      supported: filesystemSupported,
      unsupportedReason: t('storagePicker.option.filesystem.unsupportedReason'),
    },
    {
      type: 'opfs' as const,
      label: t('storagePicker.option.opfs.label'),
      description: t('storagePicker.option.opfs.description'),
      icon: OPFSIcon,
      supported: opfsSupported,
      unsupportedReason: t('storagePicker.option.opfs.unsupportedReason'),
    },
    {
      type: 's3' as const,
      label: t('storagePicker.option.s3.label'),
      description: t('storagePicker.option.s3.description'),
      icon: S3Icon,
      supported: true,
      unsupportedReason: '',
    },
    {
      type: 'webdav' as const,
      label: t('storagePicker.option.webdav.label'),
      description: t('storagePicker.option.webdav.description'),
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
      setErrorMessage(validationMessage ?? t('storagePicker.error.invalidSelection'));
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await onSelect({
        ...selectedConfigUndebounced,
        ...(showPersistOption ? { persist: persistSelection } : {}),
      });
    } catch (error) {
      const fallback = t('storagePicker.error.saveFailed');
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
            <_t>{['storagePicker.eyebrow']}</_t>
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-default-900 sm:text-3xl">
            <_t>{['storagePicker.title']}</_t>
          </h2>
          <p className="max-w-2xl text-sm leading-relaxed text-default-600">
            <_t>{['storagePicker.description']}</_t>
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
                        <_t>{['storagePicker.unsupportedBadge']}</_t>
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

          {(selectedType === 's3' || selectedType === 'webdav') && (
            <CorsGuideMessage disabled={controlsLocked} />
          )}

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
              <p className="text-sm font-semibold text-default-800">
                <_t>{['storagePicker.selectDirectory.title']}</_t>
              </p>
              <p className="mt-1 text-xs text-default-500">
                <_t>{['storagePicker.selectDirectory.chooseStorageFirst']}</_t>
              </p>
            </div>
          )}

          {errorMessage && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {errorMessage}
            </p>
          )}

          {showPersistOption && (
            <label className="flex items-start gap-2 px-3">
              <input
                type="checkbox"
                checked={persistSelection}
                onChange={event => setPersistSelection(event.target.checked)}
                disabled={controlsLocked}
                className="mt-0.5 h-4 w-4 rounded border-default-300 text-primary
                  focus:ring-primary"
              />
              <span className="text-sm font-medium text-default-700">
                <_t>{['storagePicker.persist.label']}</_t>
              </span>
            </label>
          )}

          <div className="m-0 flex-1" />
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
                <_t>{['common.cancel']}</_t>
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
              {isSubmitting ? <_t>{['common.applying']}</_t> : resolvedSubmitLabel}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
