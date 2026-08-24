import type { CaptureEnvironment, PageDiagnostics } from "@/lib/capture";
import { noteText } from "@/lib/feedback";
import { annotationBounds, numberAnnotations, redactions } from "@/lib/numbering";
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
 * A hidden region, listed so an agent knows the blocks in the PNG are
 * deliberate. Deliberately barer than an annotation: no `n` (it has no pin),
 * no `comment` and no `context` - a selector or a note about a redacted region
 * would describe exactly what the user hid.
 */
export interface SidecarRedaction {
  tool: "redact";
  rect: SidecarRect;
  normalizedRect: SidecarRect;
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
  /** Omitted when nothing was redacted, so an untouched capture's JSON is unchanged. */
  redactions?: SidecarRedaction[];
  diagnostics?: PageDiagnostics;
  /** Omitted when the caller does not say - present whenever `imagePath` is. */
  imageFormat?: "png" | "jpeg";
  /** File name of the exported image, relative to the folder the JSON sits in: `cap-<ts>.png` (or `.jpg`). */
  imagePath: string;
}

/**
 * The one JSON written for a batch of saved shares: every capture's own
 * sidecar, in the order the prompt numbers them. Each capture's `imagePath` is
 * relative to the batch folder the JSON sits in, so the whole folder can be
 * moved without breaking the links.
 */
export interface BatchSidecar {
  version: 1;
  captures: Sidecar[];
}

/** Pure: the captures are already whole sidecars, so this only stamps the version. */
export function buildBatchSidecar(captures: Sidecar[]): BatchSidecar {
  return { version: 1, captures };
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

function redactionsField(
  annotations: Annotation[],
  image: { width: number; height: number }
): { redactions?: SidecarRedaction[] } {
  const hidden = redactions(annotations).map((region) => {
    const rect = annotationBounds(region);
    return { tool: "redact" as const, rect, normalizedRect: normalizeRect(rect, image) };
  });
  return hidden.length > 0 ? { redactions: hidden } : {};
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
  imageFormat?: "png" | "jpeg";
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
    ...redactionsField(params.annotations, params.image),
    ...(params.diagnostics ? { diagnostics: params.diagnostics } : {}),
    ...(params.imageFormat ? { imageFormat: params.imageFormat } : {}),
    imagePath: params.imagePath
  };
}
