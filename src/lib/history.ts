/**
 * Undo/redo stack. Pure and generic: each entry is a whole snapshot of the
 * edited value, so the editor never has to model inverse operations.
 */
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

/** No-op when `next` is the same reference, so double commits are harmless. */
export function commit<T>(h: History<T>, next: T, limit = 100): History<T> {
  if (Object.is(next, h.present)) return h;
  const past = [...h.past, h.present];
  return {
    past: past.length > limit ? past.slice(past.length - limit) : past,
    present: next,
    future: []
  };
}

export function undo<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h;
  return {
    past: h.past.slice(0, -1),
    present: h.past[h.past.length - 1],
    future: [h.present, ...h.future]
  };
}

export function redo<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
}
