import * as React from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Card, CardContent } from "@/components/ui/card";
import { moveAnnotation, uid } from "@/editor/annotation-geometry";
import type { EditorState } from "@/editor/use-editor-state";
import { arrowHeadPoints } from "@/lib/annotate";
import {
  applyBoxResizeDelta,
  BOX_RESIZE_HANDLES,
  getBoxHandlePosition,
  getBoxResizeCursor,
  type BoxResizeHandle
} from "@/lib/boxResize";
import { clampCrop, MIN_CROP_SIZE, type Rect } from "@/lib/crop";
import { placeInlineEditor } from "@/lib/editor-placement";
import {
  annotationBounds,
  canvasScale,
  numberAnnotations,
  pinCenter,
  pinRadius
} from "@/lib/numbering";
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

// Base sizes at canvasScale(1200) === 1; scaled by the image width the same
// way pinRadius is, so they stay a readable on-screen size in fit mode
// instead of shrinking along with a wide capture.
const BASE_RESIZE_HANDLE_SIZE = 9;
const BASE_RESIZE_HANDLE_HIT_SIZE = 16;
const MIN_RESIZE_BOX_SIZE = 8;
/** Image-space size of the inline comment editor; also what its placement is solved for. */
const BASE_INLINE_EDITOR_SIZE = { width: 240, height: 84 };
const BASE_INLINE_EDITOR_FONT_SIZE = 13;
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
    crop,
    cropDraft,
    setCropDraft,
    interactionMode,
    setInteractionMode,
    color,
    baseDataUrl,
    imageSize,
    setImageSize,
    zoom,
    removeAnnotation,
    undoAnnotations,
    redoAnnotations
  } = state;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [draft, setDraft] = useState<DraftShape | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [resize, setResize] = useState<ResizeState | null>(null);
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
  // One numbering for the canvas pins, the comment timeline, the exported image
  // and the LLM prompt: creation order, looked up here by annotation id.
  const pinNumbers = new Map(
    numberAnnotations(annotations).map(({ n, annotation }) => [annotation.id, n])
  );
  // With the crop or redact tool in draw mode the whole canvas is marquee
  // surface, so annotations must not swallow a pointer-down that starts a
  // region on top of one - a secret has to be coverable wherever it sits.
  const drawingRegion = interactionMode === "draw" && (tool === "crop" || tool === "redact");
  // The region the canvas dims around: a marquee being dragged, one waiting for
  // Apply, or the crop already in force (so what the exports will show stays visible).
  const cropRegion: Rect | null = draft && tool === "crop" ? draftRect(draft) : (cropDraft ?? crop);
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
  const pinR = pinRadius(imageSize.width);
  const scale = canvasScale(imageSize.width);
  const resizeHandleSize = BASE_RESIZE_HANDLE_SIZE * scale;
  const resizeHandleHitSize = BASE_RESIZE_HANDLE_HIT_SIZE * scale;
  const inlineEditorSize = {
    width: BASE_INLINE_EDITOR_SIZE.width * scale,
    height: BASE_INLINE_EDITOR_SIZE.height * scale
  };
  const inlineEditorFontSize = BASE_INLINE_EDITOR_FONT_SIZE * scale;
  const hatchSize = BASE_REDACT_HATCH_SIZE * scale;

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

  const renderResizeHandles = (item: RectAnnotation): JSX.Element[] =>
    BOX_RESIZE_HANDLES.map((handle) => {
      const position = getBoxHandlePosition(item, handle);
      return (
        <g key={`${item.id}-${handle}`}>
          <rect
            x={position.x - resizeHandleHitSize / 2}
            y={position.y - resizeHandleHitSize / 2}
            width={resizeHandleHitSize}
            height={resizeHandleHitSize}
            fill="transparent"
            style={{ cursor: getBoxResizeCursor(handle) }}
            onPointerDown={onResizeHandlePointerDown(item, handle)}
          />
          <rect
            x={position.x - resizeHandleSize / 2}
            y={position.y - resizeHandleSize / 2}
            width={resizeHandleSize}
            height={resizeHandleSize}
            fill="white"
            stroke={item.color}
            strokeWidth="1.5"
            pointerEvents="none"
          />
        </g>
      );
    });

  const renderPin = (item: Annotation): JSX.Element => {
    const center = pinCenter(item, pinR, imageSize);
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
          {pinNumbers.get(item.id)}
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

  // Editor keyboard shortcuts, all on one window listener: Escape clears
  // selection/in-progress gestures, Delete/Backspace removes the selected
  // annotation, Ctrl/Cmd+Z undoes and Ctrl/Cmd+Shift+Z (or Ctrl/Cmd+Y) redoes.
  // Everything but Escape is ignored while typing in a field.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        !!target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      if ((event.ctrlKey || event.metaKey) && !isTyping) {
        const key = event.key.toLowerCase();
        if (key === "z" || key === "y") {
          event.preventDefault();
          if (key === "y" || event.shiftKey) redoAnnotations();
          else undoAnnotations();
          return;
        }
      }

      if (event.key === "Escape") {
        if (isTyping) target.blur();
        setSelectedId(null);
        setCropDraft(null);
        setDraft(null);
        setDrag(null);
        setResize(null);
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
  }, [selectedId, setSelectedId, setCropDraft, removeAnnotation, undoAnnotations, redoAnnotations]);

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
   */
  const commitNewAnnotation = (item: Annotation): void => {
    flushSync(() => {
      setAnnotations((prev) => [...prev, item]);
      setSelectedId(item.id);
      setInteractionMode("move");
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

  const onCanvasPointerMove = (event: React.PointerEvent<SVGSVGElement>): void => {
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
      // crop itself only takes effect when the sidebar's Apply is pressed. No
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
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        {baseDataUrl ? (
          // Outer div is the scrollport: fit mode never overflows it, actual
          // mode (image wider than the pane) scrolls inside it, never the
          // page body. Inner div sizes to the image's real rendered box -
          // block/w-full in fit mode so the image's own w-full resolves
          // against it, inline-block in actual mode so it shrink-wraps to
          // the image's natural (possibly wider-than-pane) size. The SVG
          // overlay's h-full/w-full is percentage-based against *this* box,
          // so it must always match the image exactly or pointer math and
          // hit-testing silently miss the part of the image past the pane.
          <div
            id="capture-viewport"
            className="w-full overflow-auto rounded-lg border border-border bg-card"
          >
            <div
              className={`relative ${zoom === "fit" ? "block w-full" : "inline-block align-bottom"}`}
            >
              <img
                id="capture-image"
                src={baseDataUrl}
                alt="Captured page"
                className={
                  zoom === "fit" ? "block h-auto w-full max-w-full" : "block h-auto max-w-none"
                }
                // Fit mode is "shrink to fit, never upscale": a capture
                // narrower than the pane should render at its real size, not
                // stretch to fill it.
                style={zoom === "fit" ? { maxWidth: imageSize.width } : undefined}
                onLoad={(event) => {
                  const img = event.currentTarget;
                  setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
                }}
              />
              <svg
                ref={svgRef}
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
                        cx={pinCenter(item, pinR, imageSize).x}
                        cy={pinCenter(item, pinR, imageSize).y}
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
              </svg>
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
