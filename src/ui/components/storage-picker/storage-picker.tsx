import { useEffect, useId, useMemo, useState } from 'react';
import { createStorageBackend } from '@/storages';
import { useDebouncedValue } from '@/ui/hooks/use-debounced-value';
import { classes } from '@/utils/classes';
import { DirectoryPicker } from './directory-picker';
import { FileSystemIcon, OPFSIcon, S3Icon, WebDAVIcon } from './icons';
import {
  getNavigatorStorageWithDirectory,
  joinDirectoryPaths,
  normalizeS3Bucket,
  normalizeS3Endpoint,
  normalizeS3Prefix,
  normalizeWebDavUrl,
  resolveDirectoryHandle,
  supportsFileSystemAccess,
  supportsOpfs,
  toWebDavDirectoryUrl,
} from './utils';
import type { StorageConfig } from '@/storages';
import type { StorageBackend } from '@/types';

type S3Provider = 's3' | 'r2' | 'minio';

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
  const [filesystemRootHandle, setFilesystemRootHandle] =
    useState<FileSystemDirectoryHandle | null>(null);
  const [filesystemDirectoryPath, setFilesystemDirectoryPath] = useState('');
  const [webDavUrl, setWebDavUrl] = useState('');
  const [webDavUser, setWebDavUser] = useState('');
  const [webDavPass, setWebDavPass] = useState('');
  const [webDavDirectoryPath, setWebDavDirectoryPath] = useState('');
  const [s3Provider, setS3Provider] = useState<S3Provider>('s3');
  const [s3Endpoint, setS3Endpoint] = useState('');
  const [s3Region, setS3Region] = useState('us-east-1');
  const [s3Bucket, setS3Bucket] = useState('');
  const [s3Prefix, setS3Prefix] = useState('');
  const [s3AccessKeyId, setS3AccessKeyId] = useState('');
  const [s3SecretAccessKey, setS3SecretAccessKey] = useState('');
  const [s3SessionToken, setS3SessionToken] = useState('');
  const [s3DirectoryPath, setS3DirectoryPath] = useState('');
  const [opfsRootHandle, setOpfsRootHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [opfsDirectoryPath, setOpfsDirectoryPath] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPickingDirectory, setIsPickingDirectory] = useState(false);
  const [isLoadingOpfsRoot, setIsLoadingOpfsRoot] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const pickerId = useId();

  const storageGroupName = `${pickerId}-storage`;
  const webDavUrlId = `${pickerId}-webdav-url`;
  const webDavUserId = `${pickerId}-webdav-user`;
  const webDavPassId = `${pickerId}-webdav-pass`;
  const s3ProviderId = `${pickerId}-s3-provider`;
  const s3EndpointId = `${pickerId}-s3-endpoint`;
  const s3RegionId = `${pickerId}-s3-region`;
  const s3BucketId = `${pickerId}-s3-bucket`;
  const s3PrefixId = `${pickerId}-s3-prefix`;
  const s3AccessKeyIdId = `${pickerId}-s3-access-key`;
  const s3SecretAccessKeyId = `${pickerId}-s3-secret-key`;
  const s3SessionTokenId = `${pickerId}-s3-session-token`;

  const filesystemSupported = supportsFileSystemAccess();
  const opfsSupported = supportsOpfs();
  const s3EndpointPlaceholder =
    s3Provider === 'r2'
      ? 'https://<account-id>.r2.cloudflarestorage.com'
      : s3Provider === 'minio'
        ? 'https://minio.example.com'
        : 'https://s3.ap-northeast-2.amazonaws.com';

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
      setSelectedType(availableTypes[0]);
      setErrorMessage(null);
    }
  }, [availableTypes, selectedType]);

  useEffect(() => {
    if (selectedType !== 'opfs' || !opfsSupported || opfsRootHandle || isLoadingOpfsRoot) {
      return;
    }

    const opfsStorage = getNavigatorStorageWithDirectory();
    if (!opfsStorage) {
      return;
    }

    let cancelled = false;
    setIsLoadingOpfsRoot(true);
    setErrorMessage(null);

    void opfsStorage
      .getDirectory()
      .then(handle => {
        if (!cancelled) {
          setOpfsRootHandle(handle);
        }
      })
      .catch(error => {
        if (!cancelled) {
          const fallback = 'Could not access Origin Private File System.';
          setErrorMessage(error instanceof Error ? error.message : fallback);
        }
      })
      .finally(() => {
        setIsLoadingOpfsRoot(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isLoadingOpfsRoot, opfsRootHandle, opfsSupported, selectedType]);

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

  const rootStorageBackendUndebounced = useMemo<StorageBackend | null>(() => {
    if (selectedType === 'filesystem-access' && filesystemRootHandle) {
      return createStorageBackend({
        kind: 'filesystem',
        provider: 'filesystem-access',
        handle: filesystemRootHandle,
      });
    }

    if (selectedType === 'opfs' && opfsRootHandle) {
      return createStorageBackend({
        kind: 'filesystem',
        provider: 'opfs',
        handle: opfsRootHandle,
      });
    }

    if (selectedType === 'webdav') {
      if (!webDavUrl.trim() || !webDavUser.trim() || !webDavPass) {
        return null;
      }

      try {
        return createStorageBackend({
          kind: 'webdav',
          url: normalizeWebDavUrl(webDavUrl),
          auth: {
            user: webDavUser.trim(),
            pass: webDavPass,
          },
        });
      } catch {
        return null;
      }
    }

    if (selectedType === 's3') {
      if (!s3Endpoint.trim() || !s3Bucket.trim() || !s3AccessKeyId.trim() || !s3SecretAccessKey) {
        return null;
      }

      try {
        const region = s3Region.trim() || (s3Provider === 'r2' ? 'auto' : 'us-east-1');
        return createStorageBackend({
          kind: 's3',
          provider: s3Provider,
          endpoint: normalizeS3Endpoint(s3Endpoint),
          region,
          bucket: normalizeS3Bucket(s3Bucket),
          prefix: normalizeS3Prefix(s3Prefix),
          forcePathStyle: s3Provider !== 's3',
          credentials: {
            accessKeyId: s3AccessKeyId.trim(),
            secretAccessKey: s3SecretAccessKey,
            ...(s3SessionToken.trim() ? { sessionToken: s3SessionToken.trim() } : {}),
          },
        });
      } catch {
        return null;
      }
    }

    return null;
  }, [
    selectedType,
    webDavUrl,
    webDavUser,
    webDavPass,
    s3Provider,
    s3Endpoint,
    s3Region,
    s3Bucket,
    s3Prefix,
    s3AccessKeyId,
    s3SecretAccessKey,
    s3SessionToken,
    filesystemRootHandle,
    opfsRootHandle,
  ]);

  const rootStorageBackend = useDebouncedValue(rootStorageBackendUndebounced, 500, selectedType);
  const [directoryPath, setDirectoryPath] = (() => {
    if (selectedType === 'filesystem-access') {
      return [filesystemDirectoryPath, setFilesystemDirectoryPath];
    }

    if (selectedType === 'opfs') {
      return [opfsDirectoryPath, setOpfsDirectoryPath];
    }

    if (selectedType === 'webdav') {
      return [webDavDirectoryPath, setWebDavDirectoryPath];
    }

    if (selectedType === 's3') {
      return [s3DirectoryPath, setS3DirectoryPath];
    }

    return ['', () => {}];
  })();

  const pickDirectory = async () => {
    if (!filesystemSupported || !window.showDirectoryPicker) {
      setErrorMessage('FileSystem Access API is not available in this browser.');
      return;
    }

    setErrorMessage(null);
    setIsPickingDirectory(true);

    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      setFilesystemRootHandle(handle);
      setFilesystemDirectoryPath('');
    } catch (error) {
      if (!(error instanceof Error) || error.name !== 'AbortError') {
        const fallback = 'Could not open FileSystem Access folder picker.';
        setErrorMessage(error instanceof Error ? error.message : fallback);
      }
    } finally {
      setIsPickingDirectory(false);
    }
  };

  const selectStorageType = (nextType: StoragePickerBackendType) => {
    setSelectedType(nextType);
    setErrorMessage(null);
  };

  const selectS3Provider = (provider: S3Provider) => {
    setS3Provider(provider);
    if (provider === 'r2') {
      if (!s3Region.trim() || s3Region.trim() === 'us-east-1') {
        setS3Region('auto');
      }

      return;
    }

    if (s3Region.trim() === 'auto') {
      setS3Region('us-east-1');
    }
  };

  const validateSelection = () => {
    if (selectedType === 'filesystem-access' && !filesystemRootHandle) {
      return 'Select a root folder to continue.';
    }

    if (selectedType === 'opfs') {
      if (!opfsSupported) {
        return 'Origin Private File System is not supported in this browser.';
      }

      if (!opfsRootHandle) {
        return 'OPFS is still loading. Please wait a moment and try again.';
      }
    }

    if (selectedType === 'webdav') {
      if (!webDavUrl.trim()) {
        return 'Enter a WebDAV endpoint URL.';
      }

      try {
        const parsed = new URL(webDavUrl.trim());
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          return 'WebDAV endpoint must start with http:// or https://.';
        }
      } catch {
        return 'Enter a valid WebDAV endpoint URL.';
      }

      if (!webDavUser.trim()) {
        return 'Enter a WebDAV username.';
      }

      if (!webDavPass) {
        return 'Enter your password.';
      }
    }

    if (selectedType === 's3') {
      if (!s3Endpoint.trim()) {
        return 'Enter an S3 endpoint URL.';
      }

      try {
        const parsed = new URL(s3Endpoint.trim());
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          return 'S3 endpoint must start with http:// or https://.';
        }
      } catch {
        return 'Enter a valid S3 endpoint URL.';
      }

      if (!s3Bucket.trim()) {
        return 'Enter an S3 bucket name.';
      }

      if (s3Bucket.trim().includes('/')) {
        return 'Bucket name cannot include slashes.';
      }

      if (!s3Region.trim()) {
        return 'Enter a region (use auto for Cloudflare R2).';
      }

      if (!s3AccessKeyId.trim()) {
        return 'Enter an access key ID.';
      }

      if (!s3SecretAccessKey) {
        return 'Enter a secret access key.';
      }
    }

    return null;
  };

  const handleSubmit = async () => {
    if (controlsLocked) {
      return;
    }

    const validationError = validateSelection();
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      let selection: StorageConfig | null = null;

      if (selectedType === 'filesystem-access' && filesystemRootHandle) {
        const handle = await resolveDirectoryHandle(filesystemRootHandle, filesystemDirectoryPath);
        selection = { kind: 'filesystem', provider: 'filesystem-access', handle };
      }

      if (selectedType === 'opfs' && opfsRootHandle) {
        const handle = await resolveDirectoryHandle(opfsRootHandle, opfsDirectoryPath);
        selection = { kind: 'filesystem', provider: 'opfs', handle };
      }

      if (selectedType === 'webdav') {
        const baseUrl = normalizeWebDavUrl(webDavUrl);
        selection = {
          kind: 'webdav',
          url: toWebDavDirectoryUrl(baseUrl, webDavDirectoryPath),
          auth: {
            user: webDavUser.trim(),
            pass: webDavPass,
          },
        };
      }

      if (selectedType === 's3') {
        const region = s3Region.trim() || (s3Provider === 'r2' ? 'auto' : 'us-east-1');
        selection = {
          kind: 's3',
          provider: s3Provider,
          endpoint: normalizeS3Endpoint(s3Endpoint),
          region,
          bucket: normalizeS3Bucket(s3Bucket),
          prefix: joinDirectoryPaths(normalizeS3Prefix(s3Prefix), s3DirectoryPath),
          forcePathStyle: s3Provider !== 's3',
          credentials: {
            accessKeyId: s3AccessKeyId.trim(),
            secretAccessKey: s3SecretAccessKey,
            ...(s3SessionToken.trim() ? { sessionToken: s3SessionToken.trim() } : {}),
          },
        };
      }

      if (!selection) {
        throw new Error('Please check the details and try again.');
      }

      await onSelect(selection);
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
            <div className="rounded-2xl border border-default-200 bg-surface/80 p-4 sm:p-5">
              <div className="flex justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-semibold text-default-800">FileSystem Access API</p>
                  <p className="mt-1 text-xs text-default-500">
                    Pick a local folder. This app will request explicit permission for read/write
                    access.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={pickDirectory}
                  disabled={controlsLocked || isPickingDirectory}
                  className="inline-flex items-center gap-2 rounded-xl border border-default-300
                    bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground
                    transition-colors duration-200 hover:bg-primary-hover
                    disabled:cursor-not-allowed disabled:border-default-200 disabled:bg-default-300"
                >
                  {isPickingDirectory ? 'Opening...' : 'Select Folder'}
                </button>
              </div>

              <p className="mt-3 text-xs text-default-500">
                {filesystemRootHandle
                  ? `Selected: ${filesystemRootHandle.name}`
                  : 'No folder selected yet.'}
              </p>
            </div>
          )}

          {selectedType === 'opfs' && (
            <div className="rounded-2xl border border-default-200 bg-surface/80 p-4 sm:p-5">
              <p className="text-sm font-semibold text-default-800">
                Origin Private File System (OPFS)
              </p>
              <p className="mt-2 text-xs text-default-500">
                Data is stored in browser-managed private storage for this origin and profile.
              </p>
            </div>
          )}

          {selectedType === 's3' && (
            <div className="rounded-2xl border border-default-200 bg-surface/80 p-4 sm:p-5">
              <div className="grid gap-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="text-sm font-semibold text-default-800" htmlFor={s3ProviderId}>
                    Provider
                    <select
                      id={s3ProviderId}
                      value={s3Provider}
                      onChange={event => selectS3Provider(event.target.value as S3Provider)}
                      disabled={controlsLocked}
                      className="mt-2 w-full rounded-xl border border-default-300 bg-default-50 px-3
                        py-2.5 text-sm font-normal text-default-800 transition-colors duration-200
                        outline-none focus:border-default-500 focus:bg-surface
                        disabled:cursor-not-allowed disabled:border-default-200
                        disabled:bg-default-100"
                    >
                      <option value="s3">Amazon S3</option>
                      <option value="r2">Cloudflare R2</option>
                      <option value="minio">MinIO</option>
                    </select>
                  </label>

                  <label className="text-sm font-semibold text-default-800" htmlFor={s3RegionId}>
                    Region
                    <input
                      id={s3RegionId}
                      type="text"
                      value={s3Region}
                      onChange={event => setS3Region(event.target.value)}
                      disabled={controlsLocked}
                      placeholder={s3Provider === 'r2' ? 'auto' : 'us-east-1'}
                      className="mt-2 w-full rounded-xl border border-default-300 bg-default-50 px-3
                        py-2.5 text-sm font-normal text-default-800 transition-colors duration-200
                        outline-none placeholder:text-default-400 focus:border-default-500
                        focus:bg-surface disabled:cursor-not-allowed disabled:border-default-200
                        disabled:bg-default-100"
                    />
                  </label>

                  <label className="text-sm font-semibold text-default-800" htmlFor={s3BucketId}>
                    Bucket
                    <input
                      id={s3BucketId}
                      type="text"
                      value={s3Bucket}
                      onChange={event => setS3Bucket(event.target.value)}
                      disabled={controlsLocked}
                      placeholder="my-bucket"
                      className="mt-2 w-full rounded-xl border border-default-300 bg-default-50 px-3
                        py-2.5 text-sm font-normal text-default-800 transition-colors duration-200
                        outline-none placeholder:text-default-400 focus:border-default-500
                        focus:bg-surface disabled:cursor-not-allowed disabled:border-default-200
                        disabled:bg-default-100"
                    />
                  </label>
                </div>

                <label className="text-sm font-semibold text-default-800" htmlFor={s3EndpointId}>
                  S3 Endpoint
                  <input
                    id={s3EndpointId}
                    type="url"
                    value={s3Endpoint}
                    onChange={event => setS3Endpoint(event.target.value)}
                    disabled={controlsLocked}
                    placeholder={s3EndpointPlaceholder}
                    className="mt-2 w-full rounded-xl border border-default-300 bg-default-50 px-3
                      py-2.5 text-sm font-normal text-default-800 transition-colors duration-200
                      outline-none placeholder:text-default-400 focus:border-default-500
                      focus:bg-surface disabled:cursor-not-allowed disabled:border-default-200
                      disabled:bg-default-100"
                  />
                </label>

                <label className="text-sm font-semibold text-default-800" htmlFor={s3PrefixId}>
                  Root Prefix (optional)
                  <input
                    id={s3PrefixId}
                    type="text"
                    value={s3Prefix}
                    onChange={event => setS3Prefix(event.target.value)}
                    disabled={controlsLocked}
                    placeholder="apps/clxdb"
                    className="mt-2 w-full rounded-xl border border-default-300 bg-default-50 px-3
                      py-2.5 text-sm font-normal text-default-800 transition-colors duration-200
                      outline-none placeholder:text-default-400 focus:border-default-500
                      focus:bg-surface disabled:cursor-not-allowed disabled:border-default-200
                      disabled:bg-default-100"
                  />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label
                    className="text-sm font-semibold text-default-800"
                    htmlFor={s3AccessKeyIdId}
                  >
                    Access Key ID
                    <input
                      id={s3AccessKeyIdId}
                      type="text"
                      value={s3AccessKeyId}
                      onChange={event => setS3AccessKeyId(event.target.value)}
                      disabled={controlsLocked}
                      autoComplete="username"
                      placeholder="AKIA..."
                      className="mt-2 w-full rounded-xl border border-default-300 bg-default-50 px-3
                        py-2.5 text-sm font-normal text-default-800 transition-colors duration-200
                        outline-none placeholder:text-default-400 focus:border-default-500
                        focus:bg-surface disabled:cursor-not-allowed disabled:border-default-200
                        disabled:bg-default-100"
                    />
                  </label>

                  <label
                    className="text-sm font-semibold text-default-800"
                    htmlFor={s3SecretAccessKeyId}
                  >
                    Secret Access Key
                    <input
                      id={s3SecretAccessKeyId}
                      type="password"
                      value={s3SecretAccessKey}
                      onChange={event => setS3SecretAccessKey(event.target.value)}
                      disabled={controlsLocked}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      className="mt-2 w-full rounded-xl border border-default-300 bg-default-50 px-3
                        py-2.5 text-sm font-normal text-default-800 transition-colors duration-200
                        outline-none placeholder:text-default-400 focus:border-default-500
                        focus:bg-surface disabled:cursor-not-allowed disabled:border-default-200
                        disabled:bg-default-100"
                    />
                  </label>
                </div>

                <label
                  className="text-sm font-semibold text-default-800"
                  htmlFor={s3SessionTokenId}
                >
                  Session Token (optional)
                  <input
                    id={s3SessionTokenId}
                    type="password"
                    value={s3SessionToken}
                    onChange={event => setS3SessionToken(event.target.value)}
                    disabled={controlsLocked}
                    placeholder="Temporary credentials only"
                    className="mt-2 w-full rounded-xl border border-default-300 bg-default-50 px-3
                      py-2.5 text-sm font-normal text-default-800 transition-colors duration-200
                      outline-none placeholder:text-default-400 focus:border-default-500
                      focus:bg-surface disabled:cursor-not-allowed disabled:border-default-200
                      disabled:bg-default-100"
                  />
                </label>
              </div>
            </div>
          )}

          {selectedType === 'webdav' && (
            <div className="rounded-2xl border border-default-200 bg-surface/80 p-4 sm:p-5">
              <div className="grid gap-4">
                <label className="text-sm font-semibold text-default-800" htmlFor={webDavUrlId}>
                  WebDAV Endpoint
                  <input
                    id={webDavUrlId}
                    type="url"
                    value={webDavUrl}
                    onChange={event => setWebDavUrl(event.target.value)}
                    disabled={controlsLocked}
                    placeholder="https://cloud.example.com/remote.php/dav/files/user"
                    className="mt-2 w-full rounded-xl border border-default-300 bg-default-50 px-3
                      py-2.5 text-sm font-normal text-default-800 transition-colors duration-200
                      outline-none placeholder:text-default-400 focus:border-default-500
                      focus:bg-surface disabled:cursor-not-allowed disabled:border-default-200
                      disabled:bg-default-100"
                  />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-semibold text-default-800" htmlFor={webDavUserId}>
                    WebDAV Username
                    <input
                      id={webDavUserId}
                      type="text"
                      value={webDavUser}
                      onChange={event => setWebDavUser(event.target.value)}
                      disabled={controlsLocked}
                      autoComplete="username"
                      placeholder="my-user"
                      className="mt-2 w-full rounded-xl border border-default-300 bg-default-50 px-3
                        py-2.5 text-sm font-normal text-default-800 transition-colors duration-200
                        outline-none placeholder:text-default-400 focus:border-default-500
                        focus:bg-surface disabled:cursor-not-allowed disabled:border-default-200
                        disabled:bg-default-100"
                    />
                  </label>

                  <label className="text-sm font-semibold text-default-800" htmlFor={webDavPassId}>
                    Password
                    <input
                      id={webDavPassId}
                      type="password"
                      value={webDavPass}
                      onChange={event => setWebDavPass(event.target.value)}
                      disabled={controlsLocked}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      className="mt-2 w-full rounded-xl border border-default-300 bg-default-50 px-3
                        py-2.5 text-sm font-normal text-default-800 transition-colors duration-200
                        outline-none placeholder:text-default-400 focus:border-default-500
                        focus:bg-surface disabled:cursor-not-allowed disabled:border-default-200
                        disabled:bg-default-100"
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          {rootStorageBackend ? (
            <DirectoryPicker
              storage={rootStorageBackend}
              value={directoryPath}
              onChange={setDirectoryPath}
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
