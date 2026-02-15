import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SyncIndicator, ThemeProvider } from '@/index';
import './index.css';
import type {
  SyncIndicatorClient,
  SyncIndicatorHorizontalPosition,
  SyncIndicatorVerticalPosition,
} from '@/index';

type MockSyncState = ReturnType<SyncIndicatorClient['getState']>;

type MockSyncEvents = {
  stateChange: (state: MockSyncState) => void;
  syncStart: (isPending: boolean) => void;
  syncComplete: () => void;
  syncError: (error: Error) => void;
};

class MockSyncClient implements SyncIndicatorClient {
  private state: MockSyncState = 'idle';

  private listeners: {
    [K in keyof MockSyncEvents]: Set<MockSyncEvents[K]>;
  } = {
    stateChange: new Set(),
    syncStart: new Set(),
    syncComplete: new Set(),
    syncError: new Set(),
  };

  getState(): MockSyncState {
    return this.state;
  }

  on<K extends keyof MockSyncEvents>(event: K, listener: MockSyncEvents[K]): () => void {
    this.listeners[event].add(listener);

    return () => {
      this.listeners[event].delete(listener);
    };
  }

  private emitStateChange(state: MockSyncState) {
    this.listeners.stateChange.forEach(listener => {
      listener(state);
    });
  }

  private emitSyncStart(isPending: boolean) {
    this.listeners.syncStart.forEach(listener => {
      listener(isPending);
    });
  }

  private emitSyncComplete() {
    this.listeners.syncComplete.forEach(listener => {
      listener();
    });
  }

  private emitSyncError(error: Error) {
    this.listeners.syncError.forEach(listener => {
      listener(error);
    });
  }

  private setState(nextState: MockSyncState) {
    if (this.state === nextState) {
      return;
    }

    this.state = nextState;
    this.emitStateChange(nextState);
  }

  setIdle() {
    this.setState('idle');
  }

  setPending() {
    this.setState('pending');
  }

  startSync(isPending: boolean) {
    this.setState('syncing');
    this.emitSyncStart(isPending);
  }

  completeSync() {
    this.emitSyncComplete();
    this.setState('idle');
  }

  failSync(message: string) {
    this.emitSyncError(new Error(message));
    this.setState('idle');
  }
}

const LOG_LIMIT = 18;

const formatLog = (message: string) => {
  const timestamp = new Date().toLocaleTimeString('en-GB', {
    hour12: false,
  });

  return `${timestamp}  ${message}`;
};

const NumberInput = ({
  id,
  value,
  onChange,
}: {
  id: string;
  value: number;
  onChange: (nextValue: number) => void;
}) => (
  <input
    id={id}
    type="number"
    value={value}
    min={0}
    max={30000}
    step={100}
    onChange={event => {
      const parsed = Number(event.target.value);
      if (Number.isFinite(parsed)) {
        onChange(Math.max(0, Math.min(30000, parsed)));
      }
    }}
    className="focus:bg-surface h-10 w-full rounded-xl border border-gray-300 bg-gray-50 px-3
      text-sm text-gray-800 outline-none focus:border-gray-500"
  />
);

