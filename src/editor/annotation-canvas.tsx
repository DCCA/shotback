import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { annotationCommentAnchor, moveAnnotation, uid } from "@/editor/annotation-geometry";
import type { EditorState } from "@/editor/use-editor-state";
import {
  applyBoxResizeDelta,
  BOX_RESIZE_HANDLES,
  getBoxHandlePosition,
  getBoxResizeCursor,
  type BoxResizeHandle
} from "@/lib/boxResize";
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
    setImageSize
  } = state;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [draft, setDraft] = useState<DraftShape | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [resize, setResize] = useState<ResizeState | null>(null);
  // A pointer-down on an annotation or a resize handle starts a gesture but is
  // also just a selection click; only an actual move/resize is worth committing.
  const gestureMovedRef = useRef(false);

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

  const selectedAnchor = selectedAnnotation ? annotationCommentAnchor(selectedAnnotation) : null;
  const inlineEditorPosition = selectedAnchor
    ? {
        x: Math.max(10, Math.min(selectedAnchor.x + 14, imageSize.width - 250)),
        y: Math.max(10, Math.min(selectedAnchor.y + 14, imageSize.height - 90))
      }
    : null;

  useEffect(() => {
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

  // Editor keyboard shortcuts: Escape clears selection/in-progress gestures,
  // Delete/Backspace removes the selected annotation (unless typing in a field).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        !!target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

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
        setAnnotations((prev) => prev.filter((item) => item.id !== selectedId));
        setResize((current) => (current?.id === selectedId ? null : current));
        setSelectedId(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, setAnnotations, setSelectedId]);

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

  const onCanvasPointerDown = (event: React.PointerEvent<SVGSVGElement>): void => {
    if (!baseDataUrl) return;

    if (interactionMode !== "draw") {
      setSelectedId(null);
      return;
    }

    setSelectedId(null);

    const { x, y } = pointerPos(event);

    if (tool === "text") {
      const item: Annotation = {
        id: uid(),
        tool: "text",
        x,
        y,
        text: "",
        color,
        createdAt: new Date().toISOString()
      };

      setAnnotations((prev) => [...prev, item]);
      setSelectedId(item.id);
      setInteractionMode("move");
      setShouldFocusSelectedComment(true);
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
        setAnnotations((prev) => [...prev, item]);
        setSelectedId(item.id);
        setInteractionMode("move");
        setShouldFocusSelectedComment(true);
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
      setAnnotations((prev) => [...prev, item]);
      setSelectedId(item.id);
      setInteractionMode("move");
      setShouldFocusSelectedComment(true);
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
              <defs>
                <marker
                  id="arrow-head"
                  markerWidth="10"
                  markerHeight="10"
                  refX="7"
                  refY="3"
                  orient="auto"
                >
                  <polygon points="0 0, 8 3, 0 6" fill="currentColor" />
                </marker>
              </defs>

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
                        markerEnd="url(#arrow-head)"
                        strokeDasharray={isSelected ? "8 5" : undefined}
                        pointerEvents="none"
                        // The arrow-head marker fills with currentColor; set it so the
                        // head matches the arrow stroke instead of inheriting page text color.
                        style={{ color: item.color }}
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
                  width={240}
                  height={84}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <div className="h-full w-full rounded-lg border-2 border-primary bg-card/95 p-1.5 shadow-lg">
                    <textarea
                      ref={inlineCommentRef}
                      className="h-full w-full resize-none rounded-md border border-input bg-card px-2 py-1 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
                      value={selectedNote}
                      onChange={(event) => updateSelectedAnnotationNote(event.target.value)}
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
