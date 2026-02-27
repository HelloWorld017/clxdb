import { useEffect, useState } from 'react';
import { _t, useI18n } from '@/ui/i18n';
import { normalizeDirectoryPath, resolveDirectoryHandle, supportsFileSystemAccess } from './utils';
import type { OnStoragePickerConfigChange } from './types';

export interface StoragePickerFilesystemAccessProps {
  controlsLocked: boolean;
  directoryPath: string;
  onDirectoryPathChange: (path: string) => void;
  onConfigChange: OnStoragePickerConfigChange;
}

export const StoragePickerFilesystemAccess = ({
  controlsLocked,
  directoryPath,
  onDirectoryPathChange,
  onConfigChange,
}: StoragePickerFilesystemAccessProps) => {
  const { t } = useI18n();
  const [filesystemRootHandle, setFilesystemRootHandle] =
    useState<FileSystemDirectoryHandle | null>(null);
  const [isPickingDirectory, setIsPickingDirectory] = useState(false);
  const [pickerErrorMessage, setPickerErrorMessage] = useState<string | null>(null);

  const filesystemSupported = supportsFileSystemAccess();

  useEffect(() => {
    const debounceKey = `filesystem-access:${normalizeDirectoryPath(directoryPath)}`;

    if (!filesystemSupported) {
      onConfigChange({
        config: null,
        isValid: false,
        validationMessage: t('storagePicker.filesystem.validation.unsupported'),
        debounceKey,
      });
      return;
    }

    if (!filesystemRootHandle) {
      onConfigChange({
        config: null,
        isValid: false,
        validationMessage: t('storagePicker.filesystem.validation.selectRoot'),
        debounceKey,
      });
      return;
    }

    let cancelled = false;
    void resolveDirectoryHandle(filesystemRootHandle, directoryPath)
      .then(handle => {
        if (cancelled) {
          return;
        }

        onConfigChange({
          config: {
            kind: 'filesystem',
            provider: 'filesystem-access',
            handle,
          },
          isValid: true,
          validationMessage: null,
          debounceKey,
        });
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        onConfigChange({
          config: null,
          isValid: false,
          validationMessage: t('storagePicker.filesystem.validation.selectedFolderMissing'),
          debounceKey,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [directoryPath, filesystemRootHandle, filesystemSupported, onConfigChange, t]);

  const pickDirectory = async () => {
    if (!filesystemSupported || !window.showDirectoryPicker) {
      setPickerErrorMessage(t('storagePicker.filesystem.error.apiUnavailable'));
      return;
    }

    setPickerErrorMessage(null);
    setIsPickingDirectory(true);

    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      setFilesystemRootHandle(handle);
      onDirectoryPathChange('');
    } catch (error) {
      if (!(error instanceof Error) || error.name !== 'AbortError') {
        const fallback = t('storagePicker.filesystem.error.openPickerFailed');
        setPickerErrorMessage(error instanceof Error ? error.message : fallback);
      }
    } finally {
      setIsPickingDirectory(false);
    }
  };

  return (
    <div className="rounded-2xl border border-default-200 bg-surface/80 p-4 sm:p-5">
      <div className="flex justify-between gap-2">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-default-800">
            <_t>{['storagePicker.filesystem.title']}</_t>
          </p>
          <p className="mt-1 text-xs text-default-500">
            <_t>{['storagePicker.filesystem.description']}</_t>
          </p>
        </div>

        <button
          type="button"
          onClick={pickDirectory}
          disabled={controlsLocked || isPickingDirectory}
          className="inline-flex items-center gap-2 rounded-xl border border-default-300 bg-primary
            px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors duration-200
            hover:bg-primary-hover disabled:cursor-not-allowed disabled:border-default-200
            disabled:bg-default-300"
        >
          {isPickingDirectory ? (
            <_t>{['common.opening']}</_t>
          ) : (
            <_t>{['storagePicker.filesystem.button.selectFolder']}</_t>
          )}
        </button>
      </div>

      <p className="mt-3 text-xs text-default-500">
        {filesystemRootHandle
          ? t('storagePicker.filesystem.selectedRoot', { name: filesystemRootHandle.name })
          : t('storagePicker.filesystem.selectedRoot.empty')}
      </p>

      {pickerErrorMessage && (
        <p
          className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          {pickerErrorMessage}
        </p>
      )}
    </div>
  );
};
