import { useRef, useState } from 'react';
import { classes } from '@/utils/classes';
import type { ChangeEvent, KeyboardEvent, SyntheticEvent } from 'react';

export interface PinInputProps {
  idPrefix: string;
  label: string;
  hint: string;
  digits: string[];
  hidden?: boolean;
  disabled?: boolean;
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

const HiddenIcon = () => (
  <svg viewBox="0 0 10 10" width="1em" height="1em" xmlns="http://www.w3.org/2000/svg">
    <circle cx="5" cy="5" r="3" fill="currentColor" />
  </svg>
);

export const PinInput = ({
  idPrefix,
  label,
  hint,
  digits,
  hidden = true,
  disabled = false,
  className,
  onChange,
}: PinInputProps) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [selectionIndex, setSelectionIndex] = useState(0);

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
      <div className="flex items-center justify-between">
        <label className="text-md text-default-800 font-semibold" htmlFor={`${idPrefix}-input`}>
          {label}
        </label>
      </div>

      <div className="mt-6 mb-4">
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
                'border-default-300 bg-default-50 text-default-900 h-12 w-11 rounded-xl border',
                'flex items-center justify-center text-center text-lg font-semibold',
                'tracking-[0.08em] transition-colors duration-200',
                isFocused && activeIndex === index && 'border-default-500 bg-surface',
                'disabled:border-default-200 disabled:bg-default-100 disabled:text-default-400',
                'disabled:cursor-not-allowed'
              )}
            >
              {hidden ? digits[index] ? <HiddenIcon /> : '' : digits[index]}
            </button>
          ))}
        </div>
      </div>

      <p id={`${idPrefix}-hint`} className="text-default-500 max-w-[324px] text-center text-xs">
        {hint}
      </p>
    </div>
  );
};
