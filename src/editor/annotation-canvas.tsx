import * as React from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { moveAnnotation, uid } from "@/editor/annotation-geometry";
import { StatusToast } from "@/editor/status-toast";
import { ToolPalette } from "@/editor/tool-palette";
import type { EditorState } from "@/editor/use-editor-state";
import {
  arrowHeadPoints,
  HIGHLIGHT_ALPHA,
  HIGHLIGHT_EDGE_WIDTH,
  pixelateRegion,
  redactionBounds
} from "@/lib/annotate";
import {
  applyBoxResizeDelta,
  BOX_RESIZE_HANDLES,
  getBoxHandlePosition,
  getBoxResizeCursor,
  type BoxResizeHandle
} from "@/lib/boxResize";
import { applyCrop, clampCrop, cropViewMetrics, MIN_CROP_SIZE, type Rect } from "@/lib/crop";
import {
  ARROW_KEYS,
  KEYBOARD_NUDGE,
  onImage,
  placementArrow,
  placementRect,
  resizeRect
} from "@/lib/keyboard-shapes";
import { placeInlineEditor } from "@/lib/editor-placement";
import {
  annotationBounds,
  canvasScale,
  numberAnnotations,
  redactions,
  viewPins
} from "@/lib/numbering";
import { hotkeyTool } from "@/lib/tool-palette";
import type { Annotation, BoxAnnotation, RectAnnotation } from "@/types/annotation";

interface DraftShape {
  xStart: number;
  yStart: number;
  xCurrent: number;
  yCurrent: number;
}

/** An SVG `points` attribute from a pen path. */
function polylinePoints(points: Array<{ x: number; y: number }>): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

/** A drag, normalised to a rect: drawn in any direction, stored top-left first. */
function draftRect(draft: DraftShape): Rect {
  return {
    x: Math.min(draft.xStart, draft.xCurrent),
    y: Math.min(draft.yStart, draft.yCurrent),
    width: Math.abs(draft.xCurrent - draft.xStart),
    height: Math.abs(draft.yCurrent - draft.yStart)
  };
}

interface DragState {
  id: string;
  startX: number;
  startY: number;
  original: Annotation;
}

interface ResizeState {
  id: string;
  handle: BoxResizeHandle;
  pointerX: number;
  pointerY: number;
  box: Pick<BoxAnnotation, "x" | "y" | "width" | "height">;
}

/** The same gesture for the crop marquee, which is a rect but not an annotation. */
interface CropResizeState {
  handle: BoxResizeHandle;
  pointerX: number;
  pointerY: number;
  rect: Rect;
}

// Base sizes at canvasScale(1200) === 1; scaled by the image width the same
// way pinRadius is, so they stay a readable on-screen size in fit mode
// instead of shrinking along with a wide capture.
const BASE_RESIZE_HANDLE_SIZE = 9;
const BASE_RESIZE_HANDLE_HIT_SIZE = 16;
const MIN_RESIZE_BOX_SIZE = 8;
/** Image-space size of the inline comment editor; also what its placement is solved for. */
const BASE_INLINE_EDITOR_SIZE = { width: 240, height: 84 };
const BASE_INLINE_EDITOR_FONT_SIZE = 13;
/**
 * On-screen size of the marquee's floating Apply/Cancel bar. Fixed, because it
 * is HTML over the crop window rather than SVG content: the anchor clamps
 * against these numbers so the bar can never be clipped out of reach.
 */
const CROP_CONTROLS_SIZE = { width: 196, height: 44 };
/**
 * The marquee's own resize handles. Token-backed, and applied as CSS so the
 * `var()` really resolves - a card-coloured square outlined in the foreground
 * colour reads in both themes, where a single hard-coded slate did not.
 */
const CROP_HANDLE_STYLE = { fill: "hsl(var(--card))", stroke: "hsl(var(--foreground))" };
/** Edge of one tile of the redaction hatch, in image px at `canvasScale` 1. */
const BASE_REDACT_HATCH_SIZE = 8;
/**
 * How far the pointer must travel before a pen stroke records another point.
 * Thinning as it draws is what keeps a stroke a few dozen points instead of
 * one per pointer event - the difference between a readable sidecar rect and
 * a thousand-entry array in every saved share.
 */
const PEN_POINT_SPACING = 3;

interface AnnotationCanvasProps {
  state: EditorState;
  inlineCommentRef: React.RefObject<HTMLTextAreaElement>;
  shouldFocusSelectedComment: boolean;
  setShouldFocusSelectedComment: (value: boolean) => void;
  /** Called once a pointer gesture added, moved or resized an annotation. */
  onCommit: () => void;
}

