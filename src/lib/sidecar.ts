import type { CaptureEnvironment, PageDiagnostics } from "@/lib/capture";
import { noteText } from "@/lib/feedback";
import { annotationBounds, numberAnnotations } from "@/lib/numbering";
import type { Annotation, AnnotationTool, ElementContext } from "@/types/annotation";

export interface SidecarRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SidecarAnnotation {
  /** Matches the pin drawn on the image and the timeline row. */
  n: number;
  tool: AnnotationTool;
  comment: string;
  /** Image px. An arrow is its bounding box; a text run is its estimated bounds. */
  rect: SidecarRect;
  /** The same rect as a 0..1 fraction of the image, so layout survives a resize. */
  normalizedRect: SidecarRect;
  context?: ElementContext;
}

/**
 * The machine-readable half of the Claude Code handoff: the same review the
 * prompt describes in prose, as JSON written beside the PNG. An agent reads it
 * instead of pixel-hunting in the image.
 */
export interface Sidecar {
  version: 1;
  capturedAt: string;
  environment?: CaptureEnvironment;
  pageUrl: string;
  generalFeedback: string;
  annotations: SidecarAnnotation[];
  diagnostics?: PageDiagnostics;
  /** Relative to the downloads folder: `shotback/cap-<ts>.png`. */
  imagePath: string;
}

/** 4dp is ~0.1px on a 1000px-wide capture: precise enough, still readable. */
function normalize(value: number, extent: number): number {
  if (!(extent > 0)) return 0;
  return Math.round((value / extent) * 1e4) / 1e4;
}

function normalizeRect(rect: SidecarRect, image: { width: number; height: number }): SidecarRect {
  return {
    x: normalize(rect.x, image.width),
    y: normalize(rect.y, image.height),
    width: normalize(rect.width, image.width),
    height: normalize(rect.height, image.height)
  };
}

/**
 * Pure; every value comes from the caller so the whole sidecar is unit
 * testable. Numbering is `numberAnnotations`, so the JSON, the prompt and the
 * pins on the same export cannot disagree about which annotation is which -
 * they are all built from the one list the caller passes. With a crop active
 * that list is the one `applyCrop` kept, so the editor's timeline (which
 * numbers the full list) can legitimately number the same annotation higher.
 */
export function buildSidecar(params: {
  capturedAt: string;
  pageUrl: string;
  generalFeedback: string;
  annotations: Annotation[];
  /** The stitched capture's pixel size, for `normalizedRect`. */
  image: { width: number; height: number };
  imagePath: string;
  environment?: CaptureEnvironment;
  diagnostics?: PageDiagnostics;
}): Sidecar {
  return {
    version: 1,
    capturedAt: params.capturedAt,
    ...(params.environment ? { environment: params.environment } : {}),
    pageUrl: params.pageUrl,
    generalFeedback: params.generalFeedback.trim(),
    annotations: numberAnnotations(params.annotations).map(({ n, annotation }) => {
      const rect = annotationBounds(annotation);
      return {
        n,
        tool: annotation.tool,
        comment: noteText(annotation),
        rect,
        normalizedRect: normalizeRect(rect, params.image),
        ...(annotation.context ? { context: annotation.context } : {})
      };
    }),
    ...(params.diagnostics ? { diagnostics: params.diagnostics } : {}),
    imagePath: params.imagePath
  };
}
