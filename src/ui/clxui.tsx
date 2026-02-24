import { createRoot } from 'react-dom/client';
import { DialogFrame } from './components/common/dialog';
import { DatabaseSettings } from './components/database-settings';
import { DatabaseUnlock } from './components/database-unlock';
import { StoragePicker } from './components/storage-picker';
import { SyncIndicator } from './components/sync-indicator';
import { ThemeProvider } from './components/theme-provider';
import uiStyles from './style.css?inline&shadow';
import type { DatabaseUnlockOperation } from './components/database-unlock';
import type { StoragePickerBackendType } from './components/storage-picker';
import type { ThemeFontFamily, ThemePalette } from './components/theme-provider';
import type { ClxUIDatabaseClient } from './types';
import type { StorageConfig } from '@/storages';
import type { ClxDBClientOptions, StorageBackend } from '@/types';
import type { ReactElement, ReactNode } from 'react';
import type { Root } from 'react-dom/client';

const SHADOW_ROOT_RESET_CSS = `
:host {
  all: initial;
}
`;

interface ShadowPortal {
  target: Element;
  host: HTMLElement;
  root: Root;
}

interface OpenDialogParams<TResult> {
  createCloseValue: () => TResult;
  render: (resolve: (value: TResult) => void, close: () => void) => ReactNode;
}

export interface ClxUIDialogCloseResult {
  reason: 'closed';
}

export interface OpenStoragePickerOptions {
  initialType?: StoragePickerBackendType;
  submitLabel?: string;
}

export interface OpenDatabaseUnlockOptions {
  storage: StorageBackend;
  options?: ClxDBClientOptions;
  allowStorageChange?: boolean;
}

export interface OpenDatabaseSettingsOptions {
  storage: StorageBackend;
  client: ClxUIDatabaseClient;
  options?: ClxDBClientOptions;
}

export interface ShowSyncIndicatorOptions {
  client: ClxUIDatabaseClient;
  successDuration?: number;
}

export interface ClxUI {
  mount(target?: HTMLElement): void;
  unmount(): void;
  openStoragePicker(options?: OpenStoragePickerOptions): Promise<StorageConfig | null>;
  openDatabaseUnlock(options: OpenDatabaseUnlockOptions): Promise<DatabaseUnlockOperation | null>;
  openDatabaseSettings(options: OpenDatabaseSettingsOptions): Promise<ClxUIDialogCloseResult>;
  showSyncIndicator(options: ShowSyncIndicatorOptions): () => void;
}

export interface ClxUIOptions {
  position?: ['top' | 'bottom', 'left' | 'center' | 'right'];
  theme?: 'light' | 'dark' | 'system';
  style?: {
    fontFamily?: string | ThemeFontFamily;
    palette?: string | ThemePalette;
    zIndex?: number;
  };
}

