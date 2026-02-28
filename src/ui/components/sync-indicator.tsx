import { useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '@/ui/i18n';
import { classes } from '@/utils/classes';
import { DEFAULT_Z_INDEX } from '../constants';
import { Presence } from './common/presence';
import type { ClxUIDatabaseClient } from '../types';
import type { SyncState } from '@/types';

type SyncIndicatorPhase = 'hidden' | 'pending' | 'syncing' | 'success' | 'error';
type VisibleSyncIndicatorPhase = Exclude<SyncIndicatorPhase, 'hidden'>;

export type SyncIndicatorVerticalPosition = 'top' | 'bottom';
export type SyncIndicatorHorizontalPosition = 'left' | 'center' | 'right';

export interface SyncIndicatorProps {
  client: ClxUIDatabaseClient;
  vertical?: SyncIndicatorVerticalPosition;
  horizontal?: SyncIndicatorHorizontalPosition;
  successDuration?: number;
  className?: string;
  zIndex?: number;
}

const resolveInitialPhase = (state: SyncState): SyncIndicatorPhase => {
  if (state === 'pending') {
    return 'pending';
  }

  if (state === 'syncing') {
    return 'syncing';
  }

  return 'hidden';
};

const PendingIcon = () => {
  const { t } = useI18n();
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <title>{t('syncIndicator.icon.pending')}</title>
      <circle cx="10" cy="10" r="6.5" />
      <circle className="clx-sync-indicator-pulse" cx="10" cy="10" r="1.25" fill="currentColor" />
    </svg>
  );
};

const SyncingIcon = () => {
  const { t } = useI18n();
  return (
    <svg
      className="clx-sync-indicator-spin"
      width="1em"
      height="1em"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <title>{t('syncIndicator.icon.syncing')}</title>
      <path d="M4 10a6 6 0 0 1 10.4-4.04" />
      <path d="M14.4 3.6v3.2h-3.2" />
      <path d="M16 10a6 6 0 0 1-10.4 4.04" />
      <path d="M5.6 16.4v-3.2h3.2" />
    </svg>
  );
};

const SuccessIcon = () => {
  const { t } = useI18n();
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <title>{t('syncIndicator.icon.success')}</title>
      <circle cx="10" cy="10" r="6.5" />
      <path className="clx-sync-indicator-check" d="m6.6 10.3 2.2 2.2 4.6-4.6" />
    </svg>
  );
};

const ErrorIcon = () => {
  const { t } = useI18n();
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <title>{t('syncIndicator.icon.error')}</title>
      <circle cx="10" cy="10" r="6.5" />
      <path d="M10 6.4v4.6" />
      <circle cx="10" cy="13.8" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
};

const getIndicatorLabel = (
  phase: VisibleSyncIndicatorPhase,
  t: ReturnType<typeof useI18n>['t']
) => {
  if (phase === 'pending') {
    return t('syncIndicator.label.pending');
  }

  if (phase === 'syncing') {
    return t('syncIndicator.label.syncing');
  }

  if (phase === 'success') {
    return t('syncIndicator.label.success');
  }

  return t('syncIndicator.label.error');
};

const getIndicatorToneClasses = (phase: VisibleSyncIndicatorPhase) => {
  if (phase === 'pending') {
    return 'bg-amber-950 text-amber-500';
  }

  if (phase === 'syncing') {
    return 'bg-slate-950 text-sky-500';
  }

  if (phase === 'success') {
    return 'bg-emerald-950 text-emerald-500';
  }

  return 'bg-red-950 text-red-500';
};

const IndicatorIcon = ({ phase }: { phase: VisibleSyncIndicatorPhase }) => {
  if (phase === 'pending') {
    return <PendingIcon />;
  }

  if (phase === 'syncing') {
    return <SyncingIcon />;
  }

  if (phase === 'success') {
    return <SuccessIcon />;
  }

  return <ErrorIcon />;
};

