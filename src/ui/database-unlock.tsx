import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { inspectClxDBStatus } from '@/core/utils/inspect';
import { PIN_LENGTH, PinInput, createEmptyPin, isCompletePin, pinToString } from './pin-input';
import type { ClxDBStatus } from '@/core/utils/inspect';
import type { ClxDBClientOptions, StorageBackend } from '@/types';
import type { SubmitEvent } from 'react';

export type DatabaseUnlockSubmission =
  | {
      mode: 'create';
      masterPassword: string;
      quickUnlockPin: string;
      status: ClxDBStatus;
    }
  | {
      mode: 'quick-unlock';
      quickUnlockPin: string;
      status: ClxDBStatus;
    }
  | {
      mode: 'master-recovery';
      masterPassword: string;
      quickUnlockPin: string;
      status: ClxDBStatus;
    };

export interface DatabaseUnlockProps {
  storage: StorageBackend;
  onSubmit: (submission: DatabaseUnlockSubmission) => Promise<void> | void;
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

const classes = (...values: Array<string | null | undefined | false>) =>
  values.filter(Boolean).join(' ');

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
      onStatusChange?.(nextStatus);
    } catch (error) {
      if (sequence !== inspectionSequenceRef.current) {
        return;
      }

      setStatus(null);
      setMasterPassword('');
      setQuickUnlockPinDigits(createEmptyPin());
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
  const requiresMaster = mode === 'create' || mode === 'master-recovery';
  const requiresPin = formVisible;
  const controlsLocked = disabled || isSubmitting || isInspecting;

  const modeTitle =
    mode === 'inspecting'
      ? 'Checking this storage backend'
      : mode === 'create'
        ? 'Create your encrypted database'
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
        ? 'Set one master password and one 6-digit PIN to start using this storage.'
        : mode === 'quick-unlock'
          ? 'Enter the 6-digit PIN for this device.'
          : mode === 'master-recovery'
            ? 'Enter master password once, then set a new 6-digit PIN for this device.'
            : mode === 'unsupported'
              ? 'This backend contains an unencrypted database. This screen supports encrypted flows only.'
              : 'Storage inspection failed. Try re-scanning after checking storage settings.';

  const submitLabel =
    mode === 'create'
      ? 'Create Database'
      : mode === 'quick-unlock'
        ? 'Unlock Database'
        : mode === 'master-recovery'
          ? 'Unlock and Save PIN'
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

  const handleRefresh = () => {
    if (controlsLocked) {
      return;
    }

    void inspect();
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

    const pinValue = pinToString(quickUnlockPinDigits);

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      if (mode === 'create') {
        await onSubmit({
          mode,
          masterPassword,
          quickUnlockPin: pinValue,
          status,
        });
      }

      if (mode === 'quick-unlock') {
        await onSubmit({
          mode,
          quickUnlockPin: pinValue,
          status,
        });
      }

      if (mode === 'master-recovery') {
        await onSubmit({
          mode,
          masterPassword,
          quickUnlockPin: pinValue,
          status,
        });
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

  return (
    <section
      className={classes(
        `relative isolate mx-auto w-full max-w-4xl overflow-hidden rounded-[2rem] border
        border-zinc-200 bg-zinc-50/85 p-6 shadow-[0_34px_70px_-48px_rgba(24,24,27,0.45)]
        backdrop-blur-sm sm:p-8`,
        className
      )}
    >
      <div
        className="pointer-events-none absolute -top-20 -left-20 h-52 w-52 rounded-full
          bg-zinc-300/40 blur-3xl"
      />
      <div
        className="pointer-events-none absolute -right-24 -bottom-20 h-56 w-56 rounded-full
          bg-stone-300/35 blur-3xl"
      />

      <div className="relative">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4 sm:mb-7">
          <div className="max-w-2xl space-y-2">
            <p className="text-xs font-semibold tracking-[0.2em] text-zinc-500 uppercase">
              Database Encryption
            </p>
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
              {modeTitle}
            </h2>
            <p className="text-sm leading-relaxed text-zinc-600">{modeDescription}</p>
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={controlsLocked}
            className="inline-flex items-center justify-center rounded-xl border border-zinc-300
              bg-white px-3.5 py-2 text-xs font-semibold tracking-wide text-zinc-700 uppercase
              transition-colors duration-200 hover:border-zinc-400 hover:bg-zinc-100
              disabled:cursor-not-allowed disabled:border-zinc-200 disabled:bg-zinc-100
              disabled:text-zinc-400"
          >
            Re-scan
          </button>
        </header>

        {mode === 'inspecting' && (
          <div
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-100
              px-3 py-2 text-sm text-zinc-600"
          >
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-zinc-500" />
            Inspecting storage state...
          </div>
        )}

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
            onSubmit={handleSubmit}
            className="mt-7 space-y-5 rounded-2xl border border-zinc-300 bg-white/90 p-5 pt-1
              shadow-[0_24px_45px_-36px_rgba(24,24,27,0.7)] sm:p-6 sm:pt-2"
          >
            {requiresMaster && (
              <label
                className="text-md my-12 block flex flex-col items-center space-y-2 font-semibold
                  text-zinc-800"
                htmlFor={`${baseId}-master`}
              >
                <span>Master Password</span>
                <input
                  id={`${baseId}-master`}
                  type="password"
                  value={masterPassword}
                  onChange={event => setMasterPassword(event.target.value)}
                  autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
                  disabled={controlsLocked}
                  placeholder="Enter your master password"
                  className="mt-6 w-[324px] rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-2.5
                    text-sm font-normal text-zinc-800 transition-colors duration-200 outline-none
                    placeholder:text-zinc-400 focus:border-zinc-500 focus:bg-white
                    disabled:cursor-not-allowed disabled:border-zinc-200 disabled:bg-zinc-100"
                />
              </label>
            )}

            {requiresPin && (
              <PinInput
                idPrefix={`${baseId}-pin`}
                label={mode === 'master-recovery' ? 'New Quick Unlock PIN' : 'Quick Unlock PIN'}
                hint="PIN is local to this device and unlocks your database without re-entering the master password."
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
              className="inline-flex w-full items-center justify-center rounded-xl bg-zinc-900 px-4
                py-3 text-sm font-semibold text-zinc-100
                shadow-[0_14px_30px_-22px_rgba(24,24,27,0.95)] transition-colors duration-200
                hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              {isSubmitting ? 'Applying...' : submitLabel}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
