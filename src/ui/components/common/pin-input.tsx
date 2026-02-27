import { useEffect, useRef, useState } from 'react';
import { _t, useI18n } from '@/ui/i18n';
import { classes } from '@/utils/classes';
import type { ChangeEvent, KeyboardEvent, SyntheticEvent } from 'react';

export interface PinInputProps {
  idPrefix: string;
  label: string;
  hint: string;
  digits: string[];
  digitsHidden?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  onChange: (next: string[]) => void;
}

export const PIN_LENGTH = 6;
const PIN_SLOT_KEYS = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'] as const;

export const createEmptyPin = () => Array.from({ length: PIN_LENGTH }, () => '');

export const pinToString = (digits: string[]) => digits.join('');

export const isCompletePin = (digits: string[]) =>
  digits.length === PIN_LENGTH && digits.every(digit => /^\d$/.test(digit));

const sanitizePinValue = (value: string) => value.replace(/\D/g, '').slice(0, PIN_LENGTH);

const getSelectionRange = (index: number, valueLength: number) => {
  const start = Math.max(0, Math.min(index, valueLength));
  const end = start < valueLength ? start + 1 : start;

  return { start, end };
};

const toPinDigits = (value: string) => {
  const next = createEmptyPin();

  sanitizePinValue(value)
    .split('')
    .forEach((digit, index) => {
      next[index] = digit;
    });

  return next;
};

const HiddenDigitIcon = () => (
  <svg
    viewBox="0 0 10 10"
    width="1em"
    height="1em"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    focusable="false"
  >
    <circle cx="5" cy="5" r="3" fill="currentColor" />
  </svg>
);

const ShowIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <title>
      <_t>pinInput.show</_t>
    </title>
    <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const HideIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <title>
      <_t>pinInput.hide</_t>
    </title>
    <path d="m15 18-.722-3.25" />
    <path d="M2 8a10.645 10.645 0 0 0 20 0" />
    <path d="m20 15-1.726-2.05" />
    <path d="m4 15 1.726-2.05" />
    <path d="m9 18 .722-3.25" />
  </svg>
);

export const PinInput = ({
  idPrefix,
  label,
  hint,
  digits,
  digitsHidden = true,
  disabled = false,
  autoFocus = false,
  className,
  onChange,
}: PinInputProps) => {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [isHidden, setIsHidden] = useState(digitsHidden);
  const [selectionIndex, setSelectionIndex] = useState(0);

  useEffect(() => {
    setIsHidden(digitsHidden);
  }, [digitsHidden]);

  const pinValue = sanitizePinValue(pinToString(digits));
  const clampedSelectionIndex = Math.min(selectionIndex, pinValue.length);
  const activeIndex = Math.min(clampedSelectionIndex, PIN_LENGTH - 1);

  const setInputSelection = (
    input: HTMLInputElement,
    index: number,
    valueLength: number,
    shouldFocus = false
  ) => {
    const { start, end } = getSelectionRange(index, valueLength);

    if (shouldFocus) {
      input.focus();
    }

    if (input.selectionStart !== start || input.selectionEnd !== end) {
      input.setSelectionRange(start, end);
    }

    setSelectionIndex(start);
  };

  useEffect(() => {
    if (!autoFocus || disabled) {
      return;
    }

    const input = inputRef.current;
    if (!input) {
      return;
    }

    const { start, end } = getSelectionRange(pinValue.length, pinValue.length);
    input.focus();
    input.setSelectionRange(start, end);
    setSelectionIndex(start);
  }, [autoFocus, disabled, pinValue.length]);

  const setCaretIndex = (index: number) => {
    const input = inputRef.current;
    if (!input || disabled) {
      return;
    }

    setInputSelection(input, index, pinValue.length, true);
  };

  const syncSelectionIndex = (event: SyntheticEvent<HTMLInputElement>) => {
    const { currentTarget } = event;
    const valueLength = currentTarget.value.length;
    const nextIndex = currentTarget.selectionStart ?? valueLength;

    setInputSelection(currentTarget, nextIndex, valueLength);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const sanitized = sanitizePinValue(event.currentTarget.value);
    onChange(toPinDigits(sanitized));

    const nextIndex = Math.min(
      event.currentTarget.selectionStart ?? sanitized.length,
      sanitized.length
    );
    setInputSelection(event.currentTarget, nextIndex, sanitized.length);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }

    event.preventDefault();
    const valueLength = event.currentTarget.value.length;
    const currentIndex = Math.max(
      0,
      Math.min(event.currentTarget.selectionStart ?? valueLength, valueLength)
    );
    const nextIndex =
      event.key === 'ArrowLeft'
        ? Math.max(0, currentIndex - 1)
        : Math.min(valueLength, currentIndex + 1);

    setInputSelection(event.currentTarget, nextIndex, valueLength);
  };

  return (
    <div className={classes('my-12 flex flex-col items-center space-y-2', className)}>
      <div className="flex items-center gap-3">
        <label className="text-md font-semibold text-default-800" htmlFor={`${idPrefix}-input`}>
          {label}
        </label>

        <button
          type="button"
          onMouseDown={event => {
            event.preventDefault();
          }}
          onClick={() => setIsHidden(value => !value)}
          aria-label={isHidden ? t('pinInput.showAria') : t('pinInput.hideAria')}
          aria-pressed={!isHidden}
          tabIndex={-1}
          className="rounded-md px-1 py-0.5 font-semibold text-default-500 transition-colors
            duration-200 hover:text-default-700 focus-visible:ring-2 focus-visible:ring-primary/40
            focus-visible:outline-none"
        >
          {isHidden ? <HideIcon /> : <ShowIcon />}
        </button>
      </div>

      <div className="relative mt-6 mb-4">
        <input
          ref={inputRef}
          id={`${idPrefix}-input`}
          type="text"
          value={pinValue}
          disabled={disabled}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={PIN_LENGTH}
          aria-label={label}
          aria-describedby={`${idPrefix}-hint`}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onClick={syncSelectionIndex}
          onFocus={event => {
            setIsFocused(true);
            syncSelectionIndex(event);
          }}
          onBlur={() => {
            setIsFocused(false);
          }}
          onKeyUp={syncSelectionIndex}
          onSelect={syncSelectionIndex}
          className="sr-only"
        />

        <div className="flex items-center gap-2 sm:gap-3">
          {PIN_SLOT_KEYS.map((slotKey, index) => (
            <button
              key={`${idPrefix}-${slotKey}`}
              type="button"
              tabIndex={-1}
              disabled={disabled}
              onMouseDown={event => {
                event.preventDefault();
                setCaretIndex(index);
              }}
              className={classes(
                `flex h-12 w-11 cursor-text items-center justify-center rounded-xl border
                border-default-300 bg-default-50 text-center text-lg font-semibold tracking-[0.08em]
                text-default-900 transition-colors duration-200`,
                isFocused && activeIndex === index && 'border-primary/50 bg-surface',
                `disabled:cursor-not-allowed disabled:border-default-200 disabled:bg-default-100
                disabled:text-default-400`
              )}
            >
              {isHidden ? digits[index] ? <HiddenDigitIcon /> : '' : digits[index]}
            </button>
          ))}
        </div>
      </div>

      <p id={`${idPrefix}-hint`} className="max-w-[324px] text-center text-xs text-default-500">
        {hint}
      </p>
    </div>
  );
};
