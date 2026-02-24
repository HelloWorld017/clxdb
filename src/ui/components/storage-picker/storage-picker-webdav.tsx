import { useEffect, useId, useState } from 'react';
import { normalizeDirectoryPath, normalizeWebDavUrl, toWebDavDirectoryUrl } from './utils';
import type { OnStoragePickerConfigChange } from './types';

export interface StoragePickerWebdavProps {
  controlsLocked: boolean;
  directoryPath: string;
  onConfigChange: OnStoragePickerConfigChange;
}

export const StoragePickerWebdav = ({
  controlsLocked,
  directoryPath,
  onConfigChange,
}: StoragePickerWebdavProps) => {
  const [url, setUrl] = useState('');
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const sectionId = useId();
  const webDavUrlId = `${sectionId}-url`;
  const webDavUserId = `${sectionId}-user`;
  const webDavPassId = `${sectionId}-pass`;

  useEffect(() => {
    const debounceKey = `webdav:${normalizeDirectoryPath(directoryPath)}`;

    if (!url.trim()) {
      onConfigChange({
        config: null,
        isValid: false,
        validationMessage: 'Enter a WebDAV endpoint URL.',
        debounceKey,
      });
      return;
    }

    try {
      const parsed = new URL(url.trim());
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        onConfigChange({
          config: null,
          isValid: false,
          validationMessage: 'WebDAV endpoint must start with http:// or https://.',
          debounceKey,
        });
        return;
      }
    } catch {
      onConfigChange({
        config: null,
        isValid: false,
        validationMessage: 'Enter a valid WebDAV endpoint URL.',
        debounceKey,
      });
      return;
    }

    if (!user.trim()) {
      onConfigChange({
        config: null,
        isValid: false,
        validationMessage: 'Enter a WebDAV username.',
        debounceKey,
      });
      return;
    }

    if (!pass) {
      onConfigChange({
        config: null,
        isValid: false,
        validationMessage: 'Enter your password.',
        debounceKey,
      });
      return;
    }

    try {
      const baseUrl = normalizeWebDavUrl(url);
      onConfigChange({
        config: {
          kind: 'webdav',
          url: toWebDavDirectoryUrl(baseUrl, directoryPath),
          auth: {
            user: user.trim(),
            pass,
          },
        },
        isValid: true,
        validationMessage: null,
        debounceKey,
      });
    } catch {
      onConfigChange({
        config: null,
        isValid: false,
        validationMessage: 'Enter valid WebDAV settings.',
        debounceKey,
      });
    }
  }, [directoryPath, onConfigChange, pass, url, user]);

  return (
    <div className="rounded-2xl border border-default-200 bg-surface/80 p-4 sm:p-5">
      <div className="grid gap-4">
        <label className="text-sm font-semibold text-default-800" htmlFor={webDavUrlId}>
          WebDAV Endpoint
          <input
            id={webDavUrlId}
            type="url"
            value={url}
            onChange={event => setUrl(event.target.value)}
            disabled={controlsLocked}
            placeholder="https://cloud.example.com/remote.php/dav/files/user"
            className="mt-2 w-full rounded-xl border border-default-300 bg-default-50 px-3 py-2.5
              text-sm font-normal text-default-800 transition-colors duration-200 outline-none
              placeholder:text-default-400 focus:border-default-500 focus:bg-surface
              disabled:cursor-not-allowed disabled:border-default-200 disabled:bg-default-100"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold text-default-800" htmlFor={webDavUserId}>
            WebDAV Username
            <input
              id={webDavUserId}
              type="text"
              value={user}
              onChange={event => setUser(event.target.value)}
              disabled={controlsLocked}
              autoComplete="username"
              placeholder="my-user"
              className="mt-2 w-full rounded-xl border border-default-300 bg-default-50 px-3 py-2.5
                text-sm font-normal text-default-800 transition-colors duration-200 outline-none
                placeholder:text-default-400 focus:border-default-500 focus:bg-surface
                disabled:cursor-not-allowed disabled:border-default-200 disabled:bg-default-100"
            />
          </label>

          <label className="text-sm font-semibold text-default-800" htmlFor={webDavPassId}>
            Password
            <input
              id={webDavPassId}
              type="password"
              value={pass}
              onChange={event => setPass(event.target.value)}
              disabled={controlsLocked}
              autoComplete="current-password"
              placeholder="••••••••"
              className="mt-2 w-full rounded-xl border border-default-300 bg-default-50 px-3 py-2.5
                text-sm font-normal text-default-800 transition-colors duration-200 outline-none
                placeholder:text-default-400 focus:border-default-500 focus:bg-surface
                disabled:cursor-not-allowed disabled:border-default-200 disabled:bg-default-100"
            />
          </label>
        </div>
      </div>
    </div>
  );
};
