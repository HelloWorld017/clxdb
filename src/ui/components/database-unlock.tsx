import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { inspectClxDBStatus } from '@/core/utils/inspect';
import { classes } from '@/utils/classes';
import {
  PIN_LENGTH,
  PinInput,
  createEmptyPin,
  isCompletePin,
  pinToString,
} from './common/pin-input';
import type { ClxUIDatabaseClient } from '../types';
import type { ClxDBStatus } from '@/core/utils/inspect';
import type { ClxDBClientOptions, ClxDBCrypto, StorageBackend } from '@/types';
import type { SubmitEvent } from 'react';

export type DatabaseUnlockSubmission =
  | {
      mode: 'create';
      masterPassword: string;
      quickUnlockPin: string;
    }
  | {
      mode: 'create-no-crypto';
    }
  | {
      mode: 'quick-unlock';
      quickUnlockPin: string;
    }
  | {
      mode: 'master-unlock';
      masterPassword: string;
    }
  | {
      mode: 'master-recovery';
      masterPassword: string;
      quickUnlockPin: string;
    };

export type DatabaseUnlockOperation = {
  mode: 'generate' | 'open';
  crypto: ClxDBCrypto;
  update: ((client: ClxUIDatabaseClient) => Promise<void>) | null;
  submission: DatabaseUnlockSubmission;
};

const mapToUnlockOperation = (submission: DatabaseUnlockSubmission): DatabaseUnlockOperation => {
  if (submission.mode === 'create') {
    return {
      mode: 'generate',
      crypto: { kind: 'master', password: submission.masterPassword },
      update: async client =>
        client.updateQuickUnlockPassword(submission.masterPassword, submission.quickUnlockPin),
      submission,
    };
  }

  if (submission.mode === 'create-no-crypto') {
    return {
      mode: 'generate',
      crypto: { kind: 'none' },
      update: null,
      submission,
    };
  }

  if (submission.mode === 'quick-unlock') {
    return {
      mode: 'open',
      crypto: { kind: 'quick-unlock', password: submission.quickUnlockPin },
      update: null,
      submission,
    };
  }

  return {
    mode: 'open',
    crypto: { kind: 'master', password: submission.masterPassword },
    update:
      submission.mode === 'master-recovery'
        ? async client =>
            client.updateQuickUnlockPassword(submission.masterPassword, submission.quickUnlockPin)
        : null,
    submission,
  };
};

export interface DatabaseUnlockProps {
  storage: StorageBackend;
  onSubmit: (operation: DatabaseUnlockOperation) => Promise<void> | void;
  options?: ClxDBClientOptions;
  onStatusChange?: (status: ClxDBStatus) => void;
  className?: string;
  disabled?: boolean;
}

type UnlockMode =
  | 'inspecting'
  | 'create'
  | 'quick-unlock'
  | 'master-recovery'
  | 'unsupported'
  | 'inspection-error';

const getInspectErrorMessage = (error: unknown) => {
  const fallback = 'Unable to inspect storage metadata. Check connectivity and try again.';
  return error instanceof Error ? error.message : fallback;
};

const getSubmitErrorMessage = (error: unknown) => {
  const fallback = 'Unlock request failed. Verify credentials and retry.';
  return error instanceof Error ? error.message : fallback;
};

const resolveMode = (
  status: ClxDBStatus | null,
  isInspecting: boolean,
  inspectError: string | null
): UnlockMode => {
  if (isInspecting) {
    return 'inspecting';
  }

  if (inspectError) {
    return 'inspection-error';
  }

  if (!status) {
    return 'inspection-error';
  }

  if (!status.hasDatabase) {
    return 'create';
  }

  if (!status.isEncrypted) {
    return 'unsupported';
  }

  if (status.hasUsableDeviceKey) {
    return 'quick-unlock';
  }

  return 'master-recovery';
};

