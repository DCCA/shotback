/**
 * Pure description of the element under an annotation. It works over a
 * structural `ElementLike` instead of the DOM's `Element`, so it runs (and unit
 * tests) in plain Node: `src/content.ts` is the only place that adapts a real
 * element into this shape. The React component chain cannot be read here - see
 * `readFiberComponents` in `src/lib/capture.ts`.
 */
export interface ElementLike {
  tagName: string;
  id: string;
  classList: string[];
  parent: ElementLike | null;
  /** 1-based position among same-tag siblings. */
  indexOfType: number;
  siblingsOfTypeCount: number;
  /** Only what the context needs: `role`, `data-testid`. */
  attributes: Record<string, string>;
}

/** Levels kept in a path: enough to locate an element, short enough to read. */
const MAX_PATH_DEPTH = 5;
/** Classes kept per segment: utility-CSS pages have dozens of them. */
const MAX_CLASSES_PER_SEGMENT = 2;

function segment(el: ElementLike): string {
  if (el.id) return `#${el.id}`;

  const classes = el.classList
    .slice(0, MAX_CLASSES_PER_SEGMENT)
    .map((name) => `.${name}`)
    .join("");
  const nth = el.siblingsOfTypeCount > 1 ? `:nth-of-type(${el.indexOfType})` : "";

  return `${el.tagName.toLowerCase()}${classes}${nth}`;
}

/**
 * An id-anchored, class-annotated, `nth-of-type` chain, at most five levels
 * deep: `#pricing > div.card:nth-of-type(2) > button.cta`. An id ends the walk
 * because it already identifies the subtree on its own.
 */
export function cssPath(el: ElementLike): string {
  const parts: string[] = [];

  let node: ElementLike | null = el;
  while (node && parts.length < MAX_PATH_DEPTH) {
    parts.unshift(segment(node));
    if (node.id) break;
    node = node.parent;
  }

  return parts.join(" > ");
}
