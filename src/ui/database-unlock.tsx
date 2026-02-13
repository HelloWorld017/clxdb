import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { inspectClxDBStatus } from '@/core/utils/inspect';
import type { ClxDBStatus } from '@/core/utils/inspect';
import type { ClxDBClientOptions, StorageBackend } from '@/types';
import type { ClipboardEvent, KeyboardEvent, SubmitEvent } from 'react';

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
  title?: string;
  description?: string;
}

type UnlockMode =
  | 'inspecting'
  | 'create'
  | 'quick-unlock'
  | 'master-recovery'
  | 'unsupported'
  | 'inspection-error';

type PinInputProps = {
  idPrefix: string;
  label: string;
  hint: string;
  digits: string[];
  disabled: boolean;
  onChange: (next: string[]) => void;
};

const PIN_LENGTH = 6;
const PIN_SLOT_KEYS = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'] as const;

const classes = (...values: Array<string | null | undefined | false>) =>
  values.filter(Boolean).join(' ');

const createEmptyPin = () => Array.from({ length: PIN_LENGTH }, () => '');

const getInspectErrorMessage = (error: unknown) => {
  const fallback = 'Unable to inspect storage metadata. Check connectivity and try again.';
  return error instanceof Error ? error.message : fallback;
};

const getSubmitErrorMessage = (error: unknown) => {
  const fallback = 'Unlock request failed. Verify credentials and retry.';
  return error instanceof Error ? error.message : fallback;
};

const pinToString = (digits: string[]) => digits.join('');

const isCompletePin = (digits: string[]) =>
  digits.length === PIN_LENGTH && digits.every(digit => /^\d$/.test(digit));

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

const PinInput = ({ idPrefix, label, hint, digits, disabled, onChange }: PinInputProps) => {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  const focusIndex = (index: number) => {
    const input = refs.current[index];
    input?.focus();
    input?.select();
  };

  const updateDigit = (index: number, value: string) => {
    const next = [...digits];
    next[index] = value;
    onChange(next);
  };

  const handleChange = (index: number, rawValue: string) => {
    const nextDigit = rawValue.replace(/\D/g, '').slice(-1);
    updateDigit(index, nextDigit);

    if (nextDigit && index < PIN_LENGTH - 1) {
      focusIndex(index + 1);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      focusIndex(index - 1);
      return;
    }

    if (event.key === 'ArrowRight' && index < PIN_LENGTH - 1) {
      event.preventDefault();
      focusIndex(index + 1);
      return;
    }

    if (event.key === 'Backspace' && digits[index] === '' && index > 0) {
      event.preventDefault();
      updateDigit(index - 1, '');
      focusIndex(index - 1);
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>, startIndex: number) => {
    const pasted = event.clipboardData
      .getData('text')
      .replace(/\D/g, '')
      .slice(0, PIN_LENGTH - startIndex);

    if (!pasted) {
      return;
    }

    event.preventDefault();

    const next = [...digits];
    pasted.split('').forEach((digit, offset) => {
      next[startIndex + offset] = digit;
    });
    onChange(next);

    const focusTarget = Math.min(startIndex + pasted.length, PIN_LENGTH - 1);
    focusIndex(focusTarget);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-zinc-800" htmlFor={`${idPrefix}-0`}>
          {label}
        </label>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {PIN_SLOT_KEYS.map((slotKey, index) => (
          <input
            key={`${idPrefix}-${slotKey}`}
            ref={element => {
              refs.current[index] = element;
            }}
            id={`${idPrefix}-${index}`}
            type="text"
            value={digits[index]}
            disabled={disabled}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={1}
            aria-label={`${label} digit ${index + 1}`}
            onChange={event => handleChange(index, event.target.value)}
            onKeyDown={event => handleKeyDown(event, index)}
            onPaste={event => handlePaste(event, index)}
            className="h-12 w-11 rounded-xl border border-zinc-300 bg-zinc-50 text-center text-lg
              font-semibold tracking-[0.08em] text-zinc-900 transition-colors duration-200
              outline-none focus:border-zinc-500 focus:bg-white disabled:cursor-not-allowed
              disabled:border-zinc-200 disabled:bg-zinc-100 disabled:text-zinc-400"
          />
        ))}
      </div>

      <p className="text-xs text-zinc-500">{hint}</p>
    </div>
  );
};

export function DatabaseUnlock({
  storage,
  onSubmit,
  options,
  onStatusChange,
  className,
  disabled = false,
  title = 'Database Access Control',
  description = 'Inspect this storage backend and continue with the correct unlock path for your encrypted ClxDB instance.',
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
        <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold tracking-[0.18em] text-zinc-500 uppercase">
              Encryption Onboarding
            </p>
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
              {title}
            </h2>
            <p className="max-w-2xl text-sm leading-relaxed text-zinc-600">{description}</p>
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

        <div className="rounded-2xl border border-zinc-200 bg-white/75 p-5 sm:p-6">
          <h3 className="text-xl font-semibold tracking-tight text-zinc-900">{modeTitle}</h3>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600">{modeDescription}</p>

          {mode === 'inspecting' && (
            <div
              className="mt-5 inline-flex items-center gap-2 rounded-lg border border-zinc-200
                bg-zinc-100 px-3 py-2 text-sm text-zinc-600"
            >
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-zinc-500" />
              Inspecting storage state...
            </div>
          )}

          {mode === 'inspection-error' && inspectError && (
            <p
              className="mt-5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm
                text-red-700"
            >
              {inspectError}
            </p>
          )}

          {mode === 'unsupported' && (
            <p
              className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm
                text-amber-800"
            >
              This backend appears to host an unencrypted database.
            </p>
          )}

          {formVisible && (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {requiresMaster && (
                <label
                  className="block text-sm font-semibold text-zinc-800"
                  htmlFor={`${baseId}-master`}
                >
                  Master Password
                  <input
                    id={`${baseId}-master`}
                    type="password"
                    value={masterPassword}
                    onChange={event => setMasterPassword(event.target.value)}
                    autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
                    disabled={controlsLocked}
                    placeholder="Enter your master password"
                    className="mt-2 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-2.5
                      text-sm text-zinc-800 transition-colors duration-200 outline-none
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
                className="inline-flex w-full items-center justify-center rounded-xl bg-zinc-900
                  px-4 py-2.5 text-sm font-semibold text-zinc-100 transition-colors duration-200
                  hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
              >
                {isSubmitting ? 'Applying...' : submitLabel}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
