export type AnnotationTool = "box" | "arrow" | "text";

export interface AnnotationBase {
  id: string;
  tool: AnnotationTool;
  color: string;
  createdAt: string;
  comment?: string;
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