export function DatabaseUnlock({
  storage,
  onSubmit,
  options,
  onStatusChange,
  className,
  disabled = false,
}: DatabaseUnlockProps) {
  const [status, setStatus] = useState<ClxDBStatus | null>(null);
  const [isInspecting, setIsInspecting] = useState(true);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [masterPassword, setMasterPassword] = useState('');
  const [quickUnlockPinDigits, setQuickUnlockPinDigits] = useState<string[]>(() =>
    createEmptyPin()
  );
  const [saveDeviceKeyOnRecovery, setSaveDeviceKeyOnRecovery] = useState(true);

  const inspectionSequenceRef = useRef(0);
  const baseId = useId();

  const mode = useMemo(
    () => resolveMode(status, isInspecting, inspectError),
    [status, isInspecting, inspectError]
  );

  const inspect = useCallback(async () => {
    const sequence = ++inspectionSequenceRef.current;
    setIsInspecting(true);
    setInspectError(null);
    setSubmitError(null);

    try {
      const nextStatus = await inspectClxDBStatus(storage, options);
      if (sequence !== inspectionSequenceRef.current) {
        return;
      }

      setStatus(nextStatus);
      setMasterPassword('');
      setQuickUnlockPinDigits(createEmptyPin());
      setSaveDeviceKeyOnRecovery(true);
      onStatusChange?.(nextStatus);
    } catch (error) {
      if (sequence !== inspectionSequenceRef.current) {
        return;
      }

      setStatus(null);
      setMasterPassword('');
      setQuickUnlockPinDigits(createEmptyPin());
      setSaveDeviceKeyOnRecovery(true);
      setInspectError(getInspectErrorMessage(error));
    } finally {
      if (sequence === inspectionSequenceRef.current) {
        setIsInspecting(false);
      }
    }
  }, [options, onStatusChange, storage]);

  useEffect(() => {
    void inspect();
    return () => {
      inspectionSequenceRef.current += 1;
    };
  }, [inspect]);

  const formVisible = mode === 'create' || mode === 'quick-unlock' || mode === 'master-recovery';
  const recoveryWithDeviceKey = mode === 'master-recovery' && saveDeviceKeyOnRecovery;
  const requiresMaster = mode === 'create' || mode === 'master-recovery';
  const requiresPin = mode === 'quick-unlock' || mode === 'create' || recoveryWithDeviceKey;
  const controlsLocked = disabled || isSubmitting || isInspecting;

  const modeTitle =
    mode === 'inspecting'
      ? 'Checking this storage backend'
      : mode === 'create'
        ? 'Create your database'
        : mode === 'quick-unlock'
          ? 'Enter your quick unlock PIN'
          : mode === 'master-recovery'
            ? 'Recover access with master password'
            : mode === 'unsupported'
              ? 'Unsupported database state'
              : 'Inspection failed';

  const modeDescription =
    mode === 'inspecting'
      ? 'Reading storage metadata to pick the correct unlock flow.'
      : mode === 'create'
        ? 'Set master password and PIN, or create a passwordless database for this storage.'
        : mode === 'quick-unlock'
          ? 'Enter the 6-digit PIN for this device.'
          : mode === 'master-recovery'
            ? 'Unlock with master password. You can optionally register a new quick unlock PIN.'
            : mode === 'unsupported'
              ? 'This backend contains an unencrypted database. This screen supports encrypted flows only.'
              : 'Storage inspection failed. Try re-scanning after checking storage settings.';

  const submitLabel =
    mode === 'create'
      ? 'Create Encrypted Database'
      : mode === 'quick-unlock'
        ? 'Unlock Database'
        : mode === 'master-recovery'
          ? recoveryWithDeviceKey
            ? 'Unlock and Save PIN'
            : 'Unlock with Master Password'
          : 'Continue';

  const validateForm = () => {
    if (!status) {
      return 'Database status is unavailable. Run re-scan and try again.';
    }

    if (requiresMaster && masterPassword.length === 0) {
      return 'Enter your master password.';
    }

    if (requiresPin && !isCompletePin(quickUnlockPinDigits)) {
      return `Enter all ${PIN_LENGTH} PIN digits.`;
    }

    return null;
  };

  const handleCreateWithoutPassword = async () => {
    if (controlsLocked || !status || mode !== 'create') {
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      await onSubmit(mapToUnlockOperation({ mode: 'create-no-crypto' }));

      setMasterPassword('');
      setQuickUnlockPinDigits(createEmptyPin());
      await inspect();
    } catch (error) {
      setSubmitError(getSubmitErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (controlsLocked || !status || !formVisible) {
      return;
    }

    const validationError = validateForm();
    if (validationError) {
      setSubmitError(validationError);
      return;
    }

    const pinValue = requiresPin ? pinToString(quickUnlockPinDigits) : null;

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      if (mode === 'create') {
        await onSubmit(
          mapToUnlockOperation({
            mode,
            masterPassword,
            quickUnlockPin: pinValue ?? '',
          })
        );
      }

      if (mode === 'quick-unlock') {
        await onSubmit(
          mapToUnlockOperation({
            mode,
            quickUnlockPin: pinValue ?? '',
          })
        );
      }

      if (mode === 'master-recovery') {
        if (recoveryWithDeviceKey) {
          await onSubmit(
            mapToUnlockOperation({
              mode,
              masterPassword,
              quickUnlockPin: pinValue ?? '',
            })
          );
        } else {
          await onSubmit(
            mapToUnlockOperation({
              mode: 'master-unlock',
              masterPassword,
            })
          );
        }
      }

      setMasterPassword('');
      setQuickUnlockPinDigits(createEmptyPin());
      await inspect();
    } catch (error) {
      setSubmitError(getSubmitErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formRef = useRef<HTMLFormElement | null>(null);
  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('*[autofocus]')?.focus();
  }, [formVisible]);

  if (mode === 'inspecting') {
    return null;
  }

  return (
    <section
      className={classes(
        `relative isolate mx-auto overflow-hidden rounded-[2rem] border border-default-200
        bg-default-100 p-6 shadow-ui-soft sm:p-8`,
        className
      )}
    >
      <div
        className="pointer-events-none absolute -top-20 -left-20 h-52 w-52 rounded-full
          bg-default-300/40 blur-3xl"
      />
      <div
        className="pointer-events-none absolute -right-24 -bottom-20 h-56 w-56 rounded-full
          bg-default-300/35 blur-3xl"
      />

      <div className="relative">
        <header className="mb-6 flex flex-wrap items-center gap-4 sm:mb-7">
          <div className="max-w-2xl space-y-2">
            <p className="text-xs font-semibold tracking-[0.2em] text-default-500 uppercase">
              Open Database
            </p>
            <h2 className="text-2xl font-semibold tracking-tight text-default-900 sm:text-3xl">
              {modeTitle}
            </h2>
            <p className="text-sm leading-relaxed text-default-600">{modeDescription}</p>
          </div>
        </header>

        {mode === 'inspection-error' && inspectError && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {inspectError}
          </p>
        )}

        {mode === 'unsupported' && (
          <p
            className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm
              text-amber-800"
          >
            This backend appears to host an unencrypted database.
          </p>
        )}

        {formVisible && (
          <form
            ref={formRef}
            onSubmit={handleSubmit}
            className="mt-7 space-y-5 rounded-2xl border border-default-300 bg-surface/90 p-5 pt-1
              shadow-ui-medium sm:p-6 sm:pt-2"
          >
            {mode === 'master-recovery' && (
              <div className="flex flex-col">
                <p
                  className="mt-2 mb-3 ml-1 text-xs font-semibold tracking-[0.14em] text-default-600
                    uppercase"
                >
                  Unlock Mode
                </p>
                <div
                  className="grid grid-cols-2 gap-1 rounded-xl border border-default-200
                    bg-default-100 p-1"
                >
                  <button
                    type="button"
                    onClick={() => setSaveDeviceKeyOnRecovery(false)}
                    disabled={controlsLocked}
                    className={classes(
                      `rounded-lg px-3 py-2 text-xs font-semibold tracking-wide uppercase
                      transition-colors duration-200 disabled:cursor-not-allowed`,
                      !saveDeviceKeyOnRecovery
                        ? 'bg-surface text-default-900 shadow-ui-soft'
                        : `text-default-500 hover:bg-surface/70 hover:text-default-800
                          disabled:hover:bg-transparent disabled:hover:text-default-500`
                    )}
                  >
                    Unlock Only
                  </button>
                  <button
                    type="button"
                    onClick={() => setSaveDeviceKeyOnRecovery(true)}
                    disabled={controlsLocked}
                    className={classes(
                      `rounded-lg px-3 py-2 text-xs font-semibold tracking-wide uppercase
                      transition-colors duration-200 disabled:cursor-not-allowed`,
                      saveDeviceKeyOnRecovery
                        ? 'bg-surface text-default-900 shadow-ui-soft'
                        : `text-default-500 hover:bg-surface/70 hover:text-default-800
                          disabled:hover:bg-transparent disabled:hover:text-default-500`
                    )}
                  >
                    Save PIN
                  </button>
                </div>
                <p className="mt-1 ml-1 text-xs leading-relaxed text-default-500">
                  {saveDeviceKeyOnRecovery
                    ? 'Adds a new device key so next unlock can use quick unlock PIN.'
                    : 'Unlocks with master password only and keeps device key registry unchanged.'}
                </p>
              </div>
            )}

            {requiresMaster && (
              <label
                className="text-md my-12 block flex flex-col items-center space-y-2 font-semibold
                  text-default-800"
                htmlFor={`${baseId}-master`}
              >
                <span>Master Password</span>
                <input
                  id={`${baseId}-master`}
                  type="password"
                  value={masterPassword}
                  onChange={event => setMasterPassword(event.target.value)}
                  autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
                  autoFocus
                  disabled={controlsLocked}
                  placeholder="Enter your master password"
                  className="mt-6 w-[324px] rounded-xl border border-default-300 bg-default-50 px-3
                    py-2.5 text-sm font-normal text-default-800 transition-colors duration-200
                    outline-none placeholder:text-default-400 focus:border-default-500
                    focus:bg-surface disabled:cursor-not-allowed disabled:border-default-200
                    disabled:bg-default-100"
                />
              </label>
            )}

            {requiresPin && (
              <PinInput
                idPrefix={`${baseId}-pin`}
                label={mode === 'master-recovery' ? 'New Quick Unlock PIN' : 'Quick Unlock PIN'}
                hint="PIN is local to this device and unlocks your database without re-entering the master password."
                autoFocus
                digits={quickUnlockPinDigits}
                disabled={controlsLocked}
                onChange={setQuickUnlockPinDigits}
              />
            )}

            {submitError && (
              <p
                className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm
                  text-red-700"
              >
                {submitError}
              </p>
            )}

            <button
              type="submit"
              disabled={controlsLocked}
              className="inline-flex w-full items-center justify-center rounded-xl bg-primary px-4
                py-3 text-sm font-semibold text-primary-foreground shadow-ui-strong
                transition-colors duration-200 hover:bg-primary-hover disabled:cursor-not-allowed
                disabled:bg-default-300"
            >
              {isSubmitting ? 'Applying...' : submitLabel}
            </button>

            {mode === 'create' && (
              <>
                <div className="flex items-center gap-3">
                  <span className="h-px flex-1 bg-default-200" />
                  <span
                    className="text-[11px] font-semibold tracking-[0.2em] text-default-500
                      uppercase"
                  >
                    Or
                  </span>
                  <span className="h-px flex-1 bg-default-200" />
                </div>

                <button
                  type="button"
                  onClick={handleCreateWithoutPassword}
                  disabled={controlsLocked}
                  className="inline-flex w-full items-center justify-center rounded-xl border
                    border-default-300 bg-surface px-4 py-3 text-sm font-semibold text-default-700
                    transition-colors duration-200 hover:border-default-400 hover:bg-default-100
                    disabled:cursor-not-allowed disabled:border-default-200 disabled:bg-default-100
                    disabled:text-default-400"
                >
                  Create Database Without Password
                </button>
              </>
            )}
          </form>
        )}
      </div>
    </section>
  );
}
