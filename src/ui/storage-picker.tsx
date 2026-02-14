import { useEffect, useId, useMemo, useState } from 'react';
import { ThemeBoundary } from './theme-provider';
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

const classes = (...values: Array<string | null | undefined | false>) =>
  values.filter(Boolean).join(' ');

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
    <ThemeBoundary>
      <section
        className={classes(
          `relative isolate mx-auto w-full max-w-4xl overflow-hidden rounded-[2rem] border
          border-[var(--clxdb-color-200)] bg-[var(--clxdb-color-50)]/80 p-6
          shadow-[0_34px_70px_-48px_rgba(24,24,27,0.45)] backdrop-blur-sm sm:p-8`,
          className
        )}
      >
        <div
          className="pointer-events-none absolute -top-24 -left-24 h-56 w-56 rounded-full
            bg-[var(--clxdb-color-300)]/45 blur-3xl"
        />
        <div
          className="pointer-events-none absolute -right-20 -bottom-28 h-56 w-56 rounded-full
            bg-[var(--clxdb-color-accent-300)]/35 blur-3xl"
        />

        <div className="relative">
          <header className="mb-8 space-y-2">
            <p
              className="text-xs font-semibold tracking-[0.2em] text-[var(--clxdb-color-500)]
                uppercase"
            >
              Storage Backend
            </p>
            <h2
              className="text-2xl font-semibold tracking-tight text-[var(--clxdb-color-900)]
                sm:text-3xl"
            >
              Choose a storage backend
            </h2>
            <p className="max-w-2xl text-sm leading-relaxed text-[var(--clxdb-color-600)]">
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
                        ? `border-[var(--clxdb-color-900)] bg-[var(--clxdb-color-900)]
                          text-[var(--clxdb-color-100)] shadow-[var(--clxdb-color-900)]/25
                          shadow-md`
                        : `border-[var(--clxdb-color-200)] bg-[var(--clxdb-color-surface)]/70
                          text-[var(--clxdb-color-700)] hover:border-[var(--clxdb-color-400)]
                          hover:bg-[var(--clxdb-color-surface)]`,
                      isDisabled &&
                        `cursor-not-allowed border-[var(--clxdb-color-200)]
                        bg-[var(--clxdb-color-100)]/80 text-[var(--clxdb-color-400)]`
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
                          active
                            ? 'text-[var(--clxdb-color-100)]'
                            : 'text-[var(--clxdb-color-500)]',
                          isDisabled && 'text-[var(--clxdb-color-400)]'
                        )}
                      />
                      {!option.supported && (
                        <span
                          className="rounded-full border border-[var(--clxdb-color-300)] px-2 py-0.5
                            text-[10px] font-semibold tracking-wide text-[var(--clxdb-color-500)]
                            uppercase"
                        >
                          Unsupported
                        </span>
                      )}
                    </div>

                    <p className="text-sm font-semibold">{option.label}</p>
                    <p
                      className={classes(
                        'mt-1 text-xs leading-relaxed',
                        active ? 'text-[var(--clxdb-color-300)]' : 'text-[var(--clxdb-color-500)]',
                        isDisabled && 'text-[var(--clxdb-color-400)]'
                      )}
                    >
                      {option.description}
                    </p>

                    {!option.supported && (
                      <p
                        className="mt-3 text-[11px] font-medium tracking-wide
                          text-[var(--clxdb-color-400)] uppercase"
                      >
                        {option.unsupportedReason}
                      </p>
                    )}
                  </label>
                );
              })}
            </div>

            {selectedType === 'filesystem-access' && (
              <div
                className="rounded-2xl border border-[var(--clxdb-color-200)]
                  bg-[var(--clxdb-color-surface)]/80 p-4 sm:p-5"
              >
                <div className="flex justify-between gap-2">
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-semibold text-[var(--clxdb-color-800)]">
                      FileSystem Access API
                    </p>
                    <p className="mt-1 text-xs text-[var(--clxdb-color-500)]">
                      Pick a local folder. This app will request explicit permission for read/write
                      access.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={pickDirectory}
                    disabled={controlsLocked || isPickingDirectory}
                    className="inline-flex items-center gap-2 rounded-xl border
                      border-[var(--clxdb-color-300)] bg-[var(--clxdb-color-900)] px-4 py-2.5
                      text-sm font-medium text-[var(--clxdb-color-100)] transition-colors
                      duration-200 hover:bg-[var(--clxdb-color-800)] disabled:cursor-not-allowed
                      disabled:border-[var(--clxdb-color-200)] disabled:bg-[var(--clxdb-color-300)]"
                  >
                    {isPickingDirectory ? 'Opening...' : 'Select Folder'}
                  </button>
                </div>

                <p className="mt-3 text-xs text-[var(--clxdb-color-500)]">
                  {directoryHandle
                    ? `Selected: ${directoryHandle.name}`
                    : 'No folder selected yet.'}
                </p>
              </div>
            )}

            {selectedType === 'opfs' && (
              <div
                className="rounded-2xl border border-[var(--clxdb-color-200)]
                  bg-[var(--clxdb-color-surface)]/80 p-4 sm:p-5"
              >
                <p className="text-sm font-semibold text-[var(--clxdb-color-800)]">
                  Origin Private File System (OPFS)
                </p>
                <p className="mt-2 text-xs text-[var(--clxdb-color-500)]">
                  Data is stored in browser-managed private storage for this origin and profile.
                </p>
              </div>
            )}

            {selectedType === 'webdav' && (
              <div
                className="rounded-2xl border border-[var(--clxdb-color-200)]
                  bg-[var(--clxdb-color-surface)]/80 p-4 sm:p-5"
              >
                <div className="grid gap-4">
                  <label
                    className="text-sm font-semibold text-[var(--clxdb-color-800)]"
                    htmlFor={webDavUrlId}
                  >
                    WebDAV Endpoint
                    <input
                      id={webDavUrlId}
                      type="url"
                      value={webDavUrl}
                      onChange={event => setWebDavUrl(event.target.value)}
                      disabled={controlsLocked}
                      placeholder="https://cloud.example.com/remote.php/dav/files/user"
                      className="mt-2 w-full rounded-xl border border-[var(--clxdb-color-300)]
                        bg-[var(--clxdb-color-50)] px-3 py-2.5 text-sm font-normal
                        text-[var(--clxdb-color-800)] transition-colors duration-200 outline-none
                        placeholder:text-[var(--clxdb-color-400)]
                        focus:border-[var(--clxdb-color-500)] focus:bg-[var(--clxdb-color-surface)]
                        disabled:cursor-not-allowed disabled:border-[var(--clxdb-color-200)]
                        disabled:bg-[var(--clxdb-color-100)]"
                    />
                  </label>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label
                      className="text-sm font-semibold text-[var(--clxdb-color-800)]"
                      htmlFor={webDavUserId}
                    >
                      WebDAV Username
                      <input
                        id={webDavUserId}
                        type="text"
                        value={webDavUser}
                        onChange={event => setWebDavUser(event.target.value)}
                        disabled={controlsLocked}
                        autoComplete="username"
                        placeholder="my-user"
                        className="mt-2 w-full rounded-xl border border-[var(--clxdb-color-300)]
                          bg-[var(--clxdb-color-50)] px-3 py-2.5 text-sm font-normal
                          text-[var(--clxdb-color-800)] transition-colors duration-200 outline-none
                          placeholder:text-[var(--clxdb-color-400)]
                          focus:border-[var(--clxdb-color-500)]
                          focus:bg-[var(--clxdb-color-surface)] disabled:cursor-not-allowed
                          disabled:border-[var(--clxdb-color-200)]
                          disabled:bg-[var(--clxdb-color-100)]"
                      />
                    </label>

                    <label
                      className="text-sm font-semibold text-[var(--clxdb-color-800)]"
                      htmlFor={webDavPassId}
                    >
                      Password
                      <input
                        id={webDavPassId}
                        type="password"
                        value={webDavPass}
                        onChange={event => setWebDavPass(event.target.value)}
                        disabled={controlsLocked}
                        autoComplete="current-password"
                        placeholder="••••••••"
                        className="mt-2 w-full rounded-xl border border-[var(--clxdb-color-300)]
                          bg-[var(--clxdb-color-50)] px-3 py-2.5 text-sm font-normal
                          text-[var(--clxdb-color-800)] transition-colors duration-200 outline-none
                          placeholder:text-[var(--clxdb-color-400)]
                          focus:border-[var(--clxdb-color-500)]
                          focus:bg-[var(--clxdb-color-surface)] disabled:cursor-not-allowed
                          disabled:border-[var(--clxdb-color-200)]
                          disabled:bg-[var(--clxdb-color-100)]"
                      />
                    </label>
                  </div>
                </div>
              </div>
            )}

            {errorMessage && (
              <p
                className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm
                  text-red-700"
              >
                {errorMessage}
              </p>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={controlsLocked}
                  className="inline-flex items-center justify-center rounded-xl border
                    border-[var(--clxdb-color-300)] bg-[var(--clxdb-color-surface)] px-4 py-2.5
                    text-sm font-medium text-[var(--clxdb-color-700)] transition-colors duration-200
                    hover:border-[var(--clxdb-color-400)] hover:bg-[var(--clxdb-color-100)]
                    disabled:cursor-not-allowed disabled:border-[var(--clxdb-color-200)]
                    disabled:bg-[var(--clxdb-color-100)] disabled:text-[var(--clxdb-color-400)]"
                >
                  Cancel
                </button>
              )}

              <button
                type="submit"
                disabled={controlsLocked}
                className="inline-flex items-center justify-center rounded-xl
                  bg-[var(--clxdb-color-900)] px-5 py-2.5 text-sm font-semibold
                  text-[var(--clxdb-color-100)] transition-colors duration-200
                  hover:bg-[var(--clxdb-color-800)] disabled:cursor-not-allowed
                  disabled:bg-[var(--clxdb-color-300)]"
              >
                {isSubmitting ? 'Applying...' : submitLabel}
              </button>
            </div>
          </form>
        </div>
      </section>
    </ThemeBoundary>
  );
}
