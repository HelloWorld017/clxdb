import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ThemeProvider, useThemeContext } from '@/ui/components/theme-provider';
import uiStyles from '@/ui/style.css?inline';
import { classes } from '@/utils/classes';

import CorsAnywhereGuide from './guides/cors-anywhere.mdx';
import CorsUnblockGuide from './guides/cors-unblock.mdx';
import MinioGuide from './guides/minio.mdx';
import NextCloudGuide from './guides/nextcloud.mdx';
import NginxGuide from './guides/nginx.mdx';
import OpenCloudGuide from './guides/opencloud.mdx';
import R2Guide from './guides/r2.mdx';
import RustFSGuide from './guides/rustfs.mdx';
import S3Guide from './guides/s3.mdx';
import SynologyGuide from './guides/synology.mdx';
import UserscriptGuide from './guides/userscript.mdx';
import type { ReactNode } from 'react';

export type CorsGuideGroupId = 'common' | 'webdav' | 's3';

export type CorsGuideTabId =
  | 'userscript'
  | 'cors-unblock'
  | 'cors-anywhere'
  | 'nginx'
  | 'nextcloud'
  | 'opencloud'
  | 'synology'
  | 's3'
  | 'r2'
  | 'minio'
  | 'rustfs';

interface CorsGuideTabOption {
  id: CorsGuideTabId;
  group: CorsGuideGroupId;
  label: string;
  children?: ReactNode;
}

const CORS_GUIDE_WINDOW_NAME = 'clxdb-cors-guide';
const CORS_GUIDE_ROOT_ID = 'clxdb-cors-guide-root';
const CORS_GUIDE_STYLE_ID = 'clxdb-cors-guide-style';

const CORS_GUIDE_TAB_OPTIONS: CorsGuideTabOption[] = [
  {
    id: 'userscript',
    group: 'common',
    label: 'Userscript',
    children: <UserscriptGuide />,
  },
  { id: 'cors-unblock', group: 'common', label: 'CORS Unblock', children: <CorsUnblockGuide /> },
  { id: 'cors-anywhere', group: 'common', label: 'CORS Anywhere', children: <CorsAnywhereGuide /> },
  { id: 'nginx', group: 'common', label: 'Nginx', children: <NginxGuide /> },
  { id: 'nextcloud', group: 'webdav', label: 'NextCloud', children: <NextCloudGuide /> },
  { id: 'opencloud', group: 'webdav', label: 'OpenCloud', children: <OpenCloudGuide /> },
  { id: 'synology', group: 'webdav', label: 'Synology', children: <SynologyGuide /> },
  { id: 's3', group: 's3', label: 'Amazon S3', children: <S3Guide /> },
  { id: 'r2', group: 's3', label: 'Cloudflare R2', children: <R2Guide /> },
  { id: 'minio', group: 's3', label: 'Minio', children: <MinioGuide /> },
  { id: 'rustfs', group: 's3', label: 'RustFS', children: <RustFSGuide /> },
];

const CORS_GUIDE_GROUP_LABELS: Record<CorsGuideGroupId, string> = {
  common: 'Common',
  webdav: 'WebDAV',
  s3: 'S3',
};

const CORS_GUIDE_GROUP_ORDER: CorsGuideGroupId[] = ['common', 'webdav', 's3'];

const DEFAULT_TAB_ID: CorsGuideTabId = 'userscript';

const WINDOW_FEATURE_WIDTH = 1024;
const WINDOW_FEATURE_HEIGHT = 760;

const getWindowFeatures = () => {
  if (typeof window === 'undefined') {
    return `width=${WINDOW_FEATURE_WIDTH},height=${WINDOW_FEATURE_HEIGHT}`;
  }

  return [
    `width=${WINDOW_FEATURE_WIDTH}`,
    `height=${WINDOW_FEATURE_HEIGHT}`,
    'resizable=yes',
    'scrollbars=yes',
  ].join(',');
};

export interface CorsGuideProps {
  popupWindow: Window | null;
  onClose: () => void;
  initialTabId?: CorsGuideTabId;
}

