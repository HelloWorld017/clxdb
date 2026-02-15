import { useEffect, useId, useMemo, useState } from 'react';
import { classes } from '@/utils/classes';
import type { SubmitEvent } from 'react';

export type StoragePickerBackendType = 'filesystem-access' | 'opfs' | 'webdav';

export interface FileSystemAccessStorageSelection {
  type: 'filesystem-access';
  handle: FileSystemDirectoryHandle;
}

export interface OpfsStorageSelection {
  type: 'opfs';
  handle: FileSystemDirectoryHandle;
}

export interface WebDAVStorageSelection {
  type: 'webdav';
  url: string;
  auth: {
    user: string;
    pass: string;
  };
}

export type StoragePickerSelection =
  | FileSystemAccessStorageSelection
  | OpfsStorageSelection
  | WebDAVStorageSelection;

export interface StoragePickerProps {
  onSelect: (selection: StoragePickerSelection) => Promise<void> | void;
  onCancel?: () => void;
  className?: string;
  disabled?: boolean;
  initialType?: StoragePickerBackendType;
  submitLabel?: string;
}

type IconProps = {
  className?: string;
};

const normalizeWebDavUrl = (value: string) => {
  const parsed = new URL(value.trim());
  return parsed.toString().replace(/\/$/, '');
};

const supportsFileSystemAccess = () =>
  typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';

type NavigatorStorageWithDirectory = StorageManager & {
  getDirectory: () => Promise<FileSystemDirectoryHandle>;
};

const getNavigatorStorageWithDirectory = (): NavigatorStorageWithDirectory | null => {
  if (typeof navigator === 'undefined') {
    return null;
  }

  const candidate = navigator.storage as NavigatorStorageWithDirectory;
  if (typeof candidate?.getDirectory !== 'function') {
    return null;
  }

  return candidate;
};

const supportsOpfs = () => !!getNavigatorStorageWithDirectory();

const FolderIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
    <title>FileSystem Access API</title>
    <path
      d="M3.5 7.75a2.25 2.25 0 0 1 2.25-2.25h4.25l1.8 1.8h6.45a2.25 2.25 0 0 1 2.25 2.25v8.7a2.25 2.25 0 0 1-2.25 2.25H5.75a2.25 2.25 0 0 1-2.25-2.25v-10.5Z"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const DatabaseIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
    <title>OPFS</title>
    <ellipse cx="12" cy="6" rx="7.5" ry="2.75" strokeWidth={1.5} />
    <path
      d="M4.5 6v5.75c0 1.52 3.36 2.75 7.5 2.75s7.5-1.23 7.5-2.75V6M4.5 11.75v5.75c0 1.52 3.36 2.75 7.5 2.75s7.5-1.23 7.5-2.75v-5.75"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const LinkIcon = ({ className }: IconProps) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden
  >
    <title>WebDAV</title>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

