import type { AnnotationTool } from "@/types/annotation";

/**
 * What the canvas does with a pointer drag. The four annotation tools (box,
 * arrow, text, redact) plus `crop`, which draws a region marquee instead of an
 * annotation - hence a separate type: nothing stored in an `Annotation` can
 * ever be a crop.
 */
export type EditorTool = AnnotationTool | "crop";

/**
 * A segment of the canvas tool palette: the five drawing tools plus `select`,
 * which is the editor's move mode rather than a tool of its own.
 */
export type PaletteTool = "select" | EditorTool;

export interface ToolSegment {
  value: PaletteTool;
  label: string;
  /** The single key that picks this segment, shown as a kbd suffix on it. */
  hotkey: string;
}

/** The palette, left to right. The one place the segment order is stated. */
export const TOOL_SEGMENTS: readonly ToolSegment[] = [
  { value: "select", label: "Select", hotkey: "V" },
  { value: "box", label: "Box", hotkey: "B" },
  { value: "arrow", label: "Arrow", hotkey: "A" },
  { value: "text", label: "Text", hotkey: "T" },
  { value: "redact", label: "Redact", hotkey: "R" },
  { value: "crop", label: "Crop", hotkey: "C" }
];

/**
 * The stroke colours the palette offers as swatches. Hex strings because they
 * are *data* - written into every annotation, the exported image and the saved
 * share - not Tailwind classes, and not themeable: an annotation drawn in red
 * must stay red in a share opened under the other theme.
 */
export const SWATCHES: readonly { value: string; label: string }[] = [
  { value: "#ef4444", label: "Red" },
  { value: "#f59e0b", label: "Amber" },
  { value: "#22c55e", label: "Green" },
  { value: "#3b82f6", label: "Blue" },
  { value: "#a855f7", label: "Purple" },
  { value: "#111827", label: "Ink" }
];

/** The colour a fresh editor draws in: the first swatch. */
export const DEFAULT_ANNOTATION_COLOR = SWATCHES[0].value;

/**
 * The lit segment, derived from the two fields the canvas actually reads, so
 * the palette can never disagree with the cursor. Move mode is Select whatever
 * drawing tool was last used - that tool comes back the moment Select is left.
 */
export function activeSegment(tool: EditorTool, interactionMode: "draw" | "move"): PaletteTool {
  return interactionMode === "move" ? "select" : tool;
}

/**
 * The segment a bare keypress picks, or `null` for anything else. Only single
 * characters are considered, so "Escape" and friends can never collide with a
 * tool letter.
 */
export function hotkeyTool(key: string): PaletteTool | null {
  if (key.length !== 1) return null;
  const lower = key.toLowerCase();
  return TOOL_SEGMENTS.find((segment) => segment.hotkey.toLowerCase() === lower)?.value ?? null;
}

/** True when `color` is not one of the swatches, so the custom disc is the active one. */
export function isCustomColor(color: string): boolean {
  return !SWATCHES.some((swatch) => swatch.value.toLowerCase() === color.toLowerCase());
}
