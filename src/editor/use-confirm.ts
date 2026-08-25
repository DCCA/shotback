import { useEffect, useRef, useState } from "react";
import type * as React from "react";

export interface TimedConfirm<T> {
  /** The key currently armed, or `null`. */
  armed: T | null;
  /** Arm a key, or pass `null` to disarm. */
  arm: (armed: T | null) => void;
  /**
   * Attach to the trigger button for `key`. The trigger unmounts while its
   * confirm pair is up, so this is what puts the keyboard back where it was
   * when the pair goes away - see the focus effect below.
   */
  triggerRef: (key: T) => React.RefObject<HTMLButtonElement> | undefined;
  /** Spread on the element wrapping the confirm pair: Escape disarms. */
  onKeyDown: (event: React.KeyboardEvent) => void;
  /**
   * Wrap the confirming action. The pair appears under the pointer that armed
   * it, so a double-click's second half lands on a button that was not there
   * when the user started pressing: anything inside `SETTLE_MS` of arming is
   * ignored, and the pair simply stays up waiting for a deliberate click.
   */
  onConfirm: (run: () => void) => () => void;
}

/**
 * How long a freshly armed confirm ignores activation. Long enough to outlast
 * a double-click (the platform threshold is ~500ms between presses, but the
 * hazard is the accidental second press, which lands far sooner), short enough
 * that a deliberate second click is never refused.
 */
const SETTLE_MS = 250;

/**
 * Two-step confirm for a destructive action, inline rather than through
 * `window.confirm`: arm a key, the UI swaps to a confirm/cancel pair, and the
 * arming disarms itself after `ms` so a forgotten prompt cannot sit there
 * waiting to be hit by the next click.
 *
 * The key is whatever identifies what is armed - `true` where there is one
 * button, the row's id where there are many - so one armed row disarms any
 * other by construction.
 *
 * The keyboard is handled here rather than at each call site, because the
 * hazard is the same at both: the pair replaces the trigger, so confirming,
 * cancelling or simply waiting out the timer unmounts whatever had focus and
 * drops the user on `document.body`.
 */
export function useTimedConfirm<T>(ms: number): TimedConfirm<T> {
  const [armed, setArmed] = useState<T | null>(null);
  const triggerNode = useRef<HTMLButtonElement>(null);
  // The key whose trigger is owed focus back. A ref, because it has to be
  // readable during the render that brings the trigger back - which is the
  // render that must attach `triggerNode` to it.
  const restoreKey = useRef<T | null>(null);
  const armedAt = useRef(0);

  const arm = (next: T | null): void => {
    if (next !== null) {
      restoreKey.current = next;
      armedAt.current = Date.now();
    }
    setArmed(next);
  };

  useEffect(() => {
    if (armed === null) return;
    const timer = setTimeout(() => setArmed(null), ms);
    return () => clearTimeout(timer);
  }, [armed, ms]);

  useEffect(() => {
    if (armed !== null || restoreKey.current === null) return;
    restoreKey.current = null;
    // Only when the pair took focus down with it. A timed revert while the
    // user is typing somewhere else must not yank the caret out of that field.
    if (document.activeElement === document.body) triggerNode.current?.focus();
  }, [armed]);

  return {
    armed,
    arm,
    triggerRef: (key) => (key === restoreKey.current ? triggerNode : undefined),
    onKeyDown: (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setArmed(null);
    },
    onConfirm: (run) => () => {
      if (Date.now() - armedAt.current < SETTLE_MS) return;
      setArmed(null);
      run();
    }
  };
}
