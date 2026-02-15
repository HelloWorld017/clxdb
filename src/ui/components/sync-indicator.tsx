import { useEffect, useId, useRef, useState } from 'react';
import { classes } from '@/utils/classes';
import type { ClxDBEvents, SyncState } from '@/types';

type SyncIndicatorEvents = Pick<
  ClxDBEvents,
  'stateChange' | 'syncStart' | 'syncComplete' | 'syncError'
>;

type SyncIndicatorPhase = 'hidden' | 'pending' | 'syncing' | 'success' | 'error';

const DEFAULT_SYNC_ERROR_TEXT = 'Sync failed. Please try again.';

export type SyncIndicatorVerticalPosition = 'top' | 'bottom';
export type SyncIndicatorHorizontalPosition = 'left' | 'right';

export interface SyncIndicatorClient {
  getState: () => SyncState;
  on: <K extends keyof SyncIndicatorEvents>(
    event: K,
    listener: SyncIndicatorEvents[K]
  ) => () => void;
}

export interface SyncIndicatorProps {
  client: SyncIndicatorClient;
  vertical?: SyncIndicatorVerticalPosition;
  horizontal?: SyncIndicatorHorizontalPosition;
  successDuration?: number;
  className?: string;
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

const PendingIcon = () => (
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
    <title>Pending sync</title>
    <circle cx="10" cy="10" r="6.5" />
    <circle className="clx-sync-indicator-pulse" cx="10" cy="10" r="1.25" fill="currentColor" />
  </svg>
);

const SyncingIcon = () => (
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
    <title>Syncing</title>
    <path d="M4 10a6 6 0 0 1 10.4-4.04" />
    <path d="M14.4 3.6v3.2h-3.2" />
    <path d="M16 10a6 6 0 0 1-10.4 4.04" />
    <path d="M5.6 16.4v-3.2h3.2" />
  </svg>
);

const SuccessIcon = () => (
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
    <title>Sync complete</title>
    <circle cx="10" cy="10" r="6.5" />
    <path className="clx-sync-indicator-check" d="m6.6 10.3 2.2 2.2 4.6-4.6" />
  </svg>
);

const ErrorIcon = () => (
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
    <title>Sync failed</title>
    <circle cx="10" cy="10" r="6.5" />
    <path d="M10 6.4v4.6" />
    <circle cx="10" cy="13.8" r="0.75" fill="currentColor" stroke="none" />
  </svg>
);

const getIndicatorLabel = (phase: Exclude<SyncIndicatorPhase, 'hidden'>) => {
  if (phase === 'pending') {
    return 'Sync pending';
  }

  if (phase === 'syncing') {
    return 'Syncing in progress';
  }

  if (phase === 'success') {
    return 'Sync completed';
  }

  return 'Sync failed. Click for details.';
};

const getIndicatorToneClasses = (phase: Exclude<SyncIndicatorPhase, 'hidden'>) => {
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

const IndicatorIcon = ({ phase }: { phase: Exclude<SyncIndicatorPhase, 'hidden'> }) => {
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
}: SyncIndicatorProps) {
  const [phase, setPhase] = useState<SyncIndicatorPhase>(() =>
    resolveInitialPhase(client.getState())
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isErrorOpen, setIsErrorOpen] = useState(false);
  const phaseRef = useRef(phase);
  const trackedSyncRef = useRef(false);
  const errorPanelId = useId();

  useEffect(() => {
    phaseRef.current = phase;
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

    const offSyncStart = client.on('syncStart', isPending => {
      const shouldTrackSync = isPending || phaseRef.current === 'error';
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

    const offSyncError = client.on('syncError', error => {
      if (!trackedSyncRef.current) {
        return;
      }

      trackedSyncRef.current = false;
      setIsErrorOpen(false);
      setErrorMessage(error?.message || DEFAULT_SYNC_ERROR_TEXT);
      setPhase('error');
    });

    return () => {
      offStateChange();
      offSyncStart();
      offSyncComplete();
      offSyncError();
    };
  }, [client]);

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

  if (phase === 'hidden') {
    return null;
  }

  const label = getIndicatorLabel(phase);
  const positionClasses = classes(
    'fixed z-50',
    vertical === 'top' ? 'top-4 sm:top-5' : 'bottom-4 sm:bottom-5',
    horizontal === 'left' ? 'left-4 sm:left-5' : 'right-4 sm:right-5'
  );

  const indicatorClasses = classes(
    `text-default-700 shadow-ui-strong inline-flex h-11 w-11 items-center justify-center rounded-xl
    border border-[color-mix(in_srgb,_currentColor_30%,_transparent)] text-2xl backdrop-blur
    transition-all duration-500`,
    getIndicatorToneClasses(phase),
    phase === 'error' && isErrorOpen && 'ring-2 ring-red-300/70'
  );

  const messageClasses = classes(
    `border-default-200 bg-surface text-default-800 shadow-ui-medium
    clx-sync-indicator-message-enter absolute max-w-[16rem] min-w-[12rem] rounded-xl border px-3
    py-2 text-xs leading-relaxed`,
    vertical === 'top' ? 'top-full mt-4' : 'bottom-full mb-4',
    horizontal === 'left'
      ? vertical === 'top'
        ? 'left-0 origin-top-left'
        : 'left-0 origin-bottom-left'
      : vertical === 'top'
        ? 'right-0 origin-top-right'
        : 'right-0 origin-bottom-right'
  );

  if (phase === 'error') {
    return (
      <div className={classes('pointer-events-none', positionClasses, className)}>
        <div className="pointer-events-auto relative">
          <button
            type="button"
            className={indicatorClasses}
            onClick={() => setIsErrorOpen(currentOpen => !currentOpen)}
            aria-label={label}
            aria-expanded={isErrorOpen}
            aria-controls={errorPanelId}
          >
            <span key={phase} className="clx-sync-indicator-icon-enter inline-flex">
              <IndicatorIcon phase={phase} />
            </span>
          </button>

          {isErrorOpen && (
            <p id={errorPanelId} className={messageClasses} role="alert">
              {errorMessage ?? DEFAULT_SYNC_ERROR_TEXT}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={classes('pointer-events-none', positionClasses, className)}>
      <div className={indicatorClasses} aria-live="polite">
        <span className="sr-only">{label}</span>
        <span key={phase} className="clx-sync-indicator-icon-enter inline-flex">
          <IndicatorIcon phase={phase} />
        </span>
      </div>
    </div>
  );
}
