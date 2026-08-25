import { useEffect, useState } from "react";

/**
 * Two-step confirm for a destructive action, inline rather than through
 * `window.confirm`: arm a key, the UI swaps to a confirm/cancel pair, and the
 * arming disarms itself after `ms` so a forgotten prompt cannot sit there
 * waiting to be hit by the next click.
 *
 * The key is whatever identifies what is armed - `true` where there is one
 * button, the row's id where there are many - so one armed row disarms any
 * other by construction.
 */
export function useTimedConfirm<T>(ms: number): [T | null, (armed: T | null) => void] {
  const [armed, setArmed] = useState<T | null>(null);

  useEffect(() => {
    if (armed === null) return;
    const timer = setTimeout(() => setArmed(null), ms);
    return () => clearTimeout(timer);
  }, [armed, ms]);

  return [armed, setArmed];
}
