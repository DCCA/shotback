/**
 * Pure keyboard-navigation helpers for the custom listbox Select.
 * Kept free of React/DOM so the interaction rules can be unit tested.
 */

export type ListboxKey = "ArrowDown" | "ArrowUp" | "Home" | "End";

/**
 * Compute the next active option index for a listbox key press. `current` may be
 * -1 (nothing active yet). Movement is clamped to the list (no wrap-around), which
 * matches native <select> behaviour.
 */
export function getNextIndex(current: number, count: number, key: ListboxKey): number {
  if (count <= 0) return -1;

  switch (key) {
    case "ArrowDown":
      return current < 0 ? 0 : Math.min(current + 1, count - 1);
    case "ArrowUp":
      return current < 0 ? count - 1 : Math.max(current - 1, 0);
    case "Home":
      return 0;
    case "End":
      return count - 1;
  }
}

/**
 * Typeahead match: find the next option whose label starts with `query`
 * (case-insensitive), searching circularly from index `from` (inclusive).
 * Returns -1 when nothing matches or the query is empty.
 */
export function matchTypeahead(labels: string[], query: string, from: number): number {
  const q = query.trim().toLowerCase();
  if (!q || labels.length === 0) return -1;

  const start = from < 0 ? 0 : from % labels.length;
  for (let i = 0; i < labels.length; i += 1) {
    const index = (start + i) % labels.length;
    if (labels[index].toLowerCase().startsWith(q)) return index;
  }
  return -1;
}
