import { useEffect, useState } from 'react';
import { _t, useI18n } from '@/ui/i18n';
import {
  getNavigatorStorageWithDirectory,
  normalizeDirectoryPath,
  resolveDirectoryHandle,
  supportsOpfs,
} from './utils';
import type { OnStoragePickerConfigChange } from './types';

export interface StoragePickerOpfsProps {
  directoryPath: string;
  onConfigChange: OnStoragePickerConfigChange;
}

export const StoragePickerOpfs = ({ directoryPath, onConfigChange }: StoragePickerOpfsProps) => {
  const { t } = useI18n();
  const [opfsRootHandle, setOpfsRootHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [isLoadingOpfsRoot, setIsLoadingOpfsRoot] = useState(false);
  const [opfsLoadErrorMessage, setOpfsLoadErrorMessage] = useState<string | null>(null);

  const opfsSupported = supportsOpfs();

  useEffect(() => {
    if (!opfsSupported || opfsRootHandle || isLoadingOpfsRoot) {
      return;
    }

    const opfsStorage = getNavigatorStorageWithDirectory();
    if (!opfsStorage) {
      return;
    }

    let cancelled = false;
    setIsLoadingOpfsRoot(true);
    setOpfsLoadErrorMessage(null);

    void opfsStorage
      .getDirectory()
      .then(handle => {
        if (!cancelled) {
          setOpfsRootHandle(handle);
        }
      })
      .catch(error => {
        if (!cancelled) {
          const fallback = t('storagePicker.opfs.error.accessFailed');
          console.error(error);
          setOpfsLoadErrorMessage(error instanceof Error ? error.message : fallback);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingOpfsRoot(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isLoadingOpfsRoot, opfsRootHandle, opfsSupported, t]);

  useEffect(() => {
    const debounceKey = `opfs:${normalizeDirectoryPath(directoryPath)}`;

    if (!opfsSupported) {
      onConfigChange({
        config: null,
        isValid: false,
        validationMessage: t('storagePicker.opfs.validation.unsupported'),
        debounceKey,
      });
      return;
    }

    if (opfsLoadErrorMessage) {
      onConfigChange({
        config: null,
        isValid: false,
        validationMessage: opfsLoadErrorMessage,
        debounceKey,
      });
      return;
    }

    if (!opfsRootHandle) {
      onConfigChange({
        config: null,
        isValid: false,
        validationMessage: isLoadingOpfsRoot
          ? t('storagePicker.opfs.validation.loading')
          : t('storagePicker.opfs.validation.cannotAccess'),
        debounceKey,
      });
      return;
    }

    let cancelled = false;
    void resolveDirectoryHandle(opfsRootHandle, directoryPath)
      .then(handle => {
        if (cancelled) {
          return;
        }

        onConfigChange({
          config: {
            kind: 'filesystem',
            provider: 'opfs',
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
          validationMessage: t('storagePicker.opfs.validation.selectedFolderMissing'),
          debounceKey,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [
    directoryPath,
    isLoadingOpfsRoot,
    onConfigChange,
    opfsLoadErrorMessage,
    opfsRootHandle,
    opfsSupported,
    t,
  ]);

  return (
    <div className="rounded-2xl border border-default-200 bg-surface/80 p-4 sm:p-5">
      <p className="text-sm font-semibold text-default-800">
        <_t>{['storagePicker.opfs.title']}</_t>
      </p>
      <p className="mt-2 text-xs text-default-500">
        <_t>{['storagePicker.opfs.description']}</_t>
      </p>

      {isLoadingOpfsRoot && !opfsRootHandle && !opfsLoadErrorMessage && (
        <p className="mt-3 text-xs text-default-500">
          <_t>{['storagePicker.opfs.loadingRoot']}</_t>
        </p>
      )}

      {opfsLoadErrorMessage && (
        <p
          className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          {opfsLoadErrorMessage}
        </p>
      )}
    </div>
  );
};