export const CorsGuide = ({
  popupWindow,
  onClose,
  initialTabId = DEFAULT_TAB_ID,
}: CorsGuideProps) => {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [activeTabId, setActiveTabId] = useState<CorsGuideTabId>(initialTabId);

  const groupedTabs = useMemo(
    () =>
      CORS_GUIDE_GROUP_ORDER.map(groupId => ({
        groupId,
        groupLabel: CORS_GUIDE_GROUP_LABELS[groupId],
        tabs: CORS_GUIDE_TAB_OPTIONS.filter(option => option.group === groupId),
      })),
    []
  );

  const activeTab =
    CORS_GUIDE_TAB_OPTIONS.find(option => option.id === activeTabId) ?? CORS_GUIDE_TAB_OPTIONS[0];

  useEffect(() => {
    setActiveTabId(initialTabId);
  }, [initialTabId]);

  useEffect(() => {
    if (!popupWindow || popupWindow.closed) {
      setPortalTarget(null);
      return;
    }

    const ensurePortalTarget = () => {
      if (popupWindow.closed) {
        setPortalTarget(null);
        onClose();
        return;
      }

      const popupDocument = popupWindow.document;
      popupDocument.title = 'ClxDB CORS Guide';

      if (!popupDocument.body) {
        return;
      }

      if (popupDocument.head && !popupDocument.getElementById(CORS_GUIDE_STYLE_ID)) {
        const styleElement = popupDocument.createElement('style');
        styleElement.id = CORS_GUIDE_STYLE_ID;
        styleElement.textContent = uiStyles;
        popupDocument.head.append(styleElement);
      }

      popupDocument.documentElement.classList.add('h-full');
      popupDocument.body.classList.add('m-0', 'h-full', 'bg-default-100', 'text-default-900');

      let root = popupDocument.getElementById(CORS_GUIDE_ROOT_ID);
      if (!root) {
        root = popupDocument.createElement('div');
        root.id = CORS_GUIDE_ROOT_ID;
        root.classList.add('w-full', 'h-full');
        popupDocument.body.append(root);
      }

      setPortalTarget(root);
    };

    ensurePortalTarget();

    const handleBeforeUnload = () => {
      setPortalTarget(null);
      onClose();
    };

    const handleLoad = () => {
      ensurePortalTarget();
    };

    popupWindow.addEventListener('beforeunload', handleBeforeUnload);
    popupWindow.addEventListener('load', handleLoad);

    const closeWatcher = window.setInterval(() => {
      if (!popupWindow.closed) {
        return;
      }

      window.clearInterval(closeWatcher);
      setPortalTarget(null);
      onClose();
    }, 400);

    return () => {
      popupWindow.removeEventListener('beforeunload', handleBeforeUnload);
      popupWindow.removeEventListener('load', handleLoad);
      window.clearInterval(closeWatcher);
    };
  }, [onClose, popupWindow]);

  const mainRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => mainRef.current?.scrollTo({ top: 0 }), [activeTab]);

  const theme = useThemeContext();
  if (!popupWindow || popupWindow.closed || !portalTarget) {
    return null;
  }

  return createPortal(
    <ThemeProvider
      className="h-full"
      mode={theme.mode}
      palette={theme.palette}
      fontFamily={theme.fontFamily}
    >
      <div className="h-full bg-default-100 text-default-900">
        <div className="mx-auto flex h-full max-w-[1200px] flex-col p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold tracking-[0.2em] text-default-500 uppercase">
                Storage CORS Guide
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-default-900">
                Setup CORS for your storage
              </h1>
            </div>

            <button
              type="button"
              onClick={() => {
                popupWindow.close();
                onClose();
              }}
              className="inline-flex items-center justify-center rounded-xl border
                border-default-300 bg-surface px-3 py-2 text-sm font-semibold text-default-700
                shadow-xs transition-colors duration-200 hover:border-default-400
                hover:bg-default-100"
            >
              Close
            </button>
          </div>

          <div
            className="grid min-h-[35rem] flex-1 overflow-hidden rounded-3xl border
              border-default-200 bg-surface shadow-ui-soft md:grid-cols-[17.5rem_minmax(0,1fr)]"
          >
            <aside
              className="min-h-0 overflow-y-auto border-b border-default-200 bg-default-50 p-4
                md:border-r md:border-b-0"
            >
              {groupedTabs.map(group => (
                <section key={group.groupId} className="mb-4 last:mb-0">
                  <p
                    className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-default-500
                      uppercase"
                  >
                    {group.groupLabel}
                  </p>

                  <div className="grid gap-2">
                    {group.tabs.map(tab => {
                      const active = tab.id === activeTab.id;

                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setActiveTabId(tab.id)}
                          className={classes(
                            `rounded-xl border px-3 py-2 text-left text-sm font-medium
                            transition-colors duration-200`,
                            active
                              ? 'border-default-900 bg-default-900 text-default-100'
                              : `border-default-200 bg-surface text-default-800
                                hover:border-default-300 hover:bg-default-100`
                          )}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </aside>

            <main className="min-h-0 overflow-y-auto p-5 sm:p-6" ref={mainRef}>
              <p className="text-xs font-semibold tracking-[0.2em] text-default-500 uppercase">
                {CORS_GUIDE_GROUP_LABELS[activeTab.group]}
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-default-900">
                {activeTab.label}
              </h2>

              <div className="documents mt-5">{activeTab.children}</div>
            </main>
          </div>
        </div>
      </div>
    </ThemeProvider>,
    portalTarget
  );
};

export const CorsGuideMessage = ({ className = '', disabled = false }) => {
  const [corsGuideWindow, setCorsGuideWindow] = useState<Window | null>(null);
  const [isGuidePopupBlocked, setIsGuidePopupBlocked] = useState(false);

  useEffect(
    () => () => {
      if (corsGuideWindow && !corsGuideWindow.closed) {
        corsGuideWindow.close();
      }
    },
    [corsGuideWindow]
  );

  const openGuidePopup = () => {
    if (corsGuideWindow) {
      corsGuideWindow.focus();
      return;
    }

    const nextWindow = window.open('', CORS_GUIDE_WINDOW_NAME, getWindowFeatures());
    if (!nextWindow) {
      setIsGuidePopupBlocked(true);
      return;
    }

    setIsGuidePopupBlocked(false);
    setCorsGuideWindow(nextWindow);
  };

  const handleGuidePopupClose = () => {
    setCorsGuideWindow(null);
  };

  return (
    <div
      className={classes('rounded-xl border border-amber-200 bg-amber-50/85 px-4 py-3', className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-amber-900">This storage requires CORS setup</p>
          <p className="mt-0.5 text-xs text-amber-700">
            Please allow this app origin in your CORS rules to use this storage.
          </p>
        </div>

        <button
          type="button"
          onClick={openGuidePopup}
          disabled={disabled}
          className="inline-flex items-center justify-center rounded-lg border border-amber-300
            bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors
            duration-200 hover:bg-amber-200 disabled:cursor-not-allowed disabled:border-amber-200
            disabled:bg-amber-100 disabled:text-amber-600"
        >
          Guide
        </button>
      </div>

      {isGuidePopupBlocked && (
        <p className="mt-2 text-xs text-amber-700">
          Popup blocked by browser. Allow popups for this site and try again.
        </p>
      )}

      <CorsGuide popupWindow={corsGuideWindow} onClose={handleGuidePopupClose} />
    </div>
  );
};