export function SyncIndicator({
  client,
  vertical = 'bottom',
  horizontal = 'right',
  successDuration = 5000,
  className,
  zIndex,
}: SyncIndicatorProps) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<SyncIndicatorPhase>(() =>
    resolveInitialPhase(client.getState())
  );
  const [displayPhase, setDisplayPhase] = useState<VisibleSyncIndicatorPhase>(() => {
    const resolved = resolveInitialPhase(client.getState());
    return resolved === 'hidden' ? 'pending' : resolved;
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isErrorOpen, setIsErrorOpen] = useState(false);
  const phaseRef = useRef(phase);
  const trackedSyncRef = useRef(false);
  const errorPanelId = useId();

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    if (phase !== 'hidden') {
      setDisplayPhase(phase);
    }
  }, [phase]);

  useEffect(() => {
    const initialState = client.getState();
    trackedSyncRef.current = initialState === 'pending';
    setPhase(resolveInitialPhase(initialState));
    setErrorMessage(null);
    setIsErrorOpen(false);

    const offStateChange = client.on('stateChange', nextState => {
      if (nextState === 'pending') {
        trackedSyncRef.current = true;
        setErrorMessage(null);
        setIsErrorOpen(false);
        setPhase('pending');
        return;
      }

      if (nextState === 'syncing') {
        setPhase(currentPhase => (currentPhase === 'pending' ? 'syncing' : currentPhase));
        return;
      }

      setPhase(currentPhase => {
        if (currentPhase === 'pending' || currentPhase === 'syncing') {
          return 'hidden';
        }

        return currentPhase;
      });
    });

    const offSyncStart = client.on('syncStart', (_syncId, payload) => {
      const shouldTrackSync = payload.isPending || phaseRef.current === 'error';
      trackedSyncRef.current = shouldTrackSync;
      if (!shouldTrackSync) {
        return;
      }

      setIsErrorOpen(false);
      setPhase('syncing');
    });

    const offSyncComplete = client.on('syncComplete', () => {
      if (!trackedSyncRef.current) {
        return;
      }

      trackedSyncRef.current = false;
      setErrorMessage(null);
      setIsErrorOpen(false);
      setPhase('success');
    });

    const offSyncError = client.on('syncError', (_syncId, payload) => {
      if (!trackedSyncRef.current) {
        return;
      }

      trackedSyncRef.current = false;
      setIsErrorOpen(false);
      setErrorMessage(payload.error.message || t('syncIndicator.defaultError'));
      setPhase('error');
    });

    return () => {
      offStateChange();
      offSyncStart();
      offSyncComplete();
      offSyncError();
    };
  }, [client, t]);

  useEffect(() => {
    if (phase !== 'success') {
      return;
    }

    const timeoutId = setTimeout(() => {
      setPhase(currentPhase => (currentPhase === 'success' ? 'hidden' : currentPhase));
    }, successDuration);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [phase, successDuration]);

  const isVisible = phase !== 'hidden';
  const label = getIndicatorLabel(displayPhase, t);
  const positionClasses = classes(
    'fixed',
    vertical === 'top' ? 'top-4 sm:top-5' : 'bottom-4 sm:bottom-5',
    horizontal === 'left'
      ? 'left-4 sm:left-5'
      : horizontal === 'center'
        ? 'left-1/2 -translate-x-1/2'
        : 'right-4 sm:right-5'
  );
  const directionClasses =
    vertical === 'top' ? 'clx-sync-indicator-origin-top' : 'clx-sync-indicator-origin-bottom';

  const indicatorClasses = classes(
    `inline-flex h-11 w-11 items-center justify-center rounded-xl border
    border-[color-mix(in_srgb,_currentColor_30%,_transparent)] text-2xl text-default-700
    shadow-ui-strong transition-all duration-500`,
    getIndicatorToneClasses(displayPhase),
    displayPhase === 'error' && isErrorOpen && 'ring-2 ring-red-300/70'
  );

  const messageClasses = classes(
    `absolute max-w-[16rem] min-w-[12rem] rounded-xl border border-default-200 bg-surface px-3 py-2
    text-xs leading-relaxed text-default-800 shadow-ui-medium`,
    vertical === 'top' ? 'top-full mt-4' : 'bottom-full mb-4',
    horizontal === 'left'
      ? vertical === 'top'
        ? 'left-0 origin-top-left'
        : 'left-0 origin-bottom-left'
      : horizontal === 'center'
        ? vertical === 'top'
          ? 'left-1/2 origin-top -translate-x-1/2'
          : 'left-1/2 origin-bottom -translate-x-1/2'
        : vertical === 'top'
          ? 'right-0 origin-top-right'
          : 'right-0 origin-bottom-right'
  );

  const onIndicatorClick = () => {
    if (displayPhase === 'pending') {
      void client.sync();
      return;
    }

    if (displayPhase === 'error') {
      setIsErrorOpen(currentOpen => !currentOpen);
      return;
    }
  };

  const canClickIndicator = displayPhase === 'pending' || displayPhase === 'error';

  return (
    <Presence
      enterClassName="clx-sync-indicator-presence-enter"
      exitClassName="clx-sync-indicator-presence-exit"
    >
      {isVisible ? (
        <div
          className={classes(
            canClickIndicator ? 'pointer-events-auto' : 'pointer-events-none',
            positionClasses,
            directionClasses,
            className
          )}
          style={{ zIndex: zIndex ?? DEFAULT_Z_INDEX }}
        >
          <div className="relative">
            <button
              type="button"
              className={indicatorClasses}
              onClick={onIndicatorClick}
              aria-label={label}
              aria-expanded={isErrorOpen}
              aria-controls={errorPanelId}
            >
              <span key={displayPhase} className="clx-sync-indicator-icon-enter inline-flex">
                <IndicatorIcon phase={displayPhase} />
              </span>
            </button>

            <Presence
              enterClassName="clx-sync-indicator-message-enter"
              exitClassName="clx-sync-indicator-message-exit"
            >
              {displayPhase === 'error' && isErrorOpen ? (
                <p id={errorPanelId} className={messageClasses} role="alert">
                  {errorMessage ?? t('syncIndicator.defaultError')}
                </p>
              ) : null}
            </Presence>
          </div>
        </div>
      ) : null}
    </Presence>
  );
}
