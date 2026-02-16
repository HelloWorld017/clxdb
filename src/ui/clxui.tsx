import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { DatabaseSettings } from './components/database-settings';
import { DatabaseUnlock } from './components/database-unlock';
import { StoragePicker } from './components/storage-picker';
import { SyncIndicator } from './components/sync-indicator';
import { ThemeProvider } from './components/theme-provider';
import uiStyles from './style.css?inline';
import type { DatabaseSettingsClient } from './components/database-settings';
import type { DatabaseUnlockSubmission } from './components/database-unlock';
import type { StoragePickerBackendType, StoragePickerSelection } from './components/storage-picker';
import type {
  SyncIndicatorClient,
  SyncIndicatorHorizontalPosition,
  SyncIndicatorVerticalPosition,
} from './components/sync-indicator';
import type { ThemeMode } from './components/theme-provider';
import type { ClxDBStatus } from '@/core/utils/inspect';
import type { ClxDBClientOptions, ClxUIOptions, StorageBackend } from '@/types';
import type { CSSProperties, ReactNode } from 'react';
import type { Root } from 'react-dom/client';

const SHADOW_ROOT_RESET_CSS = `
:host {
  all: initial;
}
`;

const dialogLayerStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1rem',
};

const dialogBackdropStyle: CSSProperties = {
  cursor: 'default',
  position: 'absolute',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.1)',
  backdropFilter: 'blur(8px)',
  border: 'none',
  padding: 0,
};

const dialogPanelStyle: CSSProperties = {
  position: 'relative',
  maxHeight: 'calc(100vh - 2rem)',
  overflow: 'auto',
};

const dialogCloseButtonStyle: CSSProperties = {
  position: 'absolute',
  top: '1rem',
  right: '1rem',
  zIndex: 10,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '2rem',
  height: '2rem',
  padding: 0,
  borderRadius: '0.8rem',
  border: '1px solid color-mix(in srgb, var(--color-default-300) 75%, transparent)',
  background: 'color-mix(in srgb, var(--color-surface) 92%, transparent)',
  color: 'var(--color-default-700)',
  cursor: 'pointer',
};

const closeIconStyle: CSSProperties = {
  width: '1rem',
  height: '1rem',
};

type SyncIndicatorPosition = [SyncIndicatorVerticalPosition, SyncIndicatorHorizontalPosition];

interface ShadowPortal {
  host: HTMLElement;
  root: Root;
}

interface DialogFrameProps {
  children: ReactNode;
  onClose: () => void;
  theme: ThemeMode;
  zIndex?: number;
}

interface OpenDialogParams<TResult> {
  createCloseValue: () => TResult;
  render: (resolve: (value: TResult) => void, close: () => void) => ReactNode;
  theme?: ThemeMode;
}

export interface ClxUIDialogCloseResult {
  reason: 'closed';
}

export interface OpenStoragePickerOptions {
  initialType?: StoragePickerBackendType;
  submitLabel?: string;
  onSelect?: (selection: StoragePickerSelection) => Promise<void> | void;
  theme?: ThemeMode;
}

export interface OpenDatabaseUnlockOptions {
  storage: StorageBackend;
  options?: ClxDBClientOptions;
  onStatusChange?: (status: ClxDBStatus) => void;
  onSubmit?: (submission: DatabaseUnlockSubmission) => Promise<void> | void;
  theme?: ThemeMode;
}

export interface OpenDatabaseSettingsOptions {
  storage: StorageBackend;
  client: DatabaseSettingsClient;
  options?: ClxDBClientOptions;
  theme?: ThemeMode;
}

export interface ShowSyncIndicatorOptions {
  client: SyncIndicatorClient;
  position?: SyncIndicatorPosition;
  successDuration?: number;
  theme?: ThemeMode;
}

export interface ClxUI {
  mount(target?: HTMLElement): void;
  unmount(): void;
  openStoragePicker(options?: OpenStoragePickerOptions): Promise<StoragePickerSelection | null>;
  openDatabaseUnlock(options: OpenDatabaseUnlockOptions): Promise<DatabaseUnlockSubmission | null>;
  openDatabaseSettings(options: OpenDatabaseSettingsOptions): Promise<ClxUIDialogCloseResult>;
  showSyncIndicator(options: ShowSyncIndicatorOptions): () => void;
}

function CloseIcon() {
  return (
    <svg
      style={closeIconStyle}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <title>Close dialog</title>
      <path d="m6 6 12 12" />
      <path d="m18 6-12 12" />
    </svg>
  );
}

function DialogFrame({ children, onClose, theme, zIndex }: DialogFrameProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      onClose();
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return (
    <ThemeProvider mode={theme}>
      <div style={{ ...dialogLayerStyle, zIndex }} role="presentation">
        <button
          type="button"
          style={dialogBackdropStyle}
          onClick={onClose}
          aria-label="Close dialog"
        />
        <div style={dialogPanelStyle} role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            style={dialogCloseButtonStyle}
          >
            <CloseIcon />
          </button>
          {children}
        </div>
      </div>
    </ThemeProvider>
  );
}

