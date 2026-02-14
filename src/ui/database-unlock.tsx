import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { inspectClxDBStatus } from '@/core/utils/inspect';
import {
  PIN_LENGTH,
  PinInput,
  createEmptyPin,
  isCompletePin,
  pinToString,
} from './common/pin-input';
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
        `border-default-200 bg-default-50/85 relative isolate mx-auto w-full max-w-4xl
        overflow-hidden rounded-[2rem] border p-6 shadow-[0_34px_70px_-48px_rgba(24,24,27,0.45)]
        backdrop-blur-sm sm:p-8`,
        className
      )}
    >
      <div
        className="bg-default-300/40 pointer-events-none absolute -top-20 -left-20 h-52 w-52
          rounded-full blur-3xl"
      />
      <div
        className="pointer-events-none absolute -right-24 -bottom-20 h-56 w-56 rounded-full
          bg-stone-300/35 blur-3xl"
      />

      <div className="relative">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4 sm:mb-7">
          <div className="max-w-2xl space-y-2">
            <p className="text-default-500 text-xs font-semibold tracking-[0.2em] uppercase">
              Database Encryption
            </p>
            <h2 className="text-default-900 text-2xl font-semibold tracking-tight sm:text-3xl">
              {modeTitle}
            </h2>
            <p className="text-default-600 text-sm leading-relaxed">{modeDescription}</p>
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={controlsLocked}
            className="border-default-300 text-default-700 hover:border-default-400
              hover:bg-default-100 disabled:border-default-200 disabled:bg-default-100
              disabled:text-default-400 inline-flex items-center justify-center rounded-xl border
              bg-white px-3.5 py-2 text-xs font-semibold tracking-wide uppercase transition-colors
              duration-200 disabled:cursor-not-allowed"
          >
            Re-scan
          </button>
        </header>

        {mode === 'inspecting' && (
          <div
            className="border-default-200 bg-default-100 text-default-600 inline-flex items-center
              gap-2 rounded-lg border px-3 py-2 text-sm"
          >
            <span className="bg-default-500 h-2.5 w-2.5 animate-pulse rounded-full" />
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
            className="border-default-300 mt-7 space-y-5 rounded-2xl border bg-white/90 p-5 pt-1
              shadow-[0_24px_45px_-36px_rgba(24,24,27,0.7)] sm:p-6 sm:pt-2"
          >
            {requiresMaster && (
              <label
                className="text-md text-default-800 my-12 block flex flex-col items-center space-y-2
                  font-semibold"
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
                  className="border-default-300 bg-default-50 text-default-800
                    placeholder:text-default-400 focus:border-default-500
                    disabled:border-default-200 disabled:bg-default-100 mt-6 w-[324px] rounded-xl
                    border px-3 py-2.5 text-sm font-normal transition-colors duration-200
                    outline-none focus:bg-white disabled:cursor-not-allowed"
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
              className="bg-primary text-default-100 hover:bg-primary-hover disabled:bg-default-300
                inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm
                font-semibold shadow-[0_14px_30px_-22px_rgba(24,24,27,0.95)] transition-colors
                duration-200 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Applying...' : submitLabel}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
