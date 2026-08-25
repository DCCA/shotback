import * as React from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { moveAnnotation, uid } from "@/editor/annotation-geometry";
import { StatusToast } from "@/editor/status-toast";
import { ToolPalette } from "@/editor/tool-palette";
import type { EditorState } from "@/editor/use-editor-state";
import { arrowHeadPoints } from "@/lib/annotate";
import {
  applyBoxResizeDelta,
  BOX_RESIZE_HANDLES,
  getBoxHandlePosition,
  getBoxResizeCursor,
  type BoxResizeHandle
} from "@/lib/boxResize";
import { applyCrop, clampCrop, cropViewMetrics, MIN_CROP_SIZE, type Rect } from "@/lib/crop";
import { placeInlineEditor } from "@/lib/editor-placement";
import { annotationBounds, canvasScale, numberAnnotations, viewPins } from "@/lib/numbering";
import { hotkeyTool } from "@/lib/tool-palette";
import type { Annotation, BoxAnnotation, RectAnnotation } from "@/types/annotation";

interface DraftShape {
  xStart: number;
  yStart: number;
  xCurrent: number;
  yCurrent: number;
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
  const [draft, setDraft] = useState<DraftShape | null>(null);
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

  // The inline editor is gone (deselected, unmounted, or moved to another
  // annotation): write the pending comment before the selection changes.
  useEffect(() => {
    if (!selectedId) return;
    return () => commitNoteIfDirty();
    // `selectedId` only: the cleanup must run when the selection changes, not
    // on every render. `onCommit` reaches the live annotations through a ref,
    // so the captured closure stays correct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Editor keyboard shortcuts, all on one window listener: V/B/A/T/R/C pick a
  // tool from the palette, Escape clears selection/in-progress gestures,
  // Delete/Backspace removes the selected annotation, Ctrl/Cmd+Z undoes and
  // Ctrl/Cmd+Shift+Z (or Ctrl/Cmd+Y) redoes. Everything but Escape is ignored
  // while typing in a field - the comment editor is a textarea on the canvas,
  // so an unguarded "b" would swallow every letter of a note.
  useEffect(() => {
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

      if (event.key === "Escape") {
        if (isTyping) target.blur();
        setSelectedId(null);
        setCropDraft(null);
        setDraft(null);
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

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // `applyCropDraft` closes over the live `cropDraft`/`isBusy` and is
    // recreated each render, so the listener is re-bound with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedId,
    setSelectedId,
    setCropDraft,
    removeAnnotation,
    undoAnnotations,
    redoAnnotations,
    setPaletteTool,
    baseDataUrl,
    cropDraft,
    isBusy
  ]);

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
          item.id === resize.id && (item.tool === "box" || item.tool === "redact")
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
                <svg
                  ref={svgRef}
                  role="group"
                  aria-label="Annotation canvas. Drawing requires a pointer; annotations can be managed from the comment timeline."
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

                    // A redaction: hatched so it reads as "covered" without
                    // hiding what it covers from the person who drew it (the
                    // pixels only go for good in the export). No pin, no
                    // comment editor - it carries no note by design.
                    if (item.tool === "redact") {
                      const patternId = `redact-hatch-${item.id}`;
                      return (
                        <g key={item.id} onPointerDown={onAnnotationPointerDown(item)}>
                          {hatchPattern(patternId, item.color)}
                          <rect
                            x={item.x}
                            y={item.y}
                            width={item.width}
                            height={item.height}
                            fill={`url(#${patternId})`}
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
                          onBlur={commitNoteIfDirty}
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