export const createClxUI = (options: ClxUIOptions = {}): ClxUI => {
  const defaultTheme: ThemeMode = options.theme ?? 'system';
  const defaultPosition: SyncIndicatorPosition = options.position ?? ['bottom', 'right'];

  let mountTarget: HTMLElement | null = null;
  let mountContainer: HTMLElement | null = null;
  let activeDialogClose: (() => void) | null = null;
  let syncIndicatorPortal: ShadowPortal | null = null;

  const assertBrowser = () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      throw new Error('ClxUI is only available in browser environments.');
    }
  };

  const ensureMounted = () => {
    assertBrowser();

    const target = mountTarget ?? document.body;
    if (!mountContainer) {
      mountContainer = document.createElement('div');
      mountContainer.dataset.clxuiRoot = '';
    }

    if (mountContainer.parentElement !== target) {
      target.append(mountContainer);
    }

    return mountContainer;
  };

  const createPortal = (): ShadowPortal => {
    const parent = ensureMounted();
    const host = document.createElement('div');
    parent.append(host);

    const shadowRoot = host.attachShadow({ mode: 'open' });
    const styleElement = document.createElement('style');
    styleElement.textContent = `${SHADOW_ROOT_RESET_CSS}\n${uiStyles}`;
    shadowRoot.append(styleElement);

    const rootElement = document.createElement('div');
    shadowRoot.append(rootElement);

    return {
      host,
      root: createRoot(rootElement),
    };
  };

  const destroyPortal = (portal: ShadowPortal | null) => {
    if (!portal) {
      return;
    }

    portal.root.unmount();
    portal.host.remove();
  };

  const closeActiveDialog = () => {
    if (!activeDialogClose) {
      return;
    }

    const close = activeDialogClose;
    activeDialogClose = null;
    close();
  };

  const hideSyncIndicator = () => {
    if (!syncIndicatorPortal) {
      return;
    }

    destroyPortal(syncIndicatorPortal);
    syncIndicatorPortal = null;
  };

  const openDialog = <TResult,>({
    createCloseValue,
    render,
    theme,
  }: OpenDialogParams<TResult>): Promise<TResult> => {
    closeActiveDialog();
    const portal = createPortal();

    return new Promise<TResult>(resolve => {
      let settled = false;

      const finalize = (result: TResult) => {
        if (settled) {
          return;
        }

        settled = true;
        destroyPortal(portal);

        if (activeDialogClose === requestClose) {
          activeDialogClose = null;
        }

        resolve(result);
      };

      const requestClose = () => {
        finalize(createCloseValue());
      };

      const resolveFromAction = (result: TResult) => {
        window.setTimeout(() => {
          finalize(result);
        }, 0);
      };

      activeDialogClose = requestClose;

      portal.root.render(
        <DialogFrame theme={theme ?? defaultTheme} onClose={requestClose}>
          {render(resolveFromAction, requestClose)}
        </DialogFrame>
      );
    });
  };

  const mount = (target?: HTMLElement) => {
    assertBrowser();
    if (target) {
      mountTarget = target;
    }

    ensureMounted();
  };

  const unmount = () => {
    closeActiveDialog();
    hideSyncIndicator();

    if (mountContainer) {
      mountContainer.remove();
      mountContainer = null;
    }
  };

  const openStoragePicker = (dialogOptions: OpenStoragePickerOptions = {}) =>
    openDialog<StoragePickerSelection | null>({
      createCloseValue: () => null,
      theme: dialogOptions.theme,
      render: (resolveSelection, closeDialog) => (
        <StoragePicker
          initialType={dialogOptions.initialType}
          submitLabel={dialogOptions.submitLabel}
          onCancel={closeDialog}
          onSelect={async selection => {
            await dialogOptions.onSelect?.(selection);
            resolveSelection(selection);
          }}
        />
      ),
    });

  const openDatabaseUnlock = (dialogOptions: OpenDatabaseUnlockOptions) =>
    openDialog<DatabaseUnlockSubmission | null>({
      createCloseValue: () => null,
      theme: dialogOptions.theme,
      render: resolveSubmission => (
        <DatabaseUnlock
          storage={dialogOptions.storage}
          options={dialogOptions.options}
          onStatusChange={dialogOptions.onStatusChange}
          onSubmit={async submission => {
            await dialogOptions.onSubmit?.(submission);
            resolveSubmission(submission);
          }}
        />
      ),
    });

  const openDatabaseSettings = (dialogOptions: OpenDatabaseSettingsOptions) =>
    openDialog<ClxUIDialogCloseResult>({
      createCloseValue: () => ({ reason: 'closed' }),
      theme: dialogOptions.theme,
      render: () => (
        <DatabaseSettings
          storage={dialogOptions.storage}
          client={dialogOptions.client}
          options={dialogOptions.options}
        />
      ),
    });

  const showSyncIndicator = (indicatorOptions: ShowSyncIndicatorOptions) => {
    hideSyncIndicator();
    const portal = createPortal();
    const [vertical, horizontal] = indicatorOptions.position ?? defaultPosition;

    syncIndicatorPortal = portal;

    portal.root.render(
      <ThemeProvider mode={indicatorOptions.theme ?? defaultTheme}>
        <SyncIndicator
          client={indicatorOptions.client}
          vertical={vertical}
          horizontal={horizontal}
          successDuration={indicatorOptions.successDuration}
        />
      </ThemeProvider>
    );

    return () => {
      if (syncIndicatorPortal !== portal) {
        return;
      }

      hideSyncIndicator();
    };
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
