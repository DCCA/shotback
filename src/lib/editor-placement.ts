const GAP = 8;

/**
 * Where the inline comment editor goes for a selected shape: just below it and
 * left-aligned, flipped above when it would fall off the bottom, clamped so it
 * never leaves the image. Keeps the editor off the shape's own outline, which
 * anchoring it on the shape's corner did not.
 */
export function placeInlineEditor(
  bounds: { x: number; y: number; width: number; height: number },
  image: { width: number; height: number },
  editor: { width: number; height: number }
): { x: number; y: number } {
  const x = Math.max(10, Math.min(bounds.x, image.width - editor.width - 10));
  const below = bounds.y + bounds.height + GAP;
  const y =
    below + editor.height <= image.height - 10
      ? below
      : Math.max(10, bounds.y - GAP - editor.height);
  return { x, y };
}
