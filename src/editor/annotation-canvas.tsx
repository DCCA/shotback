import * as React from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Card, CardContent } from "@/components/ui/card";
import { annotationBounds, moveAnnotation, uid } from "@/editor/annotation-geometry";
import type { EditorState } from "@/editor/use-editor-state";
import { arrowHeadPoints } from "@/lib/annotate";
import {
  applyBoxResizeDelta,
  BOX_RESIZE_HANDLES,
  getBoxHandlePosition,
  getBoxResizeCursor,
  type BoxResizeHandle
} from "@/lib/boxResize";
import { placeInlineEditor } from "@/lib/editor-placement";
import { numberAnnotations, pinCenter, pinRadius } from "@/lib/numbering";
import type { Annotation, BoxAnnotation } from "@/types/annotation";

interface DraftShape {
  xStart: number;
  yStart: number;
  xCurrent: number;
  yCurrent: number;
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

const RESIZE_HANDLE_SIZE = 9;
const RESIZE_HANDLE_HIT_SIZE = 16;
const MIN_RESIZE_BOX_SIZE = 8;
/** Image-space size of the inline comment editor; also what its placement is solved for. */
const INLINE_EDITOR_SIZE = { width: 240, height: 84 };

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
    interactionMode,
    setInteractionMode,
    color,
    baseDataUrl,
    imageSize,
    setImageSize,
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
  // The comment text as it was when the inline editor took focus.
  const noteAtFocusRef = useRef("");

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
  const pinR = pinRadius(imageSize.width);

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
    ? placeInlineEditor(annotationBounds(selectedAnnotation), imageSize, INLINE_EDITOR_SIZE)
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
  }, [selectedId, setSelectedId, removeAnnotation, undoAnnotations, redoAnnotations]);

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
   */
  const commitNewAnnotation = (item: Annotation): void => {
    flushSync(() => {
      setAnnotations((prev) => [...prev, item]);
      setSelectedId(item.id);
      setInteractionMode("move");
      setShouldFocusSelectedComment(true);
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
      return;
    }

    setDraft({ xStart: x, yStart: y, xCurrent: x, yCurrent: y });
  };

  const onAnnotationPointerDown =
    (item: Annotation) =>
    (event: React.PointerEvent<SVGElement>): void => {
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
    (item: BoxAnnotation, handle: BoxResizeHandle) =>
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
          item.id === resize.id && item.tool === "box" ? { ...item, ...result.box } : item
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

    let added = false;

    if (tool === "box") {
      const x = Math.min(draft.xStart, draft.xCurrent);
      const y = Math.min(draft.yStart, draft.yCurrent);
      const width = Math.abs(draft.xCurrent - draft.xStart);
      const height = Math.abs(draft.yCurrent - draft.yStart);

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
    setAnnotations((prev) =>
      prev.map((item) => {
        if (item.id !== selectedId) return item;
        if (item.tool === "text") return { ...item, text: value };
        return { ...item, comment: value };
      })
    );
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        {baseDataUrl ? (
          <div className="relative inline-block rounded-lg border border-border bg-card">
            <img
              id="capture-image"
              src={baseDataUrl}
              alt="Captured page"
              className="block h-auto max-w-none"
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
                        ? BOX_RESIZE_HANDLES.map((handle) => {
                            const position = getBoxHandlePosition(item, handle);
                            return (
                              <g key={`${item.id}-${handle}`}>
                                <rect
                                  x={position.x - RESIZE_HANDLE_HIT_SIZE / 2}
                                  y={position.y - RESIZE_HANDLE_HIT_SIZE / 2}
                                  width={RESIZE_HANDLE_HIT_SIZE}
                                  height={RESIZE_HANDLE_HIT_SIZE}
                                  fill="transparent"
                                  style={{ cursor: getBoxResizeCursor(handle) }}
                                  onPointerDown={onResizeHandlePointerDown(item, handle)}
                                />
                                <rect
                                  x={position.x - RESIZE_HANDLE_SIZE / 2}
                                  y={position.y - RESIZE_HANDLE_SIZE / 2}
                                  width={RESIZE_HANDLE_SIZE}
                                  height={RESIZE_HANDLE_SIZE}
                                  fill="white"
                                  stroke={item.color}
                                  strokeWidth="1.5"
                                  pointerEvents="none"
                                />
                              </g>
                            );
                          })
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

              {selectedAnnotation && inlineEditorPosition ? (
                <foreignObject
                  x={inlineEditorPosition.x}
                  y={inlineEditorPosition.y}
                  width={INLINE_EDITOR_SIZE.width}
                  height={INLINE_EDITOR_SIZE.height}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <div className="h-full w-full rounded-lg border-2 border-primary bg-card/95 p-1.5 shadow-lg">
                    <textarea
                      ref={inlineCommentRef}
                      className="h-full w-full resize-none rounded-md border border-input bg-card px-2 py-1 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
                      value={selectedNote}
                      onChange={(event) => updateSelectedAnnotationNote(event.target.value)}
                      // One history entry per editing session, not per
                      // keystroke: snapshot on blur, and only if it changed.
                      onFocus={(event) => {
                        noteAtFocusRef.current = event.target.value;
                      }}
                      onBlur={(event) => {
                        if (event.target.value !== noteAtFocusRef.current) onCommit();
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
            </svg>
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
