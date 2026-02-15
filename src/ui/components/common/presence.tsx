import { cloneElement, isValidElement, useEffect, useRef, useState } from 'react';
import { classes } from '@/utils/classes';
import type { AnimationEventHandler, ReactElement, TransitionEventHandler } from 'react';

export type PresenceState = 'enter' | 'exit';

type PresenceElementProps = {
  'className'?: string;
  'onAnimationEnd'?: AnimationEventHandler<HTMLElement>;
  'onTransitionEnd'?: TransitionEventHandler<HTMLElement>;
  'data-presence'?: PresenceState;
};

type PresenceChild = ReactElement | false | null | undefined;

interface PresenceProps {
  children: PresenceChild;
  exitDuration?: number;
  maxExitDuration?: number;
  enterClassName?: string;
  exitClassName?: string;
}

const resolveElement = (child: PresenceChild): ReactElement<PresenceElementProps> | null => {
  if (child && isValidElement<PresenceElementProps>(child)) {
    return child;
  }

  return null;
};

export function Presence({
  children,
  exitDuration = 200,
  maxExitDuration,
  enterClassName,
  exitClassName,
}: PresenceProps) {
  const resolvedMaxExitDuration = maxExitDuration ?? exitDuration;
  const [mountedChild, setMountedChild] = useState<ReactElement<PresenceElementProps> | null>(() =>
    resolveElement(children)
  );
  const [state, setState] = useState<PresenceState>(() => (children ? 'enter' : 'exit'));
  const finishExitRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const element = resolveElement(children);

    if (element) {
      finishExitRef.current = null;
      setMountedChild(element);
      setState('enter');
      return;
    }

    if (!mountedChild) {
      return;
    }

    setState('exit');

    let settled = false;
    const finishExit = () => {
      if (settled) {
        return;
      }

      settled = true;
      finishExitRef.current = null;
      setMountedChild(null);
    };

    finishExitRef.current = finishExit;
    const timeoutId = window.setTimeout(finishExit, resolvedMaxExitDuration);

    return () => {
      window.clearTimeout(timeoutId);
      if (finishExitRef.current === finishExit) {
        finishExitRef.current = null;
      }
    };
  }, [children, mountedChild, resolvedMaxExitDuration]);

  if (!mountedChild) {
    return null;
  }

  const child = mountedChild;
  const stateClassName = state === 'enter' ? enterClassName : exitClassName;
  const completeExit = () => {
    if (state !== 'exit') {
      return;
    }

    finishExitRef.current?.();
  };

  const handleAnimationEnd: AnimationEventHandler<HTMLElement> = event => {
    child.props.onAnimationEnd?.(event);
    if (event.target === event.currentTarget) {
      completeExit();
    }
  };

  const handleTransitionEnd: TransitionEventHandler<HTMLElement> = event => {
    child.props.onTransitionEnd?.(event);
    if (event.target === event.currentTarget) {
      completeExit();
    }
  };

  if (!stateClassName) {
    return cloneElement(child, {
      'data-presence': state,
      'onAnimationEnd': handleAnimationEnd,
      'onTransitionEnd': handleTransitionEnd,
    });
  }

  return cloneElement(child, {
    'className': classes(child.props.className, stateClassName),
    'data-presence': state,
    'onAnimationEnd': handleAnimationEnd,
    'onTransitionEnd': handleTransitionEnd,
  });
}
