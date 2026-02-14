import { useRef } from 'react';
import { classes } from '@/utils/classes';
import type { ClipboardEvent, KeyboardEvent } from 'react';

export interface PinInputProps {
  idPrefix: string;
  label: string;
  hint: string;
  digits: string[];
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

export const PinInput = ({
  idPrefix,
  label,
  hint,
  digits,
  disabled = false,
  className,
  onChange,
}: PinInputProps) => {
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
    <div className={classes('my-12 flex flex-col items-center space-y-2', className)}>
      <div className="flex items-center justify-between">
        <label className="text-md text-default-800 font-semibold" htmlFor={`${idPrefix}-0`}>
          {label}
        </label>
      </div>

      <div className="mt-6 mb-4 flex items-center gap-2 sm:gap-3">
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
            className="border-default-300 bg-default-50 text-default-900 focus:border-default-500
              disabled:border-default-200 disabled:bg-default-100 disabled:text-default-400
              focus:bg-surface h-12 w-11 rounded-xl border text-center text-lg font-semibold
              tracking-[0.08em] transition-colors duration-200 outline-none
              disabled:cursor-not-allowed"
          />
        ))}
      </div>

      <p className="text-default-500 max-w-[324px] text-center text-xs">{hint}</p>
    </div>
  );
};
