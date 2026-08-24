export type AnnotationTool = "box" | "arrow" | "text";

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

export type Annotation = BoxAnnotation | ArrowAnnotation | TextAnnotation;