function SyncIndicatorExampleApp() {
  const [client] = useState(() => new MockSyncClient());
  const [vertical, setVertical] = useState<SyncIndicatorVerticalPosition>('bottom');
  const [horizontal, setHorizontal] = useState<SyncIndicatorHorizontalPosition>('right');
  const [successDuration, setSuccessDuration] = useState(5000);
  const [errorText, setErrorText] = useState('Remote shard upload failed (HTTP 503).');
  const [stateLabel, setStateLabel] = useState<MockSyncState>(client.getState());
  const [logs, setLogs] = useState<string[]>([]);

  const timerIdsRef = useRef<number[]>([]);

  const verticalSelectId = 'sync-indicator-vertical';
  const horizontalSelectId = 'sync-indicator-horizontal';
  const successDurationInputId = 'sync-indicator-success-duration';
  const errorTextAreaId = 'sync-indicator-error-text';

  const clearTimers = useCallback(() => {
    timerIdsRef.current.forEach(timerId => {
      window.clearTimeout(timerId);
    });
    timerIdsRef.current = [];
  }, []);

  const schedule = useCallback((action: () => void, delayMs: number) => {
    const timerId = window.setTimeout(() => {
      timerIdsRef.current = timerIdsRef.current.filter(id => id !== timerId);
      action();
    }, delayMs);
    timerIdsRef.current.push(timerId);
  }, []);

  const addLog = useCallback((message: string) => {
    setLogs(previousLogs => [formatLog(message), ...previousLogs].slice(0, LOG_LIMIT));
  }, []);

  useEffect(() => {
    const offStateChange = client.on('stateChange', state => {
      setStateLabel(state);
      addLog(`stateChange -> ${state}`);
    });

    const offSyncStart = client.on('syncStart', isPending => {
      addLog(`syncStart(isPending=${String(isPending)})`);
    });

    const offSyncComplete = client.on('syncComplete', () => {
      addLog('syncComplete');
    });

    const offSyncError = client.on('syncError', error => {
      addLog(`syncError -> ${error.message}`);
    });

    return () => {
      clearTimers();
      offStateChange();
      offSyncStart();
      offSyncComplete();
      offSyncError();
    };
  }, [addLog, clearTimers, client]);

  const runHidden = () => {
    clearTimers();
    client.setIdle();
  };

  const runPendingOnly = () => {
    clearTimers();
    client.setIdle();
    client.setPending();
  };

  const runSyncing = () => {
    clearTimers();
    client.setIdle();
    client.setPending();
    schedule(() => {
      client.startSync(true);
    }, 240);
  };

  const runSuccess = () => {
    clearTimers();
    client.setIdle();
    client.setPending();
    schedule(() => {
      client.startSync(true);
    }, 320);
    schedule(() => {
      client.completeSync();
    }, 1700);
  };

  const runError = () => {
    clearTimers();
    client.setIdle();
    client.setPending();
    schedule(() => {
      client.startSync(true);
    }, 320);
    schedule(() => {
      client.failSync(errorText || 'Sync failed in mock client.');
    }, 1700);
  };

  const runRetryFromError = () => {
    clearTimers();
    client.startSync(false);
    schedule(() => {
      client.completeSync();
    }, 1300);
  };

  const runBackgroundSyncIgnored = () => {
    clearTimers();
    client.setIdle();
    client.startSync(false);
    schedule(() => {
      client.completeSync();
    }, 900);
  };

  const clearLogs = () => {
    setLogs([]);
  };

  const buttonClass =
    'border-gray-300 bg-white text-gray-800 hover:border-gray-500 hover:bg-gray-100 inline-flex h-11 items-center justify-center rounded-xl border px-3 text-sm font-medium transition-colors duration-200';

  return (
    <ThemeProvider mode="light" primaryColor="#0f766e" defaultColor="oklch(0.58 0.03 245)">
      <main className="min-h-screen px-4 py-8 sm:px-8 sm:py-10 dark:bg-zinc-900">
        <div className="mx-auto w-full max-w-6xl space-y-6">
          <header
            className="rounded-[1.75rem] border border-gray-200 bg-gray-50/85 p-6 shadow-md
              backdrop-blur-sm"
          >
            <p className="text-[11px] font-semibold tracking-[0.2em] text-gray-500 uppercase">
              Example Sandbox
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">
              SyncIndicator Mock Client
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-gray-600">
              Trigger pending, syncing, success, and error flows to validate icon transitions,
              corner positions, and error detail popup behavior.
            </p>
          </header>

          <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div
              className="rounded-[1.75rem] border border-gray-200 bg-gray-50/85 p-6 shadow-md
                backdrop-blur-sm"
            >
              <p className="text-sm font-semibold text-gray-800">Scenario Controls</p>
              <p className="mt-1 text-xs leading-relaxed text-gray-500">
                Each button emits mock `ClxDB` events so you can inspect indicator behavior.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button type="button" className={buttonClass} onClick={runHidden}>
                  1) No Pending (Hidden)
                </button>
                <button type="button" className={buttonClass} onClick={runPendingOnly}>
                  2) Pending Only
                </button>
                <button type="button" className={buttonClass} onClick={runSyncing}>
                  3) Pending {'->'} Syncing
                </button>
                <button type="button" className={buttonClass} onClick={runSuccess}>
                  4) Sync Complete (5s hide)
                </button>
                <button type="button" className={buttonClass} onClick={runError}>
                  5) Sync Error (sticky)
                </button>
                <button type="button" className={buttonClass} onClick={runRetryFromError}>
                  Retry From Error
                </button>
              </div>

              <div className="mt-3">
                <button type="button" className={buttonClass} onClick={runBackgroundSyncIgnored}>
                  Background Sync (isPending=false)
                </button>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                <label
                  htmlFor={verticalSelectId}
                  className="text-xs font-semibold tracking-wide text-gray-700 uppercase"
                >
                  Vertical
                  <select
                    id={verticalSelectId}
                    value={vertical}
                    onChange={event =>
                      setVertical(event.target.value as SyncIndicatorVerticalPosition)
                    }
                    className="focus:bg-surface mt-2 h-10 w-full rounded-xl border border-gray-300
                      bg-gray-50 px-3 text-sm text-gray-800 outline-none focus:border-gray-500"
                  >
                    <option value="top">Top</option>
                    <option value="bottom">Bottom</option>
                  </select>
                </label>

                <label
                  htmlFor={horizontalSelectId}
                  className="text-xs font-semibold tracking-wide text-gray-700 uppercase"
                >
                  Horizontal
                  <select
                    id={horizontalSelectId}
                    value={horizontal}
                    onChange={event =>
                      setHorizontal(event.target.value as SyncIndicatorHorizontalPosition)
                    }
                    className="focus:bg-surface mt-2 h-10 w-full rounded-xl border border-gray-300
                      bg-gray-50 px-3 text-sm text-gray-800 outline-none focus:border-gray-500"
                  >
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                  </select>
                </label>

                <label
                  htmlFor={successDurationInputId}
                  className="text-xs font-semibold tracking-wide text-gray-700 uppercase"
                >
                  Success Hide (ms)
                  <div className="mt-2">
                    <NumberInput
                      id={successDurationInputId}
                      value={successDuration}
                      onChange={setSuccessDuration}
                    />
                  </div>
                </label>
              </div>

              <label
                htmlFor={errorTextAreaId}
                className="mt-4 block text-xs font-semibold tracking-wide text-gray-700 uppercase"
              >
                Error Text
                <textarea
                  id={errorTextAreaId}
                  value={errorText}
                  onChange={event => setErrorText(event.target.value)}
                  rows={3}
                  className="focus:bg-surface mt-2 w-full rounded-xl border border-gray-300
                    bg-gray-50 px-3 py-2 text-sm leading-relaxed text-gray-800 outline-none
                    placeholder:text-gray-400 focus:border-gray-500"
                />
              </label>

              <p className="mt-4 text-xs leading-relaxed text-gray-500">
                In error state, click the exclamation icon to open the error text popup.
              </p>
            </div>

            <aside
              className="shadow-ui-soft rounded-[1.75rem] border border-gray-200 bg-gray-50/85 p-5
                backdrop-blur-sm"
            >
              <p className="text-[11px] font-semibold tracking-[0.2em] text-gray-500 uppercase">
                Runtime Snapshot
              </p>

              <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-900/95 px-3 py-2">
                <p className="text-[11px] tracking-wide text-zinc-400 uppercase">Current state</p>
                <p className="mt-1 text-sm font-medium text-zinc-100">{stateLabel}</p>
              </div>

              <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-900/95 px-3 py-2">
                <p className="text-[11px] tracking-wide text-zinc-400 uppercase">Position</p>
                <p className="mt-1 text-sm font-medium text-zinc-100">
                  {vertical}-{horizontal}
                </p>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">Event Log</p>
                <button
                  type="button"
                  onClick={clearLogs}
                  className="text-xs font-semibold text-gray-500 hover:text-gray-800"
                >
                  Clear
                </button>
              </div>

              <div
                className="mt-2 max-h-[22rem] overflow-auto rounded-xl border border-zinc-200
                  bg-zinc-900/95"
              >
                <ul className="space-y-1 px-3 py-3 text-[11px] leading-relaxed text-zinc-200">
                  {logs.length > 0 ? (
                    logs.map(log => <li key={log}>{log}</li>)
                  ) : (
                    <li className="text-zinc-400">No events yet.</li>
                  )}
                </ul>
              </div>
            </aside>
          </section>
        </div>

        <SyncIndicator
          client={client}
          vertical={vertical}
          horizontal={horizontal}
          successDuration={successDuration}
        />
      </main>
    </ThemeProvider>
  );
}

const container = document.getElementById('app');
if (container) {
  const root = createRoot(container);
  root.render(<SyncIndicatorExampleApp />);
}
