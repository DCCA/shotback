import type { CaptureEnvironment, PageDiagnostics } from "@/lib/capture";
import { describeGeometry, numberAnnotations, redactions } from "@/lib/numbering";
import type { Annotation, ElementContext } from "@/types/annotation";

/**
 * How much a prompt says: `compact` is numbers, notes, general feedback and
 * the page URL only; `standard` (the default, and today's shape) adds the
 * Environment block, per-annotation geometry and the element each annotation
 * covers; `detailed` adds the Diagnostics block and, under each annotation
 * that has one, its element's text/classes/rect.
 */
export type Verbosity = "compact" | "standard" | "detailed";

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
 * Detailed-only lines under a numbered comment, naming the element's visible
 * text, classes and page-px rect - the fields `describeContext`'s one-line
 * suffix has no room for.
 */
function describeContextDetail(context: ElementContext): string[] {
  const { x, y, width, height } = context.rect;
  return [
    `   text: "${context.text ?? ""}"`,
    `   classes: [${context.classes.join(", ")}]`,
    `   rect: ${Math.round(x)},${Math.round(y)} ${Math.round(width)}x${Math.round(height)}`
  ];
}

/**
 * Numbered, tool-tagged list of area comments shared by the prompt builders.
 * The numbers come from `numberAnnotations`, so they match the pins drawn on
 * the image and the numbers shown in the comment timeline. At `compact` only
 * the number, tool and note appear. At `standard` and above, each line also
 * carries the annotation's geometry (px and % of page) when an image size is
 * given, and the live element it was mapped to when one was found. At
 * `detailed`, a context also expands into indented text/classes/rect lines.
 */
function formatAreaComments(
  annotations: Annotation[],
  verbosity: Verbosity,
  image?: { width: number; height: number }
): string {
  const lines = numberAnnotations(annotations).flatMap(({ n, annotation }) => {
    const note = `${n}. [${annotation.tool}] ${noteText(annotation)}`;
    if (verbosity === "compact") return [note];

    const withGeometry = image ? `${note} - ${describeGeometry(annotation, image)}` : note;
    const line = annotation.context
      ? `${withGeometry}${describeContext(annotation.context)}`
      : withGeometry;

    if (verbosity !== "detailed" || !annotation.context) return [line];
    return [line, ...describeContextDetail(annotation.context)];
  });

  return lines.length > 0 ? lines.join("\n") : "(none)";
}

/**
 * One line saying how much of the image is hidden, so a reader knows a blank
 * block is deliberate rather than a rendering bug - and knows not to ask what
 * is under it. Carried at every verbosity, `compact` included: it is a fact
 * about the attached image, and one line is cheap. Nothing renders when
 * nothing is redacted, so a prompt without one is byte-identical to before.
 */
function redactionLines(annotations: Annotation[]): string[] {
  const count = redactions(annotations).length;
  return count > 0 ? [`Redacted regions: ${count}`, ""] : [];
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
 * `compact` drops both blocks; the Diagnostics block is `detailed`-only.
 */
function contextLines(
  verbosity: Verbosity,
  environment?: CaptureEnvironment,
  diagnostics?: PageDiagnostics
): string[] {
  if (verbosity === "compact") return [];

  const blocks = [
    environmentBlock(environment),
    verbosity === "detailed" ? diagnosticsBlock(diagnostics) : []
  ].filter((block) => block.length > 0);
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
  verbosity?: Verbosity;
}): string {
  const verbosity = params.verbosity ?? "standard";
  return [
    "Please review this screenshot and provide feedback.",
    "",
    `Page URL: ${params.pageUrl || "(unknown)"}`,
    ...contextLines(verbosity, params.environment, params.diagnostics),
    `General feedback context: ${params.generalFeedback.trim() || "(none)"}`,
    "",
    ...redactionLines(params.annotations),
    "Area comments:",
    formatAreaComments(params.annotations, verbosity, params.image)
  ].join("\n");
}

/**
 * Build the prompt copied to the clipboard for a Claude Code session. Leads with
 * the saved file's path so Claude can read the image directly from disk (e.g. a
 * Windows Downloads path translated to its WSL `/mnt/...` equivalent), followed
 * by the JSON sidecar written beside it when one was saved.
 */
/**
 * The Claude Code prompt for a batch of saved shares. It leads with the one
 * JSON path, because that file holds every capture's annotations, selectors
 * and environment - the prompt itself stays a numbered index (page, how many
 * annotations, image path) so a ten-capture batch does not bury the reader in
 * prose that is already in the JSON.
 */
export function buildBatchPrompt(
  entries: Array<{ pageUrl: string; imagePath: string; annotationCount: number }>,
  sidecarPath: string
): string {
  const heading =
    entries.length === 1
      ? "Review this screenshot."
      : `Review these ${entries.length} screenshots together.`;
  return [
    heading,
    `Machine-readable annotations for every capture (selectors, rects, environment): ${sidecarPath}`,
    "",
    ...entries.map((entry, index) => {
      const count = `${entry.annotationCount} annotation${entry.annotationCount === 1 ? "" : "s"}`;
      return `${index + 1}. ${entry.pageUrl || "(unknown)"} - ${count} - ${entry.imagePath}`;
    })
  ].join("\n");
}

export function buildClaudeCodePrompt(params: {
  filePath: string;
  /** Absolute path of the JSON sidecar; omitted when it could not be written. */
  sidecarPath?: string;
  pageUrl: string;
  generalFeedback: string;
  annotations: Annotation[];
  environment?: CaptureEnvironment;
  diagnostics?: PageDiagnostics;
  image?: { width: number; height: number };
  verbosity?: Verbosity;
}): string {
  const verbosity = params.verbosity ?? "standard";
  return [
    `Review this screenshot: ${params.filePath}`,
    ...(params.sidecarPath
      ? [`Machine-readable annotations (selectors, rects, diagnostics): ${params.sidecarPath}`]
      : []),
    "",
    `Page URL: ${params.pageUrl || "(unknown)"}`,
    ...contextLines(verbosity, params.environment, params.diagnostics),
    `General feedback context: ${params.generalFeedback.trim() || "(none)"}`,
    "",
    ...redactionLines(params.annotations),
    "Area comments:",
    formatAreaComments(params.annotations, verbosity, params.image)
  ].join("\n");
}
