import { useEffect, useState, type ReactNode } from 'react';
import { DEFAULT_Z_INDEX } from '@/ui/constants';
import { classes } from '@/utils/classes';
import { Presence } from './presence';

export interface DialogFrameProps {
  className?: string;
  children: (close: () => void) => ReactNode;
  onClose: () => void;
  zIndex?: number;
}

function CloseIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <title>Close dialog</title>
      <path d="m6 6 12 12" />
      <path d="m18 6-12 12" />
    </svg>
  );
}

export function DialogFrame({ className, children, onClose, zIndex }: DialogFrameProps) {
  const [isOpen, setIsOpen] = useState(true);
  const close = () => setIsOpen(false);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      close();
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [close]);

  return (
    <Presence enterClassName="clx-dialog-enter" exitClassName="clx-dialog-exit" onExit={onClose}>
      {isOpen && (
        <div
          className={classes('fixed inset-0 flex items-center justify-center p-4', className)}
          style={{ zIndex: zIndex ?? DEFAULT_Z_INDEX }}
          role="presentation"
        >
          <button
            type="button"
            className="clx-dialog-backdrop absolute inset-0 cursor-default border-0 bg-black/10 p-0
              backdrop-blur-[8px]"
            onClick={close}
            aria-label="Close dialog"
          />
          <div
            className="clx-dialog-panel relative max-h-[calc(100vh-2rem)] w-full max-w-4xl
              overflow-auto"
            role="dialog"
            aria-modal="true"
          >
            <button
              type="button"
              aria-label="Close dialog"
              onClick={close}
              className="absolute top-4 right-4 z-10 inline-flex h-8 w-8 items-center justify-center
                rounded-[0.8rem] border
                border-[color-mix(in_srgb,var(--color-default-300)_75%,transparent)]
                bg-[color-mix(in_srgb,var(--color-surface)_92%,transparent)] p-0
                text-[var(--color-default-700)]"
            >
              <CloseIcon />
            </button>
            {children(close)}
          </div>
        </div>
      )}
    </Presence>
  );
}