export function AnnotationCanvas({
  state,
  inlineCommentRef,
  shouldFocusSelectedComment,
  setShouldFocusSelectedComment,
  onCommit
}: AnnotationCanvasProps): JSX.Element {
  const {
    annotations,
    setAnnotations,
    getAnnotations,
    selectedId,
    setSelectedId,
    tool,
    isBusy,
    crop,
    setCrop,
    cropDraft,
    setCropDraft,
    status,
    setStatus,
    progress,
    interactionMode,
    setPaletteTool,
    color,
    baseDataUrl,
    imageSize,
    setImageSize,
    zoom,
    removeAnnotation,
    undoAnnotations,
    redoAnnotations
  } = state;

  /**
   * Commit the marquee. One function for the floating button and the Enter
   * key, so the keyboard path cannot drift from the pointer one - including
   * the `isBusy` guard.
   */
  const applyCropDraft = (): void => {
    if (!cropDraft || isBusy) return;
    setCrop(cropDraft);
    setCropDraft(null);
  };

  const svgRef = useRef<SVGSVGElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  // The export's canvas, reproduced: kept across renders so a redaction drag
  // reuses one allocation instead of one per pointer-move.
  const bufferRef = useRef<HTMLCanvasElement | null>(null);
  // Alt is held down. Only ever a reveal for the *selected* redaction, so it
  // costs one boolean and cannot uncover something the user is not looking at.
  const [altHeld, setAltHeld] = useState(false);
  const [draft, setDraft] = useState<DraftShape | null>(null);
  // The pen's own draft: a path, not a rect, so it gets its own state rather
  // than being bent into `DraftShape`.
  const [penDraft, setPenDraft] = useState<Array<{ x: number; y: number }> | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [resize, setResize] = useState<ResizeState | null>(null);
  const [cropResize, setCropResize] = useState<CropResizeState | null>(null);
  // A pointer-down on an annotation or a resize handle starts a gesture but is
  // also just a selection click; only an actual move/resize is worth committing.
  const gestureMovedRef = useRef(false);
  // One history entry per comment editing session, not per keystroke. Typing
  // marks the note dirty; the entry is written when the editor is left - which
  // is either a blur or, when a click on empty canvas deselects, an unmount
  // (React dispatches no blur for an unmounted fiber, so blur alone would lose
  // the comment on the next undo).
  const noteDirtyRef = useRef(false);
  const commitNoteIfDirty = (): void => {
    if (!noteDirtyRef.current) return;
    noteDirtyRef.current = false;
    onCommit();
  };
  // The note as it stood when the editor took focus - what Escape puts back.
  // Recorded on focus rather than on selection, so re-entering an existing
  // note and bailing out restores that note, not an empty string.
  const noteBaselineRef = useRef<{ id: string; value: string } | null>(null);

  /**
   * Escape means cancel everywhere else in this editor - it closes a listbox
   * without applying the highlighted option, drops a crop marquee, and backs
   * out of "Replace capture?". In the one place a draft is most likely to be
   * abandoned it used to do the opposite: the handler blurred the textarea and
   * `onBlur` committed whatever had been typed, so the note shipped.
   *
   * The annotation itself stays - it was committed when it was drawn. Only the
   * text goes back to its baseline, and with `noteDirtyRef` cleared the
   * unmount cleanup below writes no history entry either, so a discard costs
   * nothing to undo past.
   *
   * One exception, and it is the reason this returns a boolean: for a **text**
   * annotation the note *is* the annotation. Discarding back to an empty
   * baseline would leave an invisible shape that still takes a numbered pin, a
   * timeline row and an `[text] (empty)` line in every prompt - so a text
   * placed and then abandoned is removed instead. `true` means "there is
   * nothing left to keep selected".
   */
  const discardNoteDraft = (): boolean => {
    const baseline = noteBaselineRef.current;
    noteBaselineRef.current = null;
    if (!baseline || !noteDirtyRef.current) return false;
    noteDirtyRef.current = false;

    const item = getAnnotations().find((entry) => entry.id === baseline.id);
    if (item?.tool === "text" && baseline.value === "") {
      // Goes through `removeAnnotation` like every other delete path, so it
      // snapshots and announces exactly as "Delete Selected Item" would.
      removeAnnotation(baseline.id);
      return true;
    }

    setAnnotations((prev) =>
      prev.map((entry) => {
        if (entry.id !== baseline.id) return entry;
        if (entry.tool === "redact") return entry;
        if (entry.tool === "text") return { ...entry, text: baseline.value };
        return { ...entry, comment: baseline.value };
      })
    );
    return false;
  };

  /**
   * Put the keyboard somewhere continuable once the comment editor lets go.
   * Leaving the textarea used to strand focus on `<body>` with no ring on
   * screen, and the next Tab wrapped to "Capture Page" - so annotating three
   * regions meant tabbing the whole sidebar twice in between.
   *
   * Deferred by a frame, and only when focus really was orphaned: the same
   * rule `useTimedConfirm` restores a trigger by. Selecting another annotation
   * focuses its editor in a layout effect that has not run yet, and a click on
   * a control has already moved focus there - neither may be yanked back.
   */
  const restoreFocusAfterNote = (id: string | null): void => {
    requestAnimationFrame(() => {
      if (document.activeElement !== document.body) return;
      const row = id
        ? document.querySelector<HTMLElement>(`[data-annotation-row="${CSS.escape(id)}"]`)
        : null;
      (row ?? svgRef.current)?.focus();
    });
  };

  const selectedAnnotation = annotations.find((item) => item.id === selectedId) ?? null;
  const selectedNote = selectedAnnotation
    ? selectedAnnotation.tool === "text"
      ? selectedAnnotation.text
      : (selectedAnnotation.comment ?? "")
    : "";
  // With the crop or redact tool in draw mode the whole canvas is marquee
  // surface, so annotations must not swallow a pointer-down that starts a
  // region on top of one - a secret has to be coverable wherever it sits.
  const drawingRegion = interactionMode === "draw" && (tool === "crop" || tool === "redact");
  // The region the canvas dims around: a marquee being dragged, or one waiting
  // for Apply. An *applied* crop is not dimmed - the canvas simply shows the
  // crop and nothing else (see `view` below), which is the whole point: what
  // is on screen is what the exports will contain.
  const cropRegion: Rect | null = draft && tool === "crop" ? draftRect(draft) : cropDraft;
  const shade = cropRegion
    ? {
        left: Math.min(Math.max(cropRegion.x, 0), imageSize.width),
        top: Math.min(Math.max(cropRegion.y, 0), imageSize.height),
        right: Math.min(Math.max(cropRegion.x + cropRegion.width, 0), imageSize.width),
        bottom: Math.min(Math.max(cropRegion.y + cropRegion.height, 0), imageSize.height)
      }
    : null;
  // The region's own box, drawn twice: a dark line under dashed white.
  const outline = shade
    ? {
        x: shade.left,
        y: shade.top,
        width: Math.max(0, shade.right - shade.left),
        height: Math.max(0, shade.bottom - shade.top)
      }
    : null;
  // The region of the capture the canvas actually shows. With no crop that is
  // the whole image, so the uncropped canvas is byte-for-byte the layout it
  // always was; with one, the window below clips to exactly what every export
  // will contain. The image and the SVG overlay are never resized by this -
  // annotations keep their capture coordinates, and the overlay keeps covering
  // the image exactly, which is what pointer hit-testing depends on.
  const view: Rect = crop ?? { x: 0, y: 0, width: imageSize.width, height: imageSize.height };
  // One numbering for the canvas pins, the comment timeline, the exported
  // image and the LLM prompt. With a crop applied that numbering is the
  // export's - derived through `applyCrop`, radius and clamp taken from the
  // crop, centres shifted back into capture space for the overlay - so a pin
  // can no longer sit somewhere on the canvas and somewhere else in the PNG.
  const { radius: pinR, pins } = viewPins(annotations, crop, imageSize);
  const scale = canvasScale(view.width);
  const resizeHandleSize = BASE_RESIZE_HANDLE_SIZE * scale;
  const resizeHandleHitSize = BASE_RESIZE_HANDLE_HIT_SIZE * scale;
  const inlineEditorSize = {
    width: BASE_INLINE_EDITOR_SIZE.width * scale,
    height: BASE_INLINE_EDITOR_SIZE.height * scale
  };
  const inlineEditorFontSize = BASE_INLINE_EDITOR_FONT_SIZE * scale;
  const hatchSize = BASE_REDACT_HATCH_SIZE * scale;
  // The one redaction Alt is currently showing through, if any.
  const revealedId =
    altHeld && selectedAnnotation?.tool === "redact" ? selectedAnnotation.id : null;

  const viewMetrics = cropViewMetrics(view, imageSize);
  const cropWindowStyle: React.CSSProperties =
    zoom === "fit"
      ? // "Shrink to fit, never upscale": the window is fluid up to the view's
        // own pixel width, and its aspect ratio gives it a height with nothing
        // measured in JavaScript.
        { width: "100%", maxWidth: view.width, aspectRatio: viewMetrics.aspectRatio }
      : { width: view.width, height: view.height };
  // One mapping for both zoom modes, in percentages of whatever the window
  // resolved to. At 1:1 the window is exactly the view's pixel size, so those
  // percentages evaluate to `-view.x`/`-view.y` and the image's natural width;
  // at fit-width the window is fluid and they scale with it. Only the window
  // style above differs between the two.
  const imageWrapperStyle: React.CSSProperties = {
    left: `${viewMetrics.offsetXPercent}%`,
    top: `${viewMetrics.offsetYPercent}%`,
    width: `${viewMetrics.widthPercent}%`
  };

  // The marquee's bottom-left corner as a fraction of the window, which is
  // where the floating Apply/Cancel bar anchors. Deliberately HTML over the
  // window rather than a `foreignObject` inside the SVG: content in the SVG is
  // sized in *image* px, so at fit-width the bar shrank along with the capture
  // and landed well under a readable (and tappable) size.
  //
  // The bar is a child of the window, which clips, so both axes are clamped
  // against the bar's own fixed size: a narrow marquee at the right edge would
  // otherwise push it past 100%, and a marquee against the top edge would put
  // it above the window - either way out of reach, with no other way to apply.
  // `clamp()` does that in CSS, mixing the percentage anchor with the px size,
  // so nothing has to be measured. Enter applies a draft from the keyboard in
  // any case (see the keymap), so the bar is never the only affordance.
  const cropControlsAnchor =
    cropDraft && !draft
      ? {
          width: CROP_CONTROLS_SIZE.width,
          left: `clamp(0px, ${((cropDraft.x - view.x) / view.width) * 100}%, 100% - ${CROP_CONTROLS_SIZE.width}px)`,
          top: `clamp(${CROP_CONTROLS_SIZE.height}px, ${((cropDraft.y + cropDraft.height - view.y) / view.height) * 100}%, 100%)`
        }
      : null;

  // What an applied crop leaves out. The exports renumber the survivors, so
  // saying this plainly is also the answer to "why is pin 3 numbered 2 in the
  // PNG". Counted over numbered annotations only: a redaction the crop drops
  // hides nothing, because the crop already removed those pixels.
  const excludedByCrop = crop
    ? numberAnnotations(annotations).length - numberAnnotations(applyCrop(annotations, crop)).length
    : 0;

  /**
   * The diagonal hatch a redaction is previewed with. In user space so the
   * tiles line up with the region whatever the zoom, and coloured from the
   * annotation, so the palette stays the single source of colour.
   */
  const hatchPattern = (id: string, hatchColor: string): JSX.Element => (
    <defs>
      <pattern id={id} patternUnits="userSpaceOnUse" width={hatchSize} height={hatchSize}>
        <path
          d={`M0,${hatchSize} L${hatchSize},0`}
          stroke={hatchColor}
          strokeWidth={hatchSize / 3}
        />
      </pattern>
    </defs>
  );

  /**
   * The eight drag handles around a rect. Shared by a selected box/redaction
   * and by the crop marquee, so a region is resized the same way whichever it
   * is - and `applyBoxResizeDelta` stays the one place that geometry lives.
   */
  const renderHandles = (
    rect: Rect,
    /** Written as CSS, not presentation attributes, so `var()` tokens resolve. */
    handleStyle: React.CSSProperties,
    keyPrefix: string,
    onDown: (handle: BoxResizeHandle) => (event: React.PointerEvent<SVGElement>) => void
  ): JSX.Element[] =>
    BOX_RESIZE_HANDLES.map((handle) => {
      const position = getBoxHandlePosition(rect, handle);
      return (
        <g key={`${keyPrefix}-${handle}`}>
          <rect
            x={position.x - resizeHandleHitSize / 2}
            y={position.y - resizeHandleHitSize / 2}
            width={resizeHandleHitSize}
            height={resizeHandleHitSize}
            fill="transparent"
            style={{ cursor: getBoxResizeCursor(handle) }}
            onPointerDown={onDown(handle)}
          />
          <rect
            x={position.x - resizeHandleSize / 2}
            y={position.y - resizeHandleSize / 2}
            width={resizeHandleSize}
            height={resizeHandleSize}
            style={handleStyle}
            strokeWidth="1.5"
            pointerEvents="none"
          />
        </g>
      );
    });

  const renderResizeHandles = (item: RectAnnotation): JSX.Element[] =>
    renderHandles(item, { fill: "white", stroke: item.color }, item.id, (handle) =>
      onResizeHandlePointerDown(item, handle)
    );

  const renderPin = (item: Annotation): JSX.Element | null => {
    const pin = pins.get(item.id);
    // No pin for an annotation the applied crop dropped: the export drops it
    // too, and a numbered pin for something that will not be in the PNG is
    // exactly the disagreement this is here to prevent.
    if (!pin) return null;
    const center = pin.center;
    return (
      <g pointerEvents="none">
        <circle
          cx={center.x}
          cy={center.y}
          r={pinR}
          fill={item.color}
          stroke="#fff"
          strokeWidth={Math.max(2, pinR / 7)}
        />
        <text
          x={center.x}
          y={center.y}
          fill="#fff"
          fontSize={pinR * 1.15}
          fontWeight="700"
          textAnchor="middle"
          dominantBaseline="central"
        >
          {pin.n}
        </text>
      </g>
    );
  };

  const inlineEditorPosition = selectedAnnotation
    ? placeInlineEditor(annotationBounds(selectedAnnotation), imageSize, inlineEditorSize)
    : null;

  // Layout effect, not a plain effect: the first keystroke after the shape is
  // created must land in the textarea, so it has to be focused before the
  // browser hands control back after the pointer-up.
  useLayoutEffect(() => {
    if (!shouldFocusSelectedComment) return;
    if (!selectedAnnotation) return;

    inlineCommentRef.current?.focus();
    inlineCommentRef.current?.select();
    setShouldFocusSelectedComment(false);
  }, [
    selectedAnnotation,
    shouldFocusSelectedComment,
    inlineCommentRef,
    setShouldFocusSelectedComment
  ]);

  /**
   * Track Alt, so holding it over a selected redaction can show what is under
   * it. Cleared on blur as well as keyup: the key can be released while the
   * window is not focused, and a reveal that never ends would be a hole in the
   * one feature whose whole job is covering something up.
   *
   * ponytail: a platform where a bare Alt moves focus into the browser's own
   * menu would end the reveal through that same blur - the region stays
   * covered, which is the safe way to fail. Upgrade path if it bites: hold to
   * reveal from a pointer gesture on the region instead.
   */
  useEffect(() => {
    const onAlt = (event: KeyboardEvent): void => {
      if (event.key === "Alt") setAltHeld(event.type === "keydown");
    };
    const clear = (): void => setAltHeld(false);

    window.addEventListener("keydown", onAlt);
    window.addEventListener("keyup", onAlt);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", onAlt);
      window.removeEventListener("keyup", onAlt);
      window.removeEventListener("blur", clear);
    };
  }, []);

  /**
   * Paint every redaction onto the overlay canvas exactly as the export will
   * burn it in. A hatch only promised the pixels would go, so "is enough of
   * that address covered?" was a question the editor could not answer until
   * the file had already been written.
   *
   * "Exactly" is the whole requirement, and it takes more than calling the
   * same helper. The export renders `exportView`: the crop clamped, the
   * annotations shifted into *crop space* by `applyCrop` (which also clips a
   * redaction the crop cuts through), onto a crop-sized canvas, each region
   * pixelated from the canvas **as the region before it left it**. Two things
   * follow that a naive "pixelate each region off the `<img>`" gets wrong: a
   * redaction the crop cuts through would block from its un-clipped corner,
   * landing a different block grid than the export's; and overlapping
   * redactions would each read pristine pixels instead of stacking. So the
   * buffer below reproduces the export's canvas step for step, and only the
   * rects it actually touched are copied onto the overlay, shifted back into
   * display coordinates - which is also what keeps the overlay transparent
   * everywhere the capture is untouched.
   *
   * Sizing a canvas clears it, which is also how an undone, deleted or moved
   * redaction stops being drawn - and with no redactions at all the overlay is
   * sized to nothing rather than holding a capture-sized backing store. It
   * runs after every annotation, crop or reveal change and after the image
   * reports its size (`onLoad` sets a fresh `imageSize` object, so a second
   * capture of identical dimensions still re-runs this).
   *
   * ponytail: the buffer is a full view-sized canvas, redrawn per change - a
   * few MB of copy per pointer-move while dragging a redaction on a very tall
   * capture. Reused across renders rather than reallocated. If that ever
   * shows, the upgrade is to buffer only the union of the redactions' bounds.
   */
  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;

    // Exactly the region and the annotation list the export renders.
    const viewRect: Rect = crop
      ? clampCrop(crop, imageSize)
      : { x: 0, y: 0, width: imageSize.width, height: imageSize.height };
    const visible = redactions(crop ? applyCrop(annotations, viewRect) : annotations).filter(
      (region) => region.id !== revealedId
    );

    const image = imageRef.current;
    if (visible.length === 0 || !image?.complete || viewRect.width <= 0 || viewRect.height <= 0) {
      canvas.width = 0;
      canvas.height = 0;
      return;
    }

    canvas.width = imageSize.width;
    canvas.height = imageSize.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const buffer = (bufferRef.current ??= document.createElement("canvas"));
    buffer.width = viewRect.width;
    buffer.height = viewRect.height;
    const bufferCtx = buffer.getContext("2d");
    if (!bufferCtx) return;

    const size = { width: viewRect.width, height: viewRect.height };
    bufferCtx.drawImage(
      image,
      viewRect.x,
      viewRect.y,
      viewRect.width,
      viewRect.height,
      0,
      0,
      viewRect.width,
      viewRect.height
    );
    for (const region of visible) pixelateRegion(bufferCtx, buffer, region, size);

    for (const region of visible) {
      const bounds = redactionBounds(region, size);
      if (!bounds) continue;
      ctx.drawImage(
        buffer,
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height,
        bounds.x + viewRect.x,
        bounds.y + viewRect.y,
        bounds.width,
        bounds.height
      );
    }
  }, [annotations, baseDataUrl, crop, imageSize, revealedId]);

  // The inline editor is gone (deselected, unmounted, or moved to another
  // annotation): write the pending comment before the selection changes.
  useEffect(() => {
    if (!selectedId) return;
    const id = selectedId;
    return () => {
      commitNoteIfDirty();
      restoreFocusAfterNote(id);
    };
    // `selectedId` only: the cleanup must run when the selection changes, not
    // on every render. `onCommit` reaches the live annotations through a ref,
    // so the captured closure stays correct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  /**
   * The middle of what is actually on screen, in image px: the scrollport, the
   * crop window and the image intersected, so a shape placed from the keyboard
   * lands where the user is looking rather than at the top of a 6000px capture
   * they have scrolled well past. Falls back to the image's own centre when
   * anything is missing or the boxes do not overlap.
   */
  const visibleCentre = (): { x: number; y: number } => {
    const fallback = { x: imageSize.width / 2, y: imageSize.height / 2 };
    const port = document.getElementById("capture-viewport")?.getBoundingClientRect();
    const image = imageRef.current?.getBoundingClientRect();
    const window_ = document.getElementById("capture-window")?.getBoundingClientRect();
    if (!port || !image || !window_ || image.width <= 0 || image.height <= 0) return fallback;

    const left = Math.max(port.left, window_.left, image.left);
    const right = Math.min(port.right, window_.right, image.right);
    const top = Math.max(port.top, window_.top, image.top);
    const bottom = Math.min(port.bottom, window_.bottom, image.bottom);
    if (right <= left || bottom <= top) return fallback;

    return {
      x: (((left + right) / 2 - image.left) / image.width) * imageSize.width,
      y: (((top + bottom) / 2 - image.top) / image.height) * imageSize.height
    };
  };

  /**
   * Place the armed tool's default shape with no pointer. It goes through
   * `commitNewAnnotation` + `onCommit`, exactly as a drag's pointer-up does,
   * so the new annotation is selected, its comment editor focused, its undo
   * entry written and its DOM context read - one creation path, not two.
   *
   * Pen is deliberately not here: a stroke is a path the hand draws, and a
   * default squiggle would be a shape the user never made. Crop is, because a
   * marquee is just a rect, and Enter already applies one.
   */
  const placeFromKeyboard = (): void => {
    const centre = visibleCentre();
    const createdAt = new Date().toISOString();

    if (tool === "crop") {
      setCropDraft(clampCrop(placementRect(centre, imageSize), imageSize));
      return;
    }
    if (tool === "pen") return;

    if (tool === "text") {
      commitNewAnnotation({
        id: uid(),
        tool: "text",
        x: onImage(centre.x, imageSize.width),
        y: onImage(centre.y, imageSize.height),
        text: "",
        color,
        createdAt
      });
      onCommit();
      return;
    }

    if (tool === "arrow") {
      commitNewAnnotation({
        id: uid(),
        tool: "arrow",
        ...placementArrow(centre, imageSize),
        color,
        comment: "",
        createdAt
      });
      onCommit();
      return;
    }

    // The three rectangles. Written out per tool rather than spread from a
    // variable: the discriminant has to be a literal for the union to narrow.
    const base = { id: uid(), color, createdAt, ...placementRect(centre, imageSize) };
    if (tool === "box") commitNewAnnotation({ ...base, tool: "box", comment: "" });
    else if (tool === "highlight") commitNewAnnotation({ ...base, tool: "highlight", comment: "" });
    else commitNewAnnotation({ ...base, tool: "redact" });
    onCommit();
  };

  // Set by an arrow-key edit, cleared by the key-up (or window blur) that
  // commits it: holding a key repeats keydown but fires one keyup, so a run of
  // nudges is one undo entry rather than one per repeat.
  const nudgedRef = useRef(false);
  // The window listeners are bound once and read their handlers from here, so
  // a fresh closure per render costs nothing and nothing can go stale. See the
  // effect that fills it, below the keymap.
  const handlersRef = useRef<{
    onKeyDown: (event: KeyboardEvent) => void;
    onKeyUp: (event: KeyboardEvent) => void;
    onBlur: () => void;
  }>({ onKeyDown: () => {}, onKeyUp: () => {}, onBlur: () => {} });

  const nudgeSelected = (dx: number, dy: number): void => {
    // `getAnnotations`, not the render value: this runs from a window listener
    // that is not re-bound on every annotation change.
    const item = getAnnotations().find((entry) => entry.id === selectedId);
    if (!item) return;
    setAnnotations((prev) =>
      prev.map((entry) => (entry.id === item.id ? moveAnnotation(entry, dx, dy) : entry))
    );
    nudgedRef.current = true;
  };

  /**
   * Shift+arrow, for the annotations that are rectangles - the rest have no
   * size. `resizeRect` is the pointer path's own `applyBoxResizeDelta` with
   * the image as bounds, so the keyboard cannot grow a rectangle past an edge
   * a drag would have stopped at, and it answers `null` when the key changes
   * nothing (already at the minimum, already filling the image). That `null`
   * is what keeps a held Shift+Left at the floor from spending one undo entry
   * per repeat on a rectangle that never moved.
   */
  const resizeSelected = (dw: number, dh: number): void => {
    const item = getAnnotations().find((entry) => entry.id === selectedId);
    if (!item || (item.tool !== "box" && item.tool !== "highlight" && item.tool !== "redact")) {
      return;
    }

    const next = resizeRect(item, dw, dh, imageSize);
    if (!next) return;

    setAnnotations((prev) =>
      prev.map((entry) =>
        entry.id === item.id &&
        (entry.tool === "box" || entry.tool === "highlight" || entry.tool === "redact")
          ? { ...entry, ...next }
          : entry
      )
    );
    nudgedRef.current = true;
  };

  /**
   * Write the pending arrow-key edit into the history. Called from key-up and
   * from `window.blur`: a held arrow key repeats keydown and fires exactly one
   * keyup, but Alt-Tabbing mid-hold fires no keyup at all, which used to leave
   * the movement on screen and outside the undo stack until some later gesture
   * swept it into an unrelated entry. The flag is cleared first, so the two
   * paths cannot both commit the same nudge.
   */
  const commitPendingNudge = (): void => {
    if (!nudgedRef.current) return;
    nudgedRef.current = false;
    onCommit();
  };

  // Editor keyboard shortcuts, all on one window listener: V/B/A/T/H/P/R/C
  // pick a tool from the palette, Escape clears selection/in-progress gestures,
  // Delete/Backspace removes the selected annotation, Ctrl/Cmd+Z undoes,
  // Ctrl/Cmd+Shift+Z (or Ctrl/Cmd+Y) redoes, and with the canvas focused Enter
  // places a shape and the arrow keys move or resize the selection. Everything
  // but Escape is ignored while typing in a field - the comment editor is a
  // textarea on the canvas, so an unguarded "b" would swallow every letter of
  // a note, an unguarded Enter would drop a stray annotation instead of a
  // newline, and an unguarded arrow key would move the shape, not the caret.
  //
  // No dependency array: this runs after every render purely to refresh the
  // handlers in `handlersRef`, which the one real binding below reads.
  useLayoutEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        !!target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      // `Select` (`components/ui/select.tsx`) is a WAI-ARIA listbox built on a
      // button, not a form field, and its typeahead reads plain keydowns off
      // the window: without this, typing "a" for "Actual size" in Zoom would
      // also pick the Arrow tool, and "c" for "Compact" would pick Crop.
      const inListbox = !!target?.closest('[role="combobox"],[role="listbox"]');

      if ((event.ctrlKey || event.metaKey) && !isTyping) {
        const key = event.key.toLowerCase();
        if (key === "z" || key === "y") {
          event.preventDefault();
          if (key === "y" || event.shiftKey) redoAnnotations();
          else undoAnnotations();
          return;
        }
      }

      // A bare tool letter, with no modifier: Ctrl+C is a copy, not the crop
      // tool, and Alt combinations belong to the browser. Nothing to pick a
      // tool for before there is a capture, either - the palette is disabled
      // then, and the keyboard must not be a way around that.
      if (
        baseDataUrl &&
        !isTyping &&
        !inListbox &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        const segment = hotkeyTool(event.key);
        if (segment) {
          event.preventDefault();
          setPaletteTool(segment);
          return;
        }
      }

      // Enter applies a drawn crop, the counterpart to Escape cancelling it.
      // It is also what keeps the floating bar from being the only way to
      // apply one, whatever the marquee's position or the window's size.
      if (event.key === "Enter" && !isTyping && cropDraft) {
        event.preventDefault();
        applyCropDraft();
        return;
      }

      // Everything below is the pointer's work done from the keyboard, so it
      // only answers while the canvas region itself has focus: arrow keys
      // belong to the scrollport and to every listbox otherwise.
      //
      // `!isTyping` is load-bearing, not belt-and-braces: the inline comment
      // editor is a <textarea> inside a <foreignObject> *inside* this same
      // SVG, so `contains(target)` is true while a note is being typed.
      // Without it, Enter in a note dropped a stray annotation instead of a
      // newline and the arrow keys moved the shape instead of the caret.
      const onCanvas = !!target && !isTyping && !!svgRef.current?.contains(target);

      if (onCanvas && baseDataUrl && !isBusy && interactionMode === "draw") {
        if (event.key === "Enter") {
          event.preventDefault();
          placeFromKeyboard();
          return;
        }
      }

      const direction = ARROW_KEYS[event.key];
      if (onCanvas && direction && selectedId && !isBusy) {
        event.preventDefault();
        if (event.shiftKey) {
          resizeSelected(direction.x * KEYBOARD_NUDGE, direction.y * KEYBOARD_NUDGE);
        } else {
          nudgeSelected(direction.x * KEYBOARD_NUDGE, direction.y * KEYBOARD_NUDGE);
        }
        return;
      }

      if (event.key === "Escape") {
        // Escape in the note is a discard, not a commit - and it hands the
        // keyboard back to the canvas, where the next shape is drawn, rather
        // than dropping it on `<body>`.
        const inNote = isTyping && target === inlineCommentRef.current;
        if (inNote) {
          const dropped = discardNoteDraft();
          target.blur();
          // The selection deliberately survives: focus lands on the canvas
          // with the shape still selected, so the arrow keys move the thing
          // that was just drawn. Clearing it here made the natural
          // Enter -> type -> Escape -> nudge run impossible. A second Escape,
          // now from the canvas, is the deselect. An annotation the discard
          // removed outright (an empty text) has nothing left to select.
          if (dropped) setSelectedId(null);
          setCropDraft(null);
          setDraft(null);
          setPenDraft(null);
          setDrag(null);
          setResize(null);
          setCropResize(null);
          svgRef.current?.focus();
          return;
        }

        if (isTyping) target.blur();
        setSelectedId(null);
        setCropDraft(null);
        setDraft(null);
        setPenDraft(null);
        setDrag(null);
        setResize(null);
        setCropResize(null);
        return;
      }

      if ((event.key === "Delete" || event.key === "Backspace") && !isTyping) {
        if (!selectedId) return;
        event.preventDefault();
        removeAnnotation(selectedId);
        setResize((current) => (current?.id === selectedId ? null : current));
      }
    };

    // One commit per key-up, not per keydown: a held arrow key repeats, and
    // twenty history entries for one nudge across the canvas would make undo
    // useless. The same `onCommit` a pointer gesture ends with, so the moved
    // annotation's DOM context is re-read too.
    const onKeyUp = (event: KeyboardEvent): void => {
      if (!ARROW_KEYS[event.key]) return;
      commitPendingNudge();
    };

    handlersRef.current = { onKeyDown, onKeyUp, onBlur: commitPendingNudge };
  });

  /**
   * The three window listeners, bound exactly once. The handlers above close
   * over live render values (the armed tool, the colour, `imageSize`), so they
   * are refreshed on every render through `handlersRef` instead of being
   * re-bound: a dependency array either re-registers all three on every
   * pointer-move of a drag (what `onCommit`'s identity used to do) or silently
   * goes stale on the one value someone forgets to list - `imageSize`, say,
   * which arrives after `baseDataUrl` and decides where a placed shape lands.
   */
  useEffect(() => {
    const down = (event: KeyboardEvent): void => handlersRef.current.onKeyDown(event);
    const up = (event: KeyboardEvent): void => handlersRef.current.onKeyUp(event);
    const blur = (): void => handlersRef.current.onBlur();

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  const pointerPos = (event: React.PointerEvent<SVGElement>): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };

    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;

    const matrix = svg.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };

    const transformed = point.matrixTransform(matrix.inverse());
    return { x: transformed.x, y: transformed.y };
  };

  /**
   * Add a freshly drawn annotation, select it and ask for focus - synchronously,
   * so the comment textarea is mounted and focused before the pointer event
   * that created the shape returns. Anything typed straight after the release
   * then lands in the comment instead of on the window.
   *
   * A redaction takes no comment, so it asks for no focus: it is selected only
   * so it can be dragged, resized or deleted straight after being drawn.
   *
   * The tool deliberately stays selected: drawing five boxes is five drags,
   * not five drags with a mode switch between each. Selection is what changes,
   * not the mode - the inline comment editor mounts for the new annotation and
   * the next drag on empty canvas draws the next one.
   */
  const commitNewAnnotation = (item: Annotation): void => {
    flushSync(() => {
      setAnnotations((prev) => [...prev, item]);
      setSelectedId(item.id);
      setShouldFocusSelectedComment(item.tool !== "redact");
    });
  };

  const onCanvasPointerDown = (event: React.PointerEvent<SVGSVGElement>): void => {
    if (!baseDataUrl) return;

    if (interactionMode !== "draw") {
      setSelectedId(null);
      return;
    }

    setSelectedId(null);

    const { x, y } = pointerPos(event);

    if (tool === "text") {
      commitNewAnnotation({
        id: uid(),
        tool: "text",
        x,
        y,
        text: "",
        color,
        createdAt: new Date().toISOString()
      });
      // A text annotation is placed on pointer-down and never reaches the
      // pointer-up commit below, so it snapshots itself here.
      onCommit();
      return;
    }

    if (tool === "pen") {
      setPenDraft([{ x, y }]);
      return;
    }

    setDraft({ xStart: x, yStart: y, xCurrent: x, yCurrent: y });
  };

  const onAnnotationPointerDown =
    (item: Annotation) =>
    (event: React.PointerEvent<SVGElement>): void => {
      // Let the event reach the canvas: a crop or redact drag starts anywhere.
      if (drawingRegion) return;

      event.stopPropagation();
      setSelectedId(item.id);

      if (interactionMode !== "move") {
        return;
      }

      event.preventDefault();

      const { x, y } = pointerPos(event);
      gestureMovedRef.current = false;
      setDrag({
        id: item.id,
        startX: x,
        startY: y,
        original: item
      });
    };

  const onResizeHandlePointerDown =
    (item: RectAnnotation, handle: BoxResizeHandle) =>
    (event: React.PointerEvent<SVGElement>): void => {
      event.stopPropagation();
      if (interactionMode !== "move") return;

      event.preventDefault();
      setSelectedId(item.id);

      const { x, y } = pointerPos(event);
      gestureMovedRef.current = false;
      setResize({
        id: item.id,
        handle,
        pointerX: x,
        pointerY: y,
        box: {
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height
        }
      });
    };

  /**
   * Drag one of the marquee's own handles. Same helper as an annotation box,
   * clamped by `clampCrop` on the way into state so an edge drag can never
   * leave a region the exports could not draw.
   */
  const onCropHandlePointerDown =
    (handle: BoxResizeHandle) =>
    (event: React.PointerEvent<SVGElement>): void => {
      if (!cropDraft) return;
      event.stopPropagation();
      event.preventDefault();

      const { x, y } = pointerPos(event);
      setCropResize({ handle, pointerX: x, pointerY: y, rect: cropDraft });
    };

  const onCanvasPointerMove = (event: React.PointerEvent<SVGSVGElement>): void => {
    if (cropResize) {
      const { x, y } = pointerPos(event);
      const deltaX = x - cropResize.pointerX;
      const deltaY = y - cropResize.pointerY;

      if (deltaX === 0 && deltaY === 0) return;

      const result = applyBoxResizeDelta({
        box: cropResize.rect,
        handle: cropResize.handle,
        deltaX,
        deltaY,
        boundsWidth: imageSize.width,
        boundsHeight: imageSize.height,
        minSize: MIN_CROP_SIZE
      });

      setCropDraft(clampCrop(result.box, imageSize));
      setCropResize({
        handle: result.handle,
        pointerX: x,
        pointerY: y,
        rect: result.box
      });
      return;
    }

    if (resize) {
      const { x, y } = pointerPos(event);
      const deltaX = x - resize.pointerX;
      const deltaY = y - resize.pointerY;

      if (deltaX === 0 && deltaY === 0) return;

      const result = applyBoxResizeDelta({
        box: resize.box,
        handle: resize.handle,
        deltaX,
        deltaY,
        boundsWidth: imageSize.width,
        boundsHeight: imageSize.height,
        minSize: MIN_RESIZE_BOX_SIZE
      });

      gestureMovedRef.current = true;
      setAnnotations((prev) =>
        prev.map((item) =>
          item.id === resize.id &&
          (item.tool === "box" || item.tool === "redact" || item.tool === "highlight")
            ? { ...item, ...result.box }
            : item
        )
      );

      setResize({
        id: resize.id,
        handle: result.handle,
        pointerX: x,
        pointerY: y,
        box: result.box
      });
      return;
    }

    if (drag) {
      const { x, y } = pointerPos(event);
      const dx = x - drag.startX;
      const dy = y - drag.startY;
      gestureMovedRef.current = true;
      setAnnotations((prev) =>
        prev.map((item) => (item.id === drag.id ? moveAnnotation(drag.original, dx, dy) : item))
      );
      return;
    }

    if (penDraft) {
      const { x, y } = pointerPos(event);
      setPenDraft((prev) => {
        if (!prev) return prev;
        const last = prev[prev.length - 1];
        // Thinned as it goes: a point every few px, not one per event.
        if (Math.hypot(x - last.x, y - last.y) < PEN_POINT_SPACING) return prev;
        return [...prev, { x, y }];
      });
      return;
    }

    if (!draft) return;

    const { x, y } = pointerPos(event);
    setDraft((prev) => (prev ? { ...prev, xCurrent: x, yCurrent: y } : null));
  };

  const onCanvasPointerUp = (): void => {
    // A marquee resize is not an edit: no commit, no history entry.
    if (cropResize) {
      setCropResize(null);
      return;
    }

    if (resize) {
      setResize(null);
      if (gestureMovedRef.current) onCommit();
      return;
    }

    if (drag) {
      setDrag(null);
      if (gestureMovedRef.current) onCommit();
      return;
    }

    if (penDraft) {
      const points = penDraft;
      setPenDraft(null);
      // One point is a click that never moved: no line, nothing to comment on.
      if (points.length >= 2) {
        commitNewAnnotation({
          id: uid(),
          tool: "pen",
          points,
          color,
          comment: "",
          createdAt: new Date().toISOString()
        });
        onCommit();
      }
      return;
    }

    if (!draft) return;

    if (tool === "crop") {
      const region = draftRect(draft);
      setDraft(null);
      // A marquee, not a commit: too small a drag is a stray click, and the
      // crop itself only takes effect when Apply (or Enter) is pressed. No
      // history entry either - a crop is a view, not an edit.
      if (region.width >= MIN_CROP_SIZE && region.height >= MIN_CROP_SIZE) {
        setCropDraft(clampCrop(region, imageSize));
      }
      return;
    }

    let added = false;

    if (tool === "redact") {
      const { x, y, width, height } = draftRect(draft);

      if (width > 5 && height > 5) {
        // No `comment` and never a `context`: a note or a selector about a
        // hidden region would describe the very thing it hides.
        commitNewAnnotation({
          id: uid(),
          tool: "redact",
          x,
          y,
          width,
          height,
          color,
          createdAt: new Date().toISOString()
        });
        added = true;
      }
    }

    if (tool === "box") {
      const { x, y, width, height } = draftRect(draft);

      if (width > 5 && height > 5) {
        const item: Annotation = {
          id: uid(),
          tool: "box",
          x,
          y,
          width,
          height,
          color,
          comment: "",
          createdAt: new Date().toISOString()
        };
        commitNewAnnotation(item);
        added = true;
      }
    }

    if (tool === "highlight") {
      const { x, y, width, height } = draftRect(draft);

      if (width > 5 && height > 5) {
        const item: Annotation = {
          id: uid(),
          tool: "highlight",
          x,
          y,
          width,
          height,
          color,
          comment: "",
          createdAt: new Date().toISOString()
        };
        commitNewAnnotation(item);
        added = true;
      }
    }

    if (tool === "arrow") {
      const dx = draft.xCurrent - draft.xStart;
      const dy = draft.yCurrent - draft.yStart;

      // Same threshold as box and redact: a stray click is not a drag, and a
      // zero-length arrow has no direction to point in.
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        const item: Annotation = {
          id: uid(),
          tool: "arrow",
          x1: draft.xStart,
          y1: draft.yStart,
          x2: draft.xCurrent,
          y2: draft.yCurrent,
          color,
          comment: "",
          createdAt: new Date().toISOString()
        };
        commitNewAnnotation(item);
        added = true;
      }
    }

    setDraft(null);
    if (added) onCommit();
  };

  const updateSelectedAnnotationNote = (value: string): void => {
    if (!selectedId) return;
    noteDirtyRef.current = true;
    setAnnotations((prev) =>
      prev.map((item) => {
        if (item.id !== selectedId) return item;
        // A redaction has no comment editor to reach this, and a `never`-typed
        // `comment` so the compiler holds that rather than the UI alone.
        if (item.tool === "redact") return item;
        if (item.tool === "text") return { ...item, text: value };
        return { ...item, comment: value };
      })
    );
  };

  return (
    // `relative` so the status toast and the crop chip float over the capture
    // rather than pushing it around; the flex column is what lets the
    // scrollport below take the pane's leftover height in the fixed shell.
    <Card className="relative order-1 flex flex-col overflow-hidden lg:order-2 lg:min-h-0">
      <StatusToast status={status} setStatus={setStatus} progress={progress} />

      {/* Docked above the scrollport, inside the card: every control on it
          changes what the next pointer gesture does, so it belongs where the
          pointer is rather than in the sidebar. */}
      <ToolPalette state={state} />

      {/* An applied crop is stated where it is visible - over the canvas that
          is now showing only that region - not in the sidebar's scroll flow. */}
      {crop ? (
        // Bottom-left, not top-left: the top-left is where the capture's own
        // origin sits and where a drag usually starts, and the chip is
        // `pointer-events-none` with only its button opting back in - a chip
        // that swallowed a pointer-down would make that corner undrawable.
        <div className="pointer-events-none absolute bottom-4 left-4 z-20 max-w-[min(20rem,calc(100%-2rem))] space-y-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-[0_8px_20px_-8px_hsl(var(--card-shadow))]">
          <div className="flex items-center justify-between gap-2">
            <span>
              Cropped to {crop.width}x{crop.height}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="pointer-events-auto"
              disabled={isBusy}
              onClick={() => setCrop(null)}
            >
              Clear
            </Button>
          </div>
          {excludedByCrop > 0 ? (
            <p className="m-0">
              {excludedByCrop} annotation{excludedByCrop === 1 ? "" : "s"} outside the crop{" "}
              {excludedByCrop === 1 ? "is" : "are"} excluded from exports
            </p>
          ) : null}
        </div>
      ) : null}

      <CardContent className="flex min-h-0 flex-1 flex-col p-4">
        {baseDataUrl ? (
          // Three nested boxes, each with one job.
          //
          // `#capture-viewport` is the scrollport, and the only scroller for
          // the capture: fit mode never overflows it, actual mode (image or
          // crop wider than the pane) scrolls inside it, never the page body.
          //
          // The crop window clips to the region every export will contain -
          // the whole image when nothing is cropped, so the uncropped canvas
          // lays out exactly as it always did.
          //
          // The image wrapper is positioned inside that window by
          // `cropViewMetrics`, in percentages only, and is the box the SVG
          // overlay stretches to. The overlay must keep covering the image
          // exactly - not the window - or pointer math and hit-testing
          // silently miss whatever the window is currently clipping.
          <div
            id="capture-viewport"
            className="min-h-0 w-full flex-1 overflow-auto rounded-lg border border-border bg-card"
          >
            <div
              id="capture-window"
              // The applied crop, in image px, for the e2e - the canvas no
              // longer draws a marquee once a crop is in force.
              data-crop={crop ? `${crop.x},${crop.y},${crop.width},${crop.height}` : undefined}
              // `mx-auto` only bites once the window is narrower than the pane
              // (a crop, or a capture narrower than the editor): it centres the
              // region instead of pinning it to the left with dead space beside
              // it. Auto margins collapse to 0 when the content overflows, so
              // the 1:1 scroll path is untouched.
              className="relative mx-auto overflow-hidden"
              style={cropWindowStyle}
            >
              <div className="absolute" style={imageWrapperStyle}>
                <img
                  id="capture-image"
                  ref={imageRef}
                  src={baseDataUrl}
                  alt="Captured page"
                  decoding="async"
                  // The "shrink to fit, never upscale" cap now lives on the
                  // window's own `maxWidth` (the view's pixel width), so the
                  // image simply fills whatever the wrapper resolved to.
                  className={zoom === "fit" ? "block h-auto w-full" : "block h-auto max-w-none"}
                  onLoad={(event) => {
                    const img = event.currentTarget;
                    setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
                  }}
                />
                {/* The redactions, pixelated for real. Sized in image px and
                    stretched over the wrapper exactly as the SVG is, so it
                    tracks the capture through fit-width and 1:1 alike; under
                    the SVG so pins, outlines and handles still draw on top,
                    and inert to the pointer so it changes no gesture. */}
                <canvas
                  ref={overlayRef}
                  id="redaction-overlay"
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 h-full w-full"
                />
                <svg
                  ref={svgRef}
                  role="group"
                  // In the tab order, and the browser's own focus ring is left
                  // alone as the indicator: this is where the keyboard draws.
                  tabIndex={0}
                  aria-label="Annotation canvas. With a drawing tool active, Enter places a shape at the centre of the view; arrow keys move the selection and Shift with an arrow key resizes it. Freehand pen strokes need a pointer; annotations can also be managed from the comment timeline."
                  className={`absolute inset-0 h-full w-full ${
                    interactionMode === "move" ? "cursor-grab" : "cursor-crosshair"
                  }`}
                  viewBox={`0 0 ${imageSize.width} ${imageSize.height}`}
                  onPointerDown={onCanvasPointerDown}
                  onPointerMove={onCanvasPointerMove}
                  onPointerUp={onCanvasPointerUp}
                  // Ending the gesture on pointer-leave too is what guarantees no
                  // draft/drag/resize survives the pointer moving to the sidebar.
                  onPointerLeave={onCanvasPointerUp}
                >
                  {annotations.map((item) => {
                    const isSelected = selectedId === item.id;

                    if (item.tool === "box") {
                      return (
                        <g key={item.id} onPointerDown={onAnnotationPointerDown(item)}>
                          <rect
                            x={item.x}
                            y={item.y}
                            width={item.width}
                            height={item.height}
                            fill="transparent"
                            stroke={item.color}
                            strokeWidth={isSelected ? "4" : "3"}
                            strokeDasharray={isSelected ? "8 5" : undefined}
                            pointerEvents="all"
                          />
                          {renderPin(item)}
                          {isSelected && interactionMode === "move"
                            ? renderResizeHandles(item)
                            : null}
                        </g>
                      );
                    }

                    if (item.tool === "highlight") {
                      return (
                        <g key={item.id} onPointerDown={onAnnotationPointerDown(item)}>
                          {/* `multiply` is what makes this a marker pen rather
                              than a coloured pane over the page: the darker
                              pixels underneath (the text being highlighted)
                              stay readable. The export composites the same
                              way, off the same alpha. */}
                          <rect
                            x={item.x}
                            y={item.y}
                            width={item.width}
                            height={item.height}
                            fill={item.color}
                            fillOpacity={HIGHLIGHT_ALPHA}
                            style={{ mixBlendMode: "multiply" }}
                            pointerEvents="all"
                          />
                          {/* The edge, outside the blend: `multiply` over a
                              dark section leaves the wash invisible, so this
                              is what marks the region there. Same width and
                              colour the export strokes it with. */}
                          <rect
                            x={item.x}
                            y={item.y}
                            width={item.width}
                            height={item.height}
                            fill="none"
                            stroke={item.color}
                            strokeWidth={isSelected ? "4" : String(HIGHLIGHT_EDGE_WIDTH)}
                            strokeDasharray={isSelected ? "8 5" : undefined}
                            pointerEvents="none"
                          />
                          {renderPin(item)}
                          {isSelected && interactionMode === "move"
                            ? renderResizeHandles(item)
                            : null}
                        </g>
                      );
                    }

                    if (item.tool === "pen") {
                      const path = polylinePoints(item.points);
                      return (
                        <g key={item.id} onPointerDown={onAnnotationPointerDown(item)}>
                          {/* A wide transparent stroke under the visible one,
                              the same trick the arrow uses: a 3px line is a
                              hard thing to click on. */}
                          <polyline
                            points={path}
                            fill="none"
                            stroke="transparent"
                            strokeWidth="14"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <polyline
                            points={path}
                            fill="none"
                            stroke={item.color}
                            strokeWidth={isSelected ? "4" : "3"}
                            strokeDasharray={isSelected ? "8 5" : undefined}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            pointerEvents="none"
                          />
                          {renderPin(item)}
                        </g>
                      );
                    }

                    // A redaction: the overlay canvas below already shows the
                    // region pixelated exactly as the export will burn it in,
                    // so all this adds is the outline that makes it selectable
                    // - plus the hatch while it is selected, which is what
                    // tells a selected region from a plain one at a glance.
                    // Holding Alt drops both the hatch and the pixelation, so
                    // "reveal" really reveals. No pin, no comment editor - a
                    // redaction carries no note by design.
                    if (item.tool === "redact") {
                      const patternId = `redact-hatch-${item.id}`;
                      const hatched = isSelected && item.id !== revealedId;
                      return (
                        <g key={item.id} onPointerDown={onAnnotationPointerDown(item)}>
                          {hatched ? hatchPattern(patternId, item.color) : null}
                          <rect
                            x={item.x}
                            y={item.y}
                            width={item.width}
                            height={item.height}
                            fill={hatched ? `url(#${patternId})` : "transparent"}
                            fillOpacity="0.35"
                            stroke={item.color}
                            strokeWidth={isSelected ? "4" : "3"}
                            strokeDasharray={isSelected ? "8 5" : undefined}
                            pointerEvents="all"
                          />
                          {isSelected && interactionMode === "move"
                            ? renderResizeHandles(item)
                            : null}
                        </g>
                      );
                    }

                    if (item.tool === "arrow") {
                      return (
                        <g key={item.id} onPointerDown={onAnnotationPointerDown(item)}>
                          <line
                            x1={item.x1}
                            y1={item.y1}
                            x2={item.x2}
                            y2={item.y2}
                            stroke="transparent"
                            strokeWidth="14"
                          />
                          <line
                            x1={item.x1}
                            y1={item.y1}
                            x2={item.x2}
                            y2={item.y2}
                            stroke={item.color}
                            strokeWidth={isSelected ? "4" : "3"}
                            strokeDasharray={isSelected ? "8 5" : undefined}
                            pointerEvents="none"
                          />
                          <polygon
                            points={arrowHeadPoints(item.x1, item.y1, item.x2, item.y2)
                              .map((point) => `${point.x},${point.y}`)
                              .join(" ")}
                            fill={item.color}
                            pointerEvents="none"
                          />
                          {renderPin(item)}
                        </g>
                      );
                    }

                    return (
                      <g key={item.id} onPointerDown={onAnnotationPointerDown(item)}>
                        {/* The pin itself is not clickable, so an empty text
                        annotation still has a hit area to select and drag - on
                        the pin's own (clamped) centre, not the raw anchor. */}
                        <circle
                          cx={pins.get(item.id)?.center.x ?? item.x}
                          cy={pins.get(item.id)?.center.y ?? item.y}
                          r={pinR}
                          fill="transparent"
                          pointerEvents="all"
                        />
                        <text
                          // Offset past the pin so the number never covers the text.
                          x={item.x + pinR * 1.4}
                          y={item.y}
                          fill={item.color}
                          fontSize={pinR * 0.9}
                          fontWeight={isSelected ? "700" : "500"}
                        >
                          {item.text}
                        </text>
                        {renderPin(item)}
                      </g>
                    );
                  })}

                  {selectedAnnotation &&
                  selectedAnnotation.tool !== "redact" &&
                  inlineEditorPosition ? (
                    <foreignObject
                      x={inlineEditorPosition.x}
                      y={inlineEditorPosition.y}
                      width={inlineEditorSize.width}
                      height={inlineEditorSize.height}
                      onPointerDown={(event) => event.stopPropagation()}
                    >
                      <div className="h-full w-full rounded-lg border-2 border-primary bg-card/95 p-1.5 shadow-lg">
                        <textarea
                          ref={inlineCommentRef}
                          className="h-full w-full resize-none rounded-md border border-input bg-card px-2 py-1 text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
                          style={{ fontSize: `${inlineEditorFontSize}px` }}
                          value={selectedNote}
                          onChange={(event) => updateSelectedAnnotationNote(event.target.value)}
                          onFocus={() =>
                            (noteBaselineRef.current = selectedId
                              ? { id: selectedId, value: selectedNote }
                              : null)
                          }
                          onBlur={() => {
                            commitNoteIfDirty();
                            // Tab out of the textarea has nowhere to go (it is
                            // the last focusable thing inside the SVG), so
                            // without this the keyboard lands on `<body>` and
                            // the next Tab wraps to the top of the sidebar.
                            restoreFocusAfterNote(selectedId);
                          }}
                          placeholder="Add comment for selected area"
                          rows={3}
                        />
                      </div>
                    </foreignObject>
                  ) : null}

                  {draft && tool === "box" ? (
                    <rect
                      x={Math.min(draft.xStart, draft.xCurrent)}
                      y={Math.min(draft.yStart, draft.yCurrent)}
                      width={Math.abs(draft.xCurrent - draft.xStart)}
                      height={Math.abs(draft.yCurrent - draft.yStart)}
                      fill="transparent"
                      stroke={color}
                      strokeWidth="2"
                      strokeDasharray="6 4"
                    />
                  ) : null}

                  {draft && tool === "redact" ? (
                    <g pointerEvents="none">
                      {hatchPattern("redact-hatch-draft", color)}
                      <rect
                        {...draftRect(draft)}
                        fill="url(#redact-hatch-draft)"
                        fillOpacity="0.35"
                        stroke={color}
                        strokeWidth="2"
                        strokeDasharray="6 4"
                      />
                    </g>
                  ) : null}

                  {draft && tool === "highlight" ? (
                    <g pointerEvents="none">
                      <rect
                        {...draftRect(draft)}
                        fill={color}
                        fillOpacity={HIGHLIGHT_ALPHA}
                        style={{ mixBlendMode: "multiply" }}
                      />
                      <rect
                        {...draftRect(draft)}
                        fill="none"
                        stroke={color}
                        strokeWidth={HIGHLIGHT_EDGE_WIDTH}
                        strokeDasharray="6 4"
                      />
                    </g>
                  ) : null}

                  {penDraft && penDraft.length > 1 ? (
                    <polyline
                      points={polylinePoints(penDraft)}
                      fill="none"
                      stroke={color}
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      pointerEvents="none"
                    />
                  ) : null}

                  {draft && tool === "arrow" ? (
                    <line
                      x1={draft.xStart}
                      y1={draft.yStart}
                      x2={draft.xCurrent}
                      y2={draft.yCurrent}
                      stroke={color}
                      strokeWidth="2"
                      strokeDasharray="6 4"
                    />
                  ) : null}

                  {/* The crop region: everything outside it dimmed, the region
                    itself outlined in dark-under-dashed-white so the edge reads
                    on a light and a dark capture alike. Not an annotation - no
                    pin, no timeline row, no history entry. Purely decorative,
                    so it never takes a pointer event. */}
                  {shade && outline ? (
                    <g pointerEvents="none" fill="rgba(15,23,42,0.55)">
                      <rect x={0} y={0} width={imageSize.width} height={shade.top} />
                      <rect
                        x={0}
                        y={shade.bottom}
                        width={imageSize.width}
                        height={Math.max(0, imageSize.height - shade.bottom)}
                      />
                      <rect x={0} y={shade.top} width={shade.left} height={outline.height} />
                      <rect
                        x={shade.right}
                        y={shade.top}
                        width={Math.max(0, imageSize.width - shade.right)}
                        height={outline.height}
                      />
                      <rect
                        id="crop-region"
                        {...outline}
                        fill="none"
                        stroke="rgba(15,23,42,0.9)"
                        strokeWidth="3"
                      />
                      <rect
                        {...outline}
                        fill="none"
                        stroke="#ffffff"
                        strokeWidth="2"
                        strokeDasharray="8 6"
                      />
                    </g>
                  ) : null}

                  {/* A marquee waiting for Apply is adjustable: the same eight
                    handles a box gets, so a crop is nudged into place instead
                    of redrawn from scratch. Outside the dimming group above,
                    which takes no pointer events. */}
                  {cropDraft && !draft ? (
                    <g data-crop-handles>
                      {renderHandles(cropDraft, CROP_HANDLE_STYLE, "crop", onCropHandlePointerDown)}
                    </g>
                  ) : null}
                </svg>
              </div>

              {/* Apply/Cancel float just inside the marquee's bottom-left
                  corner rather than appearing as sidebar rows - two rows that
                  pushed every control below them down by ~52px the moment a
                  crop was drawn, and back up again the moment it was applied.
                  Anchored inside the marquee (not below it) so it can never be
                  clipped by the window it is drawn in. */}
              {cropControlsAnchor ? (
                <div
                  data-crop-controls
                  className="absolute z-10 flex -translate-y-full items-stretch gap-1.5 pb-2 pl-2 text-[13px]"
                  style={cropControlsAnchor}
                >
                  {/* Guarded like every other control that changes what an
                      export will contain: an export promise already in flight
                      captured the crop it started with, and letting the canvas
                      move underneath it desyncs the file from the screen. */}
                  <Button size="sm" disabled={isBusy} onClick={applyCropDraft}>
                    Apply crop
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={isBusy}
                    onClick={() => setCropDraft(null)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-muted px-6 py-16 text-center text-sm text-muted-foreground">
            Capture a page to start annotating.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