export const createClxUI = (options: ClxUIOptions = {}): ClxUI => {
  let mountTarget: HTMLElement | null = null;
  let portal: ShadowPortal | null = null;
  let abortController: AbortController = new AbortController();

  const assertBrowser = () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      throw new Error('ClxUI is only available in browser environments.');
    }
  };

  const ensurePortal = () => {
    assertBrowser();
    if (portal) {
      return portal;
    }

    const target = mountTarget ?? document.body;
    const mountContainer =
      target.querySelector('[data-clxui-root]') ?? document.createElement('div');

    mountContainer.setAttribute('data-clxui-root', '');
    target.append(mountContainer);

    portal = createPortal(mountContainer);
    return portal;
  };

  const createPortal = (parent: Element): ShadowPortal => {
    const host = document.createElement('div');
    parent.append(host);

    const shadowRoot = host.attachShadow({ mode: 'open' });
    const styleElement = document.createElement('style');
    styleElement.textContent = `${SHADOW_ROOT_RESET_CSS}\n${uiStyles}`;
    shadowRoot.append(styleElement);

    const rootElement = document.createElement('div');
    shadowRoot.append(rootElement);

    return {
      target: parent,
      host,
      root: createRoot(rootElement),
    };
  };

  const mount = (target?: HTMLElement) => {
    assertBrowser();
    if (portal) {
      throw new Error(
        'ClxUI is already mounted. If this is an intended behavior, please call unmount() first.'
      );
    }

    if (target) {
      mountTarget = target;
    }

    ensurePortal();
  };

  const unmount = () => {
    abortController.abort();

    if (portal) {
      portal.root.unmount();
      portal.host.remove();
      portal.target.remove();
      portal = null;
    }
  };

  const palette =
    typeof options.style?.palette === 'string'
      ? { primaryColor: options.style.palette }
      : options.style?.palette;

  const fontFamily =
    typeof options.style?.fontFamily === 'string'
      ? { sansSerif: options.style.fontFamily }
      : options.style?.fontFamily;

  const children: Set<ReactElement> = new Set();
  const updateChildren = () =>
    ensurePortal().root.render(
      <ThemeProvider mode={options.theme} palette={palette} fontFamily={fontFamily}>
        {Array.from(children)}
      </ThemeProvider>
    );

  const addChild = (child: ReactElement) => {
    children.add(child);
    updateChildren();
  };

  const removeChild = (child: ReactElement) => {
    children.delete(child);
    updateChildren();
  };

  const createKey = () => Math.random().toString(36).slice(2);

  const openDialog = <TResult,>({
    createCloseValue,
    render,
  }: OpenDialogParams<TResult>): Promise<TResult> => {
    const { promise, resolve } = Promise.withResolvers<TResult>();

    let resultRef: { result: TResult } | null = null;
    const onFinalize = () => {
      resolve(resultRef ? resultRef.result : createCloseValue());
      removeChild(contents);
    };

    const contents = (
      <DialogFrame key={createKey()} onClose={onFinalize} zIndex={options.style?.zIndex}>
        {close =>
          render(result => {
            resultRef = { result };
            close();
          }, close)
        }
      </DialogFrame>
    );

    abortController.signal.addEventListener('abort', () => {
      onFinalize();
    });

    addChild(contents);
    return promise;
  };

  const openStoragePicker = (dialogOptions: OpenStoragePickerOptions = {}) =>
    openDialog<StorageConfig | null>({
      createCloseValue: () => null,
      render: (resolveSelection, closeDialog) => (
        <StoragePicker
          initialType={dialogOptions.initialType}
          submitLabel={dialogOptions.submitLabel}
          onCancel={closeDialog}
          onSelect={selection => resolveSelection(selection)}
        />
      ),
    });

  const openDatabaseUnlock = (dialogOptions: OpenDatabaseUnlockOptions) =>
    openDialog<DatabaseUnlockOperation | null>({
      createCloseValue: () => null,
      render: resolveSubmission => (
        <DatabaseUnlock
          storage={dialogOptions.storage}
          options={dialogOptions.options}
          allowStorageChange={dialogOptions.allowStorageChange}
          onSubmit={submission => resolveSubmission(submission)}
        />
      ),
    });

  const openDatabaseSettings = (dialogOptions: OpenDatabaseSettingsOptions) =>
    openDialog<ClxUIDialogCloseResult>({
      createCloseValue: () => ({ reason: 'closed' }),
      render: () => (
        <DatabaseSettings client={dialogOptions.client} options={dialogOptions.options} />
      ),
    });

  const showSyncIndicator = (indicatorOptions: ShowSyncIndicatorOptions) => {
    const [vertical, horizontal] = options.position ?? ['bottom', 'left'];
    const contents = (
      <SyncIndicator
        key={createKey()}
        client={indicatorOptions.client}
        vertical={vertical}
        horizontal={horizontal}
        successDuration={indicatorOptions.successDuration}
        zIndex={options.style?.zIndex}
      />
    );

    addChild(contents);
    return () => removeChild(contents);
  };

  return {
    mount,
    unmount,
    openStoragePicker,
    openDatabaseUnlock,
    openDatabaseSettings,
    showSyncIndicator,
  };
};
