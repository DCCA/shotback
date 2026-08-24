export type AnnotationTool = "box" | "arrow" | "text" | "redact";

/**
 * The live element an annotation points at, read back from the captured tab so
 * a prompt can name it ("button.cta in PricingCard") instead of only pointing
 * at pixels. Derived data: it is re-read on every commit and may be absent
 * (tab closed, nothing under the point, a share saved before this existed).
 */
export interface ElementContext {
  /** `#pricing > div.card:nth-of-type(2) > button.cta` */
  cssPath: string;
  tag: string;
  id?: string;
  /** First five classes. */
  classes: string[];
  role?: string;
  /** `data-testid` */
  testId?: string;
  /** First 80 chars of the visible text, whitespace collapsed. */
  text?: string;
  /** React owner chain, nearest first, at most three. */
  component?: string[];
  /** Page CSS px, in the same coordinate space as the stitched capture. */
  rect: { x: number; y: number; width: number; height: number };
}

export interface AnnotationBase {
  id: string;
  tool: AnnotationTool;
  color: string;
  createdAt: string;
  comment?: string;
  context?: ElementContext;
}

export interface BoxAnnotation extends AnnotationBase {
  tool: "box";
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ArrowAnnotation extends AnnotationBase {
  tool: "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface TextAnnotation extends AnnotationBase {
  tool: "text";
  x: number;
  y: number;
  text: string;
}

/**
 * A region hidden from every export: `exportAnnotatedImage` pixelates it onto
 * the base image before it draws anything else, so no output carries the
 * pixels underneath. It is deliberately mute - it is never numbered, never
 * inspected against the live page, gets no pin and no comment editor, and its
 * `comment`/`context` are never populated - because a note or a selector about
 * a hidden region would describe the very thing the user hid.
 */
export interface RedactAnnotation extends AnnotationBase {
  tool: "redact";
  /** Never populated, and `never` so the compiler is the one enforcing that. */
  comment?: never;
  context?: never;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Annotation = BoxAnnotation | ArrowAnnotation | TextAnnotation | RedactAnnotation;

/** The annotations that are plain rectangles: drawn, dragged and resized alike. */
export type RectAnnotation = BoxAnnotation | RedactAnnotation;
