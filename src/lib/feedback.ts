import type { CaptureEnvironment, PageDiagnostics } from "@/lib/capture";
import { describeGeometry, numberAnnotations } from "@/lib/numbering";
import type { Annotation, ElementContext } from "@/types/annotation";

/** Short, human-readable summary of a single annotation for timeline rows. */
export function annotationSummary(annotation: Annotation): string {
  if (annotation.tool === "text") return annotation.text;
  return annotation.comment?.trim() || "(no comment)";
}

/**
 * The note an annotation contributes to the prompt list and to the exported
 * legend, placeholders included. Both call this so their wording cannot drift.
 */
export function noteText(annotation: Annotation): string {
  if (annotation.tool === "text") return annotation.text.trim() || "(empty)";
  return annotation.comment?.trim() || "(no comment)";
}

/** The element an annotation sits on: ` -> css.path in <Component > Chain>`. */
function describeContext(context: ElementContext): string {
  const component = context.component?.length ? ` in <${context.component.join(" > ")}>` : "";
  return ` -> ${context.cssPath}${component}`;
}

/**
 * Numbered, tool-tagged list of area comments shared by the prompt builders.
 * The numbers come from `numberAnnotations`, so they match the pins drawn on
 * the image and the numbers shown in the comment timeline. When an image size
 * is given, each line also carries the annotation's geometry (px and % of
 * page) so an agent can locate it without opening the picture, and when the
 * annotation was mapped back to a live element, the element that names it.
 */
function formatAreaComments(
  annotations: Annotation[],
  image?: { width: number; height: number }
): string {
  const comments = numberAnnotations(annotations)
    .map(({ n, annotation }) => {
      const note = `${n}. [${annotation.tool}] ${noteText(annotation)}`;
      const line = image ? `${note} - ${describeGeometry(annotation, image)}` : note;
      return annotation.context ? `${line}${describeContext(annotation.context)}` : line;
    })
    .join("\n");

  return comments || "(none)";
}

/** The diagnostics list is clamped to what the type promises to carry. */
const MAX_DIAGNOSTICS = 20;

/** The captured tab's context. Empty when no environment was captured. */
function environmentBlock(environment?: CaptureEnvironment): string[] {
  if (!environment) return [];

  return [
    "Environment:",
    `- Page title: ${environment.pageTitle.trim() || "(untitled)"}`,
    `- Viewport: ${environment.viewport.width}x${environment.viewport.height} @${environment.devicePixelRatio}x`,
    `- Color scheme: ${environment.colorScheme}`,
    `- Scroller: ${environment.scroller}`,
    `- User agent: ${environment.userAgent}`,
    `- Captured at: ${environment.capturedAt}`
  ];
}

/**
 * What the page reported going wrong, as prompt lines. Empty when nothing was
 * collected - which is the common case, and keeps those prompts byte-identical
 * to what they were before diagnostics existed.
 */
function diagnosticsBlock(diagnostics?: PageDiagnostics): string[] {
  const failedRequests = diagnostics?.failedRequests.slice(0, MAX_DIAGNOSTICS) ?? [];
  if (failedRequests.length === 0) return [];

  return [
    "Diagnostics:",
    "- Failed requests:",
    ...failedRequests.map((request, index) => `  ${index + 1}. ${request.status} ${request.url}`)
  ];
}

/**
 * The context blocks between the `Page URL:` line and the feedback, blank-line
 * separated, with no blank lines at all when every block is empty (an old share
 * restored from before any of this existed keeps exactly the shape it had).
 */
function contextLines(environment?: CaptureEnvironment, diagnostics?: PageDiagnostics): string[] {
  const blocks = [environmentBlock(environment), diagnosticsBlock(diagnostics)].filter(
    (block) => block.length > 0
  );
  if (blocks.length === 0) return [];

  return ["", ...blocks.flatMap((block, index) => (index === 0 ? block : ["", ...block])), ""];
}

/**
 * Build the structured prompt handed to an external/cloud LLM alongside the
 * downloaded annotated image. Kept pure so it can be unit tested.
 */
export function buildExternalLlmPrompt(params: {
  pageUrl: string;
  generalFeedback: string;
  annotations: Annotation[];
  environment?: CaptureEnvironment;
  diagnostics?: PageDiagnostics;
  image?: { width: number; height: number };
}): string {
  return [
    "Please review this screenshot and provide feedback.",
    "",
    `Page URL: ${params.pageUrl || "(unknown)"}`,
    ...contextLines(params.environment, params.diagnostics),
    `General feedback context: ${params.generalFeedback.trim() || "(none)"}`,
    "",
    "Area comments:",
    formatAreaComments(params.annotations, params.image)
  ].join("\n");
}

/**
 * Build the prompt copied to the clipboard for a Claude Code session. Leads with
 * the saved file's path so Claude can read the image directly from disk (e.g. a
 * Windows Downloads path translated to its WSL `/mnt/...` equivalent).
 */
export function buildClaudeCodePrompt(params: {
  filePath: string;
  pageUrl: string;
  generalFeedback: string;
  annotations: Annotation[];
  environment?: CaptureEnvironment;
  diagnostics?: PageDiagnostics;
  image?: { width: number; height: number };
}): string {
  return [
    `Review this screenshot: ${params.filePath}`,
    "",
    `Page URL: ${params.pageUrl || "(unknown)"}`,
    ...contextLines(params.environment, params.diagnostics),
    `General feedback context: ${params.generalFeedback.trim() || "(none)"}`,
    "",
    "Area comments:",
    formatAreaComments(params.annotations, params.image)
  ].join("\n");
}