export function StoragePicker({
  onSelect,
  onCancel,
  className,
  disabled = false,
  initialType = 'filesystem-access',
  submitLabel = 'Save storage settings',
}: StoragePickerProps) {
  const [selectedType, setSelectedType] = useState<StoragePickerBackendType>(initialType);
  const [directoryHandle, setDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [webDavUrl, setWebDavUrl] = useState('');
  const [webDavUser, setWebDavUser] = useState('');
  const [webDavPass, setWebDavPass] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPickingDirectory, setIsPickingDirectory] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const pickerId = useId();

  const storageGroupName = `${pickerId}-storage`;
  const webDavUrlId = `${pickerId}-webdav-url`;
  const webDavUserId = `${pickerId}-webdav-user`;
  const webDavPassId = `${pickerId}-webdav-pass`;

  const filesystemSupported = supportsFileSystemAccess();
  const opfsSupported = supportsOpfs();

  const availableTypes = useMemo(() => {
    const types: StoragePickerBackendType[] = ['webdav'];

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

  const controlsLocked = disabled || isSubmitting;

  const storageOptions = [
    {
      type: 'filesystem-access' as const,
      label: 'FileSystem Access API',
      description: 'Save to a local folder with explicit read/write permission.',
      icon: FolderIcon,
      supported: filesystemSupported,
      unsupportedReason: 'FileSystem Access API is not supported in this browser.',
    },
    {
      type: 'opfs' as const,
      label: 'Origin Private File System',
      description: 'Use browser-managed private storage for this origin and profile.',
      icon: DatabaseIcon,
      supported: opfsSupported,
      unsupportedReason: 'Origin Private File System is not supported in this browser.',
    },
    {
      type: 'webdav' as const,
      label: 'WebDAV',
      description: 'Connect a WebDAV endpoint to sync data across devices.',
      icon: LinkIcon,
      supported: true,
      unsupportedReason: '',
    },
  ];

  const pickDirectory = async () => {
    if (!filesystemSupported || !window.showDirectoryPicker) {
      setErrorMessage('FileSystem Access API is not available in this browser.');
      return;
    }

    setErrorMessage(null);
    setIsPickingDirectory(true);

    try {
      const handle = await window.showDirectoryPicker();
      setDirectoryHandle(handle);
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

  const validateSelection = () => {
    if (selectedType === 'filesystem-access' && !directoryHandle) {
      return 'Select a folder to continue.';
    }

    if (selectedType === 'opfs' && !opfsSupported) {
      return 'Origin Private File System is not supported in this browser.';
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

    return null;
  };

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

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
      let selection: StoragePickerSelection | null = null;

      if (selectedType === 'filesystem-access' && directoryHandle) {
        selection = { type: 'filesystem-access', handle: directoryHandle };
      }

      if (selectedType === 'opfs') {
        const opfsStorage = getNavigatorStorageWithDirectory();
        if (!opfsStorage) {
          throw new Error('Origin Private File System is not supported in this browser.');
        }

        const handle = await opfsStorage.getDirectory();
        selection = { type: 'opfs', handle };
      }

      if (selectedType === 'webdav') {
        selection = {
          type: 'webdav',
          url: normalizeWebDavUrl(webDavUrl),
          auth: {
            user: webDavUser.trim(),
            pass: webDavPass,
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
        `border-default-200 bg-default-50/85 shadow-ui-soft relative isolate mx-auto w-full
        max-w-4xl overflow-hidden rounded-[2rem] border p-6 backdrop-blur-sm sm:p-8`,
        className
      )}
    >
      <div
        className="bg-default-300/45 pointer-events-none absolute -top-24 -left-24 h-56 w-56
          rounded-full blur-3xl"
      />
      <div
        className="bg-default-300/35 pointer-events-none absolute -right-20 -bottom-28 h-56 w-56
          rounded-full blur-3xl"
      />

      <div className="relative">
        <header className="mb-8 space-y-2">
          <p className="text-default-500 text-xs font-semibold tracking-[0.2em] uppercase">
            Storage Backend
          </p>
          <h2 className="text-default-900 text-2xl font-semibold tracking-tight sm:text-3xl">
            Choose a storage backend
          </h2>
          <p className="text-default-600 max-w-2xl text-sm leading-relaxed">
            Select FileSystem Access API, Origin Private File System, or WebDAV.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
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
                      ? `border-primary bg-primary text-primary-foreground shadow-primary/25
                        shadow-md`
                      : `border-default-200 text-default-700 hover:border-default-400 bg-surface/70
                        hover:bg-surface/90 cursor-pointer`,
                    isDisabled &&
                      'border-default-200 bg-default-100/80 text-default-400 cursor-not-allowed'
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
                        className="border-default-300 text-default-500 rounded-full border px-2
                          py-0.5 text-[10px] font-semibold tracking-wide uppercase"
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
                      className="text-default-400 mt-3 text-[11px] font-medium tracking-wide
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
            <div className="border-default-200 bg-surface/80 rounded-2xl border p-4 sm:p-5">
              <div className="flex justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <p className="text-default-800 text-sm font-semibold">FileSystem Access API</p>
                  <p className="text-default-500 mt-1 text-xs">
                    Pick a local folder. This app will request explicit permission for read/write
                    access.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={pickDirectory}
                  disabled={controlsLocked || isPickingDirectory}
                  className="border-default-300 bg-primary text-primary-foreground
                    hover:bg-primary-hover disabled:border-default-200 disabled:bg-default-300
                    inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium
                    transition-colors duration-200 disabled:cursor-not-allowed"
                >
                  {isPickingDirectory ? 'Opening...' : 'Select Folder'}
                </button>
              </div>

              <p className="text-default-500 mt-3 text-xs">
                {directoryHandle ? `Selected: ${directoryHandle.name}` : 'No folder selected yet.'}
              </p>
            </div>
          )}

          {selectedType === 'opfs' && (
            <div className="border-default-200 bg-surface/80 rounded-2xl border p-4 sm:p-5">
              <p className="text-default-800 text-sm font-semibold">
                Origin Private File System (OPFS)
              </p>
              <p className="text-default-500 mt-2 text-xs">
                Data is stored in browser-managed private storage for this origin and profile.
              </p>
            </div>
          )}

          {selectedType === 'webdav' && (
            <div className="border-default-200 bg-surface/80 rounded-2xl border p-4 sm:p-5">
              <div className="grid gap-4">
                <label className="text-default-800 text-sm font-semibold" htmlFor={webDavUrlId}>
                  WebDAV Endpoint
                  <input
                    id={webDavUrlId}
                    type="url"
                    value={webDavUrl}
                    onChange={event => setWebDavUrl(event.target.value)}
                    disabled={controlsLocked}
                    placeholder="https://cloud.example.com/remote.php/dav/files/user"
                    className="border-default-300 bg-default-50 text-default-800
                      placeholder:text-default-400 focus:border-default-500
                      disabled:border-default-200 disabled:bg-default-100 focus:bg-surface mt-2
                      w-full rounded-xl border px-3 py-2.5 text-sm font-normal transition-colors
                      duration-200 outline-none disabled:cursor-not-allowed"
                  />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-default-800 text-sm font-semibold" htmlFor={webDavUserId}>
                    WebDAV Username
                    <input
                      id={webDavUserId}
                      type="text"
                      value={webDavUser}
                      onChange={event => setWebDavUser(event.target.value)}
                      disabled={controlsLocked}
                      autoComplete="username"
                      placeholder="my-user"
                      className="border-default-300 bg-default-50 text-default-800
                        placeholder:text-default-400 focus:border-default-500
                        disabled:border-default-200 disabled:bg-default-100 focus:bg-surface mt-2
                        w-full rounded-xl border px-3 py-2.5 text-sm font-normal transition-colors
                        duration-200 outline-none disabled:cursor-not-allowed"
                    />
                  </label>

                  <label className="text-default-800 text-sm font-semibold" htmlFor={webDavPassId}>
                    Password
                    <input
                      id={webDavPassId}
                      type="password"
                      value={webDavPass}
                      onChange={event => setWebDavPass(event.target.value)}
                      disabled={controlsLocked}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      className="border-default-300 bg-default-50 text-default-800
                        placeholder:text-default-400 focus:border-default-500
                        disabled:border-default-200 disabled:bg-default-100 focus:bg-surface mt-2
                        w-full rounded-xl border px-3 py-2.5 text-sm font-normal transition-colors
                        duration-200 outline-none disabled:cursor-not-allowed"
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          {errorMessage && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {errorMessage}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={controlsLocked}
                className="border-default-300 text-default-700 hover:border-default-400
                  hover:bg-default-100 disabled:border-default-200 disabled:bg-default-100
                  disabled:text-default-400 bg-surface inline-flex items-center justify-center
                  rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors duration-200
                  disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            )}

            <button
              type="submit"
              disabled={controlsLocked}
              className="bg-primary text-primary-foreground hover:bg-primary-hover
                disabled:bg-default-300 inline-flex items-center justify-center rounded-xl px-5
                py-2.5 text-sm font-semibold transition-colors duration-200
                disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Applying...' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
