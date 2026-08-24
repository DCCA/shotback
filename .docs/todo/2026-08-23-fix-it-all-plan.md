# Fix-It-All Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every finding in the 2026-08-23 product review: fix the P0 defects, reach table-stakes parity for a screenshot editor, and make the agent handoff carry the context competitors send.

**Architecture:** Three phases, each a sequence of one-PR change folders under `.docs/` (FIREHOSE). Phase 1 first splits the 1,171-line editor into focused modules so every later task lands in a small file, then fixes the P0 defects and the cheapest table-stakes gaps. Phase 2 extends `PageMetrics`/`Annotation` with environment, geometry and DOM context, emits a JSON sidecar next to the PNG, and ships a Claude Code skill that consumes it. Phase 3 adds capture modes, redaction, richer tools, and Web Store distribution. Pure logic stays in `src/lib/*` with Vitest; anything that needs Chrome is verified by the Playwright e2e suite, which runs the real extension.

**Tech Stack:** TypeScript strict, React 18, Vite 8, Tailwind 3 (HSL token system), Vitest 4, Playwright 1.61 (`npm run test:e2e`), Chrome MV3.

**Spec:** `.docs/reviews/2026-08-23-product-review.md` (PR #19). The scorecard and P0-P3 lists there are the requirements; this plan argues from them.

## Global Constraints

- `npm run check` (typecheck, lint, test, build) and `npm run format:check` must be green before every PR; `npm run test:e2e` must be green for any task that touches capture, content script, or editor UI.
- Never commit to `main`; one change folder + one PR per task (`.docs/todo/<name>/` -> `doing/` -> `done/` with `completion-summary.md`).
- No new runtime dependencies without a line in the task explaining why stdlib/React cannot do it.
- No hardcoded `slate-*`/`emerald-*`/`white` colour classes in `src/`: use the semantic tokens (`bg-card`, `text-muted-foreground`, `border-border`, ...). Add a token if one is missing.
- Permissions changes require a `SECURITY.md` update in the same PR.
- Pure logic in `src/lib/*` (no `chrome.*`), unit-tested in `tests/*.test.ts`.
- UI redesign items (marked **DESIGN GATE**) start by rendering 2-3 options with the `prototype`/`visual-verify` skills and waiting for the owner's pick. Bug fixes are not gated.
- Commit messages: conventional (`fix:`, `feat:`, `refactor:`, `docs:`), no co-author lines, no em dashes.
- All prose, commit messages and docs use a plain dash "-", never an em dash.

---

## Sequencing

```
Task 0  merge open PRs #17 #18 #19, rebase
Task 1  split editor into modules (pure move)        <- everything below lands in small files
Task 2  hide scrollbar during capture                (P0-4)
Task 3  dark theme: tokens + prefers-color-scheme    (P0-1)
Task 4  share URL wrapping                           (P0-3 sidebar)
Task 5  one numbering for timeline, prompt, canvas, export; numbered pins + legend  (P0-2, P1)
Task 6  inline comment editor placement + focus race (P0-5, P0-6)
Task 7  undo/redo history                            (P0-6, P1)
Task 8  fit-to-width / 1:1 zoom                      (P1)
Task 9  capture shortcut via manifest commands       (P1)
Task 10 copy annotated PNG to clipboard              (P1)
Task 11 colour swatches + tool hotkeys               (P1, DESIGN GATE)
Task 12 output action hierarchy                      (P3, DESIGN GATE)
---- Phase 2: handoff v2 (tasks 13-19) ----
---- Phase 3: parity and distribution (tasks 20-27) ----
```

---

# Phase 1 - fix and tighten

### Task 0: Merge open PRs and rebase

**Files:** none (git only)

- [ ] **Step 1: Confirm each PR is green and merge in order**

```bash
gh pr checks 17 && gh pr merge 17 --squash --delete-branch
gh pr checks 18 && gh pr merge 18 --squash --delete-branch
gh pr checks 19 && gh pr merge 19 --squash --delete-branch
git checkout main && git pull --ff-only
```

- [ ] **Step 2: Verify main is green locally**

Run: `npm ci && npm run check && npm run test:e2e`
Expected: 56 unit tests pass, 5 e2e tests pass.

---

### Task 1: Split the editor into modules (pure move, no behaviour change)

**Files:**
- Modify: `src/editor/main.tsx` (becomes a thin composition root, < 200 lines)
- Create: `src/editor/use-editor-state.ts` (annotation state, selection, tool, colour, interaction mode, general feedback, status)
- Create: `src/editor/annotation-canvas.tsx` (the `<img>` + `<svg>` block, pointer handlers, draft/drag/resize rendering)
- Create: `src/editor/sidebar.tsx` (capture button, tool/interaction selects, colour, general feedback, action buttons, status)
- Create: `src/editor/comment-timeline.tsx`
- Create: `src/editor/saved-shares.tsx`
- Create: `src/editor/use-exports.ts` (`download`, `prepareExternalLlmPackage`, `copyForClaudeCode`, `createShareUrl`, `resolveDownloadPath`)
- Create: `src/editor/annotation-geometry.ts` (`moveAnnotation`, `annotationCommentAnchor`, `uid`, `formatBytes`, `shareLabel`)
- Test: `tests/annotation-geometry.test.ts`

**Interfaces:**
- Produces: `useEditorState(): EditorState` where

```ts
export interface EditorState {
  annotations: Annotation[];
  setAnnotations: React.Dispatch<React.SetStateAction<Annotation[]>>;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  tool: AnnotationTool;
  setTool: (tool: AnnotationTool) => void;
  interactionMode: "draw" | "move";
  setInteractionMode: (mode: "draw" | "move") => void;
  color: string;
  setColor: (color: string) => void;
  generalFeedback: string;
  setGeneralFeedback: (value: string) => void;
  status: { kind: "success" | "error"; message: string } | null;
  setStatus: (status: EditorState["status"]) => void;
  isBusy: boolean;
  setIsBusy: (busy: boolean) => void;
  baseDataUrl: string;
  setBaseDataUrl: (url: string) => void;
  pageUrl: string;
  setPageUrl: (url: string) => void;
  imageSize: { width: number; height: number };
  setImageSize: (size: { width: number; height: number }) => void;
}
```

- Produces: `AnnotationCanvas` props `{ state: EditorState; onCommit: () => void }` (`onCommit` is a no-op until Task 7 wires history).
- Produces: `moveAnnotation(a: Annotation, dx: number, dy: number): Annotation` and `annotationCommentAnchor(a: Annotation): { x: number; y: number }` exported from `annotation-geometry.ts`.

- [ ] **Step 1: Write the failing unit test for the moved pure helpers**

```ts
// tests/annotation-geometry.test.ts
import { describe, expect, it } from "vitest";
import { annotationCommentAnchor, moveAnnotation } from "../src/editor/annotation-geometry";

const ts = "2026-08-23T00:00:00.000Z";

describe("moveAnnotation", () => {
  it("moves a box by the delta", () => {
    const box = { id: "b", tool: "box" as const, color: "#f00", createdAt: ts, x: 10, y: 20, width: 5, height: 5 };
    expect(moveAnnotation(box, 3, -4)).toMatchObject({ x: 13, y: 16 });
  });
  it("moves both arrow endpoints", () => {
    const arrow = { id: "a", tool: "arrow" as const, color: "#f00", createdAt: ts, x1: 0, y1: 0, x2: 10, y2: 10 };
    expect(moveAnnotation(arrow, 1, 2)).toMatchObject({ x1: 1, y1: 2, x2: 11, y2: 12 });
  });
});

describe("annotationCommentAnchor", () => {
  it("uses the top-left of an arrow's bounding box", () => {
    const arrow = { id: "a", tool: "arrow" as const, color: "#f00", createdAt: ts, x1: 30, y1: 5, x2: 10, y2: 25 };
    expect(annotationCommentAnchor(arrow)).toEqual({ x: 10, y: 5 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/annotation-geometry.test.ts`
Expected: FAIL - cannot resolve `../src/editor/annotation-geometry`.

- [ ] **Step 3: Move the helpers**

Cut `uid`, `moveAnnotation`, `annotationCommentAnchor`, `formatBytes`, `shareLabel` from `src/editor/main.tsx:69-119` into `src/editor/annotation-geometry.ts`, each prefixed with `export`. Import them back into `main.tsx`.

- [ ] **Step 4: Run the test and the full gate**

Run: `npx vitest run tests/annotation-geometry.test.ts && npm run check`
Expected: PASS, gate green.

- [ ] **Step 5: Commit**

```bash
git add src/editor/annotation-geometry.ts src/editor/main.tsx tests/annotation-geometry.test.ts
git commit -m "refactor(editor): extract pure annotation geometry helpers"
```

- [ ] **Step 6: Extract `useEditorState`**

Move the `useState` calls at `src/editor/main.tsx:134-155` into `src/editor/use-editor-state.ts` returning the `EditorState` object above. `main.tsx` calls `const state = useEditorState()` and destructures. No logic changes.

- [ ] **Step 7: Extract `AnnotationCanvas`**

Move the JSX from the `<Card className="overflow-hidden">` at the bottom of `main.tsx` plus `pointerPos`, `onCanvasPointerDown`, `onAnnotationPointerDown`, `onResizeHandlePointerDown`, `onCanvasPointerMove`, `onCanvasPointerUp` and the `draft`/`drag`/`resize` state into `src/editor/annotation-canvas.tsx`. Props: `{ state: EditorState; inlineCommentRef; shouldFocusSelectedComment; setShouldFocusSelectedComment; onCommit: () => void }`. Call `onCommit()` at the end of `onCanvasPointerUp` whenever an annotation was added, moved, or resized (it is a no-op until Task 7).

- [ ] **Step 8: Extract `useExports`, `Sidebar`, `CommentTimeline`, `SavedShares`**

- `use-exports.ts`: `resolveDownloadPath` (`main.tsx:38-48`), `download`, `prepareExternalLlmPackage`, `copyForClaudeCode`, `createShareUrl`, `refreshSavedShares`, `removeSavedShare`. Signature: `useExports(state: EditorState): { download; prepareExternalLlmPackage; copyForClaudeCode; createShareUrl; shareUrl; savedShares; refreshSavedShares; removeSavedShare }`.
- `sidebar.tsx`: the left `<Card>` minus the timeline and saved-shares sections.
- `comment-timeline.tsx`: the "Comment Timeline" section. Props: `{ items: Annotation[]; selectedId; onSelect(id); onRemove(id) }`.
- `saved-shares.tsx`: the "Saved Shares" section. Props: `{ shares: LocalShareMeta[]; onOpen(id); onDelete(id) }`.

- [ ] **Step 9: Verify nothing changed**

Run: `npm run check && npm run test:e2e`
Expected: green; `wc -l src/editor/main.tsx` < 200.

- [ ] **Step 10: Commit and PR**

```bash
git add src/editor tests
git commit -m "refactor(editor): split main.tsx into canvas, sidebar, timeline, exports"
```

Open a PR titled `refactor(editor): split main.tsx into focused modules`. Change folder `.docs/done/2026-08-24-editor-module-split/` with proposal (why: 1,171-line file blocks every later change), tasks (this task), completion summary.

---

### Task 2: Hide the page scrollbar while capturing

**Files:**
- Modify: `src/content.ts` (`SB_GET_PAGE_METRICS` handler, `SB_RESTORE_SCROLL` handler)
- Test: `tests/e2e/extension.spec.ts` (extend the two capture tests)

**Interfaces:**
- Consumes: `scroller` module state and `findScroller()` from `src/content.ts` (PR #18).

- [ ] **Step 1: Extend the e2e capture tests to sample the right edge**

In `tests/e2e/extension.spec.ts`, inside the `img.evaluate` block of `full-page capture stitches every viewport in order`, add a right-edge sample: for each block `i`, also compare `hueAt(top + i * 300 + 150)` at `x = image.naturalWidth - 4` (add an `x` parameter to `hueAt`). Push `"right:" + y` into `mismatched` on failure.

```ts
const hueAt = (x: number, y: number) => { const [r, g, b] = c.getImageData(x, y, 1, 1).data; /* unchanged body */ };
// existing samples use hueAt(20, y); add:
if (Math.abs(hueAt(image.naturalWidth - 4, top + i * 300 + 150) - ((i * 37) % 360)) > 3) mismatched.push(-(top + i * 300 + 150));
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:e2e -- -g "stitches"`
Expected: FAIL with negative entries in `mismatched` (the right edge is the scrollbar track, RGB 252/252/252, hue 0).

- [ ] **Step 3: Hide the scrollbar for the duration of the capture**

In `src/content.ts` add:

```ts
const SCROLLBAR_STYLE_ID = "shotback-hide-scrollbar";

/** Hide scrollbars while capturing so the track is not baked into frames. */
function hideScrollbars(): void {
  if (document.getElementById(SCROLLBAR_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = SCROLLBAR_STYLE_ID;
  style.textContent =
    "html,body,[data-shotback-scroller]{scrollbar-width:none!important}" +
    "html::-webkit-scrollbar,body::-webkit-scrollbar,[data-shotback-scroller]::-webkit-scrollbar{display:none!important}";
  document.documentElement.appendChild(style);
}

function showScrollbars(): void {
  document.getElementById(SCROLLBAR_STYLE_ID)?.remove();
  document.querySelector("[data-shotback-scroller]")?.removeAttribute("data-shotback-scroller");
}
```

In the `SB_GET_PAGE_METRICS` handler, after `scroller = findScroller();` add `scroller?.setAttribute("data-shotback-scroller", ""); hideScrollbars();` **before** reading metrics (hiding the bar reflows the page, so measure after). In `SB_RESTORE_SCROLL` and `SB_CAPTURE_END` call `showScrollbars()`.

- [ ] **Step 4: Run e2e and the gate**

Run: `npm run test:e2e && npm run check`
Expected: green.

- [ ] **Step 5: Commit and PR**

```bash
git add src/content.ts tests/e2e/extension.spec.ts
git commit -m "fix(capture): hide scrollbars while capturing so the track is not stitched in"
```

---

### Task 3: Finish the dark theme

**Files:**
- Modify: `src/styles/globals.css:56-90` (dark tokens)
- Modify: `src/editor/sidebar.tsx`, `src/editor/comment-timeline.tsx`, `src/editor/saved-shares.tsx`, `src/editor/annotation-canvas.tsx`, `src/viewer/main.tsx` (26 + 6 literal colour classes)
- Test: `tests/e2e/extension.spec.ts` (new test)

- [ ] **Step 1: Write the failing e2e test**

```ts
test("dark theme keeps every control legible", async () => {
  const editor = await ctx.newPage();
  await editor.emulateMedia({ colorScheme: "dark" });
  await editor.goto(`chrome-extension://${extId}/editor.html`, { waitUntil: "load" });
  const unreadable = await editor.evaluate(() => {
    const lum = (rgb: string) => {
      const [r, g, b] = rgb.match(/\d+/g)!.map(Number).map((v) => v / 255);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const bad: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("button, p, span, h1, h2, label")) {
      if (!el.textContent?.trim()) continue;
      const s = getComputedStyle(el);
      // walk up to the first painted background
      let bg = s.backgroundColor, node: HTMLElement | null = el;
      while (node && (bg === "rgba(0, 0, 0, 0)" || bg === "transparent")) { node = node.parentElement; if (node) bg = getComputedStyle(node).backgroundColor; }
      if (Math.abs(lum(s.color) - lum(bg)) < 0.3) bad.push(`${el.tagName}:${el.textContent.trim().slice(0, 24)}`);
    }
    return bad;
  });
  expect(unreadable).toEqual([]);
  expect(await editor.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe("rgb(248, 250, 252)");
  await editor.close();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:e2e -- -g "dark theme"`
Expected: FAIL - the body background is still the light value (no media query), and/or several buttons are in `unreadable`.

- [ ] **Step 3: Apply dark tokens by media query as well as by class**

Replace the `.dark { ... }` block in `src/styles/globals.css` with the same declarations under two selectors:

```css
/*
 * Dark theme tokens. Applied by OS preference, or explicitly with
 * class="dark" / class="light" on <html>. Kept outside @layer base so
 * Tailwind does not tree-shake the selectors.
 */
.dark,
:root:not(.light):has(body) {
  /* placeholder replaced in the next step */
}
```

Concretely, write the block twice: once as `.dark { ...tokens... }` (unchanged) and once as

```css
@media (prefers-color-scheme: dark) {
  :root:not(.light) { ...the same tokens... }
}
```

Also inside `body` in `@layer base`, the decorative radial gradients are light-only; make them token-driven: add `--glow-1: 110 231 183` and `--glow-2: 191 219 254` to `:root`, and `--glow-1: 16 185 129` / `--glow-2: 59 130 246` with lower alpha in the dark blocks; change the gradients to `rgba(var(--glow-1) / 0.32)` and `rgba(var(--glow-2) / 0.5)` (use `/ 0.12` and `/ 0.18` in dark).

- [ ] **Step 4: Replace the literal colour classes**

Mapping (apply with search/replace across `src/editor/*.tsx` and `src/viewer/main.tsx`):

| Literal | Token |
|---|---|
| `text-slate-500` | `text-muted-foreground` |
| `text-slate-600`, `text-slate-700` | `text-muted-foreground` |
| `text-slate-800`, `text-slate-900` | `text-foreground` |
| `border-slate-200`, `border-slate-300` | `border-border` |
| `bg-slate-50`, `bg-slate-100` | `bg-muted` |
| `bg-white` | `bg-card` |
| `text-emerald-700`, `border-emerald-400`, `bg-emerald-50`, `ring-emerald-200`, `border-emerald-600`, `ring-emerald-600/50` | `text-primary`, `border-primary`, `bg-accent`, `ring-ring/40`, `border-primary`, `ring-ring/50` |
| `text-red-700`, `hover:bg-red-50` | `text-destructive`, `hover:bg-destructive/10` |

Status line (`sidebar.tsx`): success uses `text-primary`, error uses `text-destructive`. The inline comment `foreignObject` panel: `bg-card/95 border-primary`, textarea `bg-card text-foreground border-input`.

Run `grep -rn "slate-\|emerald-\|bg-white\|red-" src/` and expect zero hits.

- [ ] **Step 5: Run e2e, gate, and visually verify**

Run: `npm run test:e2e && npm run check`
Expected: green. Then use the `visual-verify` skill: screenshot editor and viewer with `colorScheme: "dark"` and `"light"` and confirm every button label is readable and the status line, timeline, and viewer metadata are visible.

- [ ] **Step 6: Commit and PR**

```bash
git add src/styles/globals.css src/editor src/viewer tests/e2e/extension.spec.ts
git commit -m "fix(ui): finish the dark theme - tokens everywhere, applied by prefers-color-scheme"
```

---

### Task 4: Stop the sidebar scrolling sideways

**Files:**
- Modify: `src/editor/sidebar.tsx` (share URL anchor)
- Test: `tests/e2e/extension.spec.ts` (add assertion to the `inner` capture test)

- [ ] **Step 1: Add the failing assertion**

In the `full-page capture stitches every viewport in order (inner)` test, after the image check, click `Copy Local Share Link`, wait for `a[href*='viewer.html']`, then:

```ts
const overflow = await editor.evaluate(() => {
  const card = document.querySelector("main > div")!; // first Card = sidebar
  return card.scrollWidth - card.clientWidth;
});
expect(overflow).toBe(0);
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:e2e -- -g "inner"`
Expected: FAIL - overflow > 0.

- [ ] **Step 3: Fix**

In `sidebar.tsx`, the share link anchor: add `break-all` and wrap the card content in `min-w-0`:

```tsx
<a href={shareUrl} target="_blank" rel="noreferrer"
   className="block break-all text-sm font-medium text-primary underline underline-offset-2">
  {shareUrl}
</a>
```

- [ ] **Step 4: Run e2e and gate**

Run: `npm run test:e2e && npm run check`
Expected: green.

- [ ] **Step 5: Commit and PR**

```bash
git add src/editor/sidebar.tsx tests/e2e/extension.spec.ts
git commit -m "fix(editor): wrap the share URL so the sidebar never scrolls sideways"
```

---

### Task 5: One numbering everywhere; numbered pins on canvas and export, legend footer

**Files:**
- Create: `src/lib/numbering.ts`
- Modify: `src/lib/feedback.ts` (`formatAreaComments` uses `numberAnnotations`)
- Modify: `src/lib/annotate.ts` (replace `drawCommentLabel` with `drawPin`; add legend to the footer)
- Modify: `src/editor/annotation-canvas.tsx` (render pins instead of comment pills)
- Modify: `src/editor/comment-timeline.tsx` (use the same numbering)
- Test: `tests/numbering.test.ts`, `tests/feedback.test.ts`, `tests/annotate.test.ts`

**Interfaces:**
- Produces:

```ts
// src/lib/numbering.ts
export interface NumberedAnnotation { n: number; annotation: Annotation }
/** Timeline order = creation order. The same list drives the timeline, the prompt, the canvas pins and the export. */
export function numberAnnotations(annotations: Annotation[]): NumberedAnnotation[];
/** Pin radius in image px: readable on a phone-width capture, not absurd on a 4K one. */
export function pinRadius(imageWidth: number): number; // clamp(imageWidth / 60, 14, 28)
/** Where the pin sits: top-left corner of a box, the arrow tail, the text baseline start. */
export function pinAnchor(annotation: Annotation): { x: number; y: number };
```

- [ ] **Step 1: Write the failing unit tests**

```ts
// tests/numbering.test.ts
import { describe, expect, it } from "vitest";
import { numberAnnotations, pinAnchor, pinRadius } from "../src/lib/numbering";

const mk = (id: string, createdAt: string) => ({ id, tool: "box" as const, color: "#f00", createdAt, x: 5, y: 7, width: 10, height: 10 });

describe("numberAnnotations", () => {
  it("numbers by creation time regardless of array order", () => {
    const list = [mk("late", "2026-08-23T00:00:02Z"), mk("early", "2026-08-23T00:00:01Z")];
    expect(numberAnnotations(list).map((x) => [x.n, x.annotation.id])).toEqual([[1, "early"], [2, "late"]]);
  });
});

describe("pinRadius", () => {
  it("clamps between 14 and 28", () => {
    expect(pinRadius(300)).toBe(14);
    expect(pinRadius(1200)).toBe(20);
    expect(pinRadius(4000)).toBe(28);
  });
});

describe("pinAnchor", () => {
  it("uses the arrow tail, not the bounding box", () => {
    const arrow = { id: "a", tool: "arrow" as const, color: "#f00", createdAt: "2026-08-23T00:00:00Z", x1: 30, y1: 40, x2: 0, y2: 0 };
    expect(pinAnchor(arrow)).toEqual({ x: 30, y: 40 });
  });
});
```

Also in `tests/feedback.test.ts` add:

```ts
it("numbers area comments by creation time", () => {
  const first = { ...box("first"), id: "b1", createdAt: "2026-02-21T00:00:01.000Z" };
  const second = { ...box("second"), id: "b2", createdAt: "2026-02-21T00:00:02.000Z" };
  const prompt = buildExternalLlmPrompt({ pageUrl: "u", generalFeedback: "", annotations: [second, first] });
  expect(prompt).toContain("1. [box] first");
  expect(prompt).toContain("2. [box] second");
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/numbering.test.ts tests/feedback.test.ts`
Expected: FAIL - module missing; prompt orders by array position.

- [ ] **Step 3: Implement `numbering.ts` and use it in `feedback.ts`**

```ts
// src/lib/numbering.ts
import type { Annotation } from "@/types/annotation";

export interface NumberedAnnotation { n: number; annotation: Annotation }

export function numberAnnotations(annotations: Annotation[]): NumberedAnnotation[] {
  return [...annotations]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((annotation, index) => ({ n: index + 1, annotation }));
}

export function pinRadius(imageWidth: number): number {
  return Math.min(28, Math.max(14, Math.round(imageWidth / 60)));
}

export function pinAnchor(annotation: Annotation): { x: number; y: number } {
  if (annotation.tool === "arrow") return { x: annotation.x1, y: annotation.y1 };
  return { x: annotation.x, y: annotation.y };
}
```

In `src/lib/feedback.ts`, `formatAreaComments` becomes:

```ts
function formatAreaComments(annotations: Annotation[]): string {
  const comments = numberAnnotations(annotations)
    .map(({ n, annotation }) =>
      annotation.tool === "text"
        ? `${n}. [text] ${annotation.text || "(empty)"}`
        : `${n}. [${annotation.tool}] ${annotation.comment?.trim() || "(no comment)"}`
    )
    .join("\n");
  return comments || "(none)";
}
```

- [ ] **Step 4: Run unit tests**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Export draws pins and a legend instead of text pills**

In `src/lib/annotate.ts`:

```ts
function drawPin(ctx: CanvasRenderingContext2D, n: number, x: number, y: number, r: number, color: string): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = Math.max(2, r / 7);
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${Math.round(r * 1.15)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(n), x, y + r * 0.05);
  ctx.restore();
}
```

Replace the annotation loop: iterate `numberAnnotations(annotations)`; draw the shape as before (line width `Math.max(3, Math.round(pinRadius(img.width) / 5))`), then `drawPin(ctx, n, anchor.x, anchor.y, r, a.color)` where `anchor = pinAnchor(a)` and `r = pinRadius(img.width)`. Delete `drawCommentLabel`.

Footer: rename the "General Feedback" footer to a "Notes" footer that lists `n. comment` for every numbered annotation with a non-empty comment/text first, then a "General feedback" paragraph if present. `selectFeedbackRenderMode` stays; compute `footerHeight` from the combined line count. Font size for footer text: `Math.round(pinRadius(img.width) * 0.9)` px so it scales with the image.

- [ ] **Step 6: Canvas draws the same pins**

In `annotation-canvas.tsx`, remove the two comment-pill `<g pointerEvents="none">` blocks. After each shape, render:

```tsx
<g pointerEvents="none">
  <circle cx={anchor.x} cy={anchor.y} r={r} fill={item.color} stroke="#fff" strokeWidth={Math.max(2, r / 7)} />
  <text x={anchor.x} y={anchor.y} fill="#fff" fontSize={r * 1.15} fontWeight="700" textAnchor="middle" dominantBaseline="central">{n}</text>
</g>
```

with `r = pinRadius(imageSize.width)` and `{ n }` from `numberAnnotations(state.annotations)` looked up by id. `comment-timeline.tsx` renders `#{n}` from the same list (replace its `index + 1`).

- [ ] **Step 7: Unit-test the export via a canvas stub**

`tests/annotate.test.ts` runs in Node, so exercise the drawing through a recording 2D context stub: create `document.createElement = () => ({ getContext: () => ctxStub, toDataURL: () => "data:x" })` and `Image` whose `onload` fires with `width: 1200, height: 800`; call `exportAnnotatedImage("data:", [box("hi"), arrow("there")])` and assert the stub recorded two `arc` calls with radius 20 and `fillText("1", ...)`, `fillText("2", ...)`. Keep this test in a `describe("exportAnnotatedImage pins")` block with `vi.stubGlobal`.

- [ ] **Step 8: Run everything and visually verify**

Run: `npm run check && npm run test:e2e`. Then `visual-verify`: capture, add three annotations, open the viewer, confirm pins are legible at fit-to-width and the legend matches the timeline numbers.

- [ ] **Step 9: Commit and PR**

```bash
git add src/lib/numbering.ts src/lib/feedback.ts src/lib/annotate.ts src/editor tests
git commit -m "feat(annotate): numbered pins on canvas and export, one numbering shared with prompt and timeline"
```

---

### Task 6: Comment editor placement and first-keystroke focus

**Files:**
- Modify: `src/editor/annotation-canvas.tsx` (`inlineEditorPosition`, focus effect)
- Create: `src/lib/editor-placement.ts`
- Test: `tests/editor-placement.test.ts`, `tests/e2e/extension.spec.ts`

**Interfaces:**
- Produces: `placeInlineEditor(bounds: {x,y,width,height}, image: {width,height}, editor: {width,height}): {x,y}` - below the shape, left-aligned with it; flips above when it would overflow the bottom; clamps horizontally.

- [ ] **Step 1: Failing unit test**

```ts
// tests/editor-placement.test.ts
import { describe, expect, it } from "vitest";
import { placeInlineEditor } from "../src/lib/editor-placement";

const image = { width: 1000, height: 800 };
const editor = { width: 240, height: 84 };

describe("placeInlineEditor", () => {
  it("sits just below the shape, left-aligned", () => {
    expect(placeInlineEditor({ x: 100, y: 100, width: 200, height: 50 }, image, editor)).toEqual({ x: 100, y: 158 });
  });
  it("flips above the shape near the bottom edge", () => {
    expect(placeInlineEditor({ x: 100, y: 740, width: 200, height: 50 }, image, editor)).toEqual({ x: 100, y: 648 });
  });
  it("clamps to the right edge", () => {
    expect(placeInlineEditor({ x: 900, y: 100, width: 80, height: 50 }, image, editor).x).toBe(750);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/editor-placement.test.ts` - Expected: FAIL, module missing.

- [ ] **Step 3: Implement**

```ts
// src/lib/editor-placement.ts
const GAP = 8;
export function placeInlineEditor(
  bounds: { x: number; y: number; width: number; height: number },
  image: { width: number; height: number },
  editor: { width: number; height: number }
): { x: number; y: number } {
  const x = Math.max(10, Math.min(bounds.x, image.width - editor.width - 10));
  const below = bounds.y + bounds.height + GAP;
  const y = below + editor.height <= image.height - 10 ? below : Math.max(10, bounds.y - GAP - editor.height);
  return { x, y };
}
```

Add `annotationBounds(a: Annotation)` to `src/editor/annotation-geometry.ts` (box: itself; arrow: min/max of endpoints; text: `{x, y-18, width: text.length*10, height: 22}`), and use `placeInlineEditor(annotationBounds(selected), imageSize, {width: 240, height: 84})` for `inlineEditorPosition`.

- [ ] **Step 4: Focus race - failing e2e**

In the `smooth` capture test, after the image loads, draw a box (`mouse.down/move/up` over the canvas) and immediately `keyboard.type("Chart")` with no wait; then assert the timeline row text is exactly `Chart`.

Run: `npm run test:e2e -- -g "smooth"` - Expected: FAIL with `hart` (or empty).

- [ ] **Step 5: Focus synchronously after commit**

In `annotation-canvas.tsx`, change the focus `useEffect` to `useLayoutEffect` and, in `onCanvasPointerUp`, wrap the state updates that create an annotation in `flushSync(() => {...})` (import from `react-dom`) so the textarea exists and is focused before the event returns.

- [ ] **Step 6: Run e2e and gate**

Run: `npm run test:e2e && npm run check` - Expected: green.

- [ ] **Step 7: Commit and PR**

```bash
git add src/lib/editor-placement.ts src/editor tests
git commit -m "fix(editor): place the comment editor beside the shape and focus it before the first keystroke"
```

---

### Task 7: Real undo/redo

**Files:**
- Create: `src/lib/history.ts`
- Modify: `src/editor/use-editor-state.ts` (wrap annotations in history), `src/editor/annotation-canvas.tsx` (`onCommit`), `src/editor/sidebar.tsx` (Undo/Redo buttons replace "Undo Last Change"), `src/editor/main.tsx` (Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y)
- Test: `tests/history.test.ts`

**Interfaces:**
- Produces:

```ts
export interface History<T> { past: T[]; present: T; future: T[] }
export function createHistory<T>(present: T): History<T>;
export function commit<T>(h: History<T>, next: T, limit?: number): History<T>; // no-op if Object.is(next, h.present); default limit 100
export function undo<T>(h: History<T>): History<T>;
export function redo<T>(h: History<T>): History<T>;
```

- Consumes: `onCommit` from Task 1 (called at pointer-up after create/move/resize) - comment edits commit on textarea blur, deletes commit immediately.

- [ ] **Step 1: Failing unit test**

```ts
// tests/history.test.ts
import { describe, expect, it } from "vitest";
import { commit, createHistory, redo, undo } from "../src/lib/history";

describe("history", () => {
  it("undo restores the previous state and redo re-applies it", () => {
    let h = createHistory([1]);
    h = commit(h, [1, 2]);
    h = undo(h);
    expect(h.present).toEqual([1]);
    h = redo(h);
    expect(h.present).toEqual([1, 2]);
  });
  it("a new commit clears the redo stack", () => {
    let h = commit(createHistory(0), 1);
    h = undo(h);
    h = commit(h, 5);
    expect(redo(h).present).toBe(5);
  });
  it("undo at the start and redo at the end are no-ops", () => {
    const h = createHistory("a");
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });
  it("drops the oldest entry past the limit", () => {
    let h = createHistory(0);
    for (let i = 1; i <= 101; i += 1) h = commit(h, i, 100);
    expect(h.past.length).toBe(100);
    expect(h.past[0]).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails** - `npx vitest run tests/history.test.ts` - Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/history.ts
export interface History<T> { past: T[]; present: T; future: T[] }
export function createHistory<T>(present: T): History<T> { return { past: [], present, future: [] }; }
export function commit<T>(h: History<T>, next: T, limit = 100): History<T> {
  if (Object.is(next, h.present)) return h;
  const past = [...h.past, h.present];
  return { past: past.length > limit ? past.slice(past.length - limit) : past, present: next, future: [] };
}
export function undo<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
}
export function redo<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
}
```

- [ ] **Step 4: Wire it**

In `use-editor-state.ts`: keep `annotations`/`setAnnotations` as the live (in-gesture) state; add `const [history, setHistory] = useState(() => createHistory<Annotation[]>([]))`; expose `commitAnnotations()` (= `setHistory(h => commit(h, annotationsRef.current))`), `undoAnnotations()` and `redoAnnotations()` which set both history and `annotations`, plus `canUndo`/`canRedo`. Canvas calls `commitAnnotations` from `onCommit`. `removeById`/`removeSelected` and the textarea `onBlur` call it too. New capture resets history. Sidebar: replace "Undo Last Change" with two secondary buttons `Undo` / `Redo` (`disabled={!canUndo}` / `!canRedo`). Keydown in `main.tsx`: `(ctrl|meta)+z` -> undo, `(ctrl|meta)+shift+z` or `(ctrl|meta)+y` -> redo, ignored while typing in a field.

- [ ] **Step 5: e2e**

Add to the `inner` capture test: draw a box, drag it 50 px, press `Control+z`, assert the box `rect` `x` attribute equals its original; press `Control+Shift+z`, assert it moved again.

- [ ] **Step 6: Run gate + e2e, commit, PR**

```bash
git commit -am "feat(editor): undo/redo history for annotations with keyboard shortcuts"
```

---

### Task 8: Fit-to-width and 1:1 zoom

**Files:**
- Modify: `src/editor/annotation-canvas.tsx` (image sizing), `src/editor/sidebar.tsx` (zoom toggle), `src/editor/use-editor-state.ts` (`zoom: "fit" | "actual"`)
- Test: `tests/e2e/extension.spec.ts`

- [ ] **Step 1: Failing e2e** - in the `inner` test assert `await editor.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)` is true. Expected: FAIL today (`max-w-none`).

- [ ] **Step 2: Implement** - the `<img>` gets `className={zoom === "fit" ? "block h-auto w-full max-w-full" : "block h-auto max-w-none"}`; the wrapper `div` gets `w-full overflow-auto`. The SVG already uses `viewBox` and `getScreenCTM`, so pointer maths keep working at any scale. Add a `Select` "Zoom" with options `Fit width` / `Actual size (100%)`, default `fit`.

- [ ] **Step 3: Run e2e + gate, visually verify at 1280 and 1920 px wide, commit, PR**

```bash
git commit -am "feat(editor): fit-to-width by default with a 1:1 zoom toggle"
```

---

### Task 9: Keyboard shortcut to capture

**Files:**
- Modify: `public/manifest.json`, `README.md`, `SECURITY.md` (note: `commands` adds no permission)
- Test: `tests/e2e/extension.spec.ts` (`extension loads` test)

- [ ] **Step 1: Failing e2e** - extend `extension loads with no popup...` with `expect(manifest.commands?._execute_action?.suggested_key?.default).toBe("Alt+Shift+S")`.

- [ ] **Step 2: Add to the manifest**

```json
"commands": {
  "_execute_action": {
    "suggested_key": { "default": "Alt+Shift+S", "mac": "Alt+Shift+S" },
    "description": "Capture the current page with Shotback"
  }
}
```

`_execute_action` triggers `chrome.action.onClicked` when there is no popup, so no background code changes. README: add the shortcut to Usage and note it is rebindable at `chrome://extensions/shortcuts`.

- [ ] **Step 3: Run e2e + gate, commit, PR** - `git commit -am "feat: Alt+Shift+S captures the current page"`

---

### Task 10: Copy annotated PNG to the clipboard

**Files:**
- Modify: `src/editor/use-exports.ts` (`copyImage`), `src/editor/sidebar.tsx` (button)
- Test: `tests/e2e/extension.spec.ts`

- [ ] **Step 1: Failing e2e** - in the `smooth` test: `await ctx.grantPermissions(["clipboard-read", "clipboard-write"])` in `beforeAll` (Chromium supports these for the persistent context), click `Copy Image`, then `const type = await editor.evaluate(async () => (await navigator.clipboard.read())[0].types[0]); expect(type).toBe("image/png")`. Expected: FAIL - no such button.

- [ ] **Step 2: Implement**

```ts
const copyImage = async (): Promise<void> => {
  if (!state.baseDataUrl) { state.setStatus({ kind: "error", message: "Capture a screenshot before copying." }); return; }
  try {
    const merged = await exportAnnotatedImage(state.baseDataUrl, state.annotations, { generalFeedback: state.generalFeedback });
    const blob = await (await fetch(merged)).blob();
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    state.setStatus({ kind: "success", message: "Annotated image copied. Paste it into your agent chat." });
  } catch (error) {
    state.setStatus({ kind: "error", message: error instanceof Error ? error.message : "Failed to copy image" });
  }
};
```

Sidebar button `Copy Image` (secondary) next to `Download Image (PNG)`. Extension pages in a focused tab may write to the clipboard on a user gesture without the `clipboardWrite` permission; if the e2e proves otherwise, add `"clipboardWrite"` to `permissions` and a paragraph to `SECURITY.md` in the same PR.

- [ ] **Step 3: Run e2e + gate, commit, PR** - `git commit -am "feat(editor): copy the annotated PNG to the clipboard"`

---

### Task 11: Colour swatches and tool hotkeys - DESIGN GATE

**Files:**
- Create: `src/components/ui/swatch-picker.tsx`
- Modify: `src/editor/sidebar.tsx`, `src/editor/main.tsx` (hotkeys)
- Test: `tests/e2e/extension.spec.ts`

- [ ] **Step 1: Render 2-3 options with the `prototype` skill** - (a) six swatches in a row + "custom" opening the native picker; (b) swatches inside the Tool row as a compact strip; (c) tool + colour merged into one segmented toolbar above the canvas. Wait for the owner's pick before Step 2.
- [ ] **Step 2: Failing e2e** - press `a` on the editor, assert the Tool select shows `Arrow`; press `v`, assert Interaction shows `Move Existing`; click the second swatch, draw a box, assert the `rect` stroke equals that swatch's hex.
- [ ] **Step 3: Implement the picked option.** Swatch palette: `#ef4444 #f59e0b #22c55e #3b82f6 #a855f7 #111827`. Hotkeys in the `keydown` handler (ignored while typing): `b` box, `a` arrow, `t` text, `v` move, `d` draw.
- [ ] **Step 4: Run e2e + gate, `visual-verify` light and dark, commit, PR** - `git commit -am "feat(editor): colour swatches and tool hotkeys"`

---

### Task 12: Output action hierarchy - DESIGN GATE

**Files:**
- Modify: `src/editor/sidebar.tsx`, `src/editor/use-editor-state.ts` (`target` preference), `src/lib/prefs.ts` (new: `chrome.storage.local` `prefs` record, `getPrefs()/setPrefs()`)
- Test: `tests/e2e/extension.spec.ts`

- [ ] **Step 1: Render 2-3 options** - (a) one primary `Send to Claude Code` with a `Target` select (Claude Code / Cloud LLM / Local link) and a secondary row (Download, Copy Image); (b) a split button; (c) an "Outputs" card with three equal tiles. Wait for the pick.
- [ ] **Step 2: Failing e2e** - assert exactly one `button` in the sidebar has the `bg-primary` class after capture, and that its label starts with `Send to`.
- [ ] **Step 3: Implement the pick**, persist the chosen target in `prefs`, rename `Prepare for Cloud LLM` to `Send to cloud LLM`, update README and CLAUDE.md "Three outputs" section.
- [ ] **Step 4: Run e2e + gate, `visual-verify`, commit, PR** - `git commit -am "feat(editor): one primary send action with a target picker"`

**Phase 1 exit criteria:** every P0 in the review closed; e2e suite covers dark theme, overflow, pins, focus, undo, zoom, shortcut, clipboard; `visual-verify` in light and dark attached to the last PR.

---

# Phase 2 - handoff v2 (detailed steps written at phase start)

Each task below is one change folder and PR. Interfaces are fixed now so the Phase 1 refactor leaves room for them.

### Task 13: Environment block

**Files:** `src/lib/capture.ts` (`PageMetrics` + `CaptureResult.environment`), `src/content.ts` (`SB_GET_PAGE_METRICS` adds `title`, `colorScheme`), `src/lib/feedback.ts`, `src/lib/localStore.ts` (optional `environment` on `LocalShare`, no schema bump), `src/viewer/main.tsx`, tests for `feedback` and `localStore`.

**Interfaces:**

```ts
export interface CaptureEnvironment {
  pageTitle: string; pageUrl: string; capturedAt: string; // ISO
  viewport: { width: number; height: number }; devicePixelRatio: number;
  userAgent: string; colorScheme: "light" | "dark";
  scroller: "document" | "element";
}
```

Prompt gains an `Environment:` block after `Page URL`. Acceptance: `buildClaudeCodePrompt` unit test asserts the block; e2e asserts `environment.viewport.height` equals `window.innerHeight` of the captured tab.

### Task 14: Per-annotation geometry in the prompt

**Files:** `src/lib/feedback.ts`, `src/lib/numbering.ts` (`describeGeometry(a, image)`), tests.

Format: box `at (x, y) size w x h px [12%, 8% of page]`; arrow `from (x1, y1) to (x2, y2)`; text `at (x, y)`. Requires the image size, so prompt builders take `image: { width; height }`. Acceptance: unit tests for the three tools; snapshot of a full prompt.

### Task 15: Per-annotation DOM context

**Files:** `src/types/annotation.ts` (optional `context?: ElementContext`), `src/lib/dom-context.ts` (pure: `cssPath`, `reactComponentName`, `summarizeElement` over a minimal `ElementLike` interface so it is unit-testable in Node), `src/content.ts` (`SB_INSPECT_POINTS`), `src/lib/capture.ts` (`inspectPoints(tabId, points)`), `src/editor/annotation-canvas.tsx` (inspect on commit), `src/lib/feedback.ts` (Standard/Detailed verbosity prints context), tests.

**Interfaces:**

```ts
export interface ElementContext {
  cssPath: string;              // "#pricing > div.card:nth-of-type(2) > button.btn-primary"
  tag: string; id?: string; classes: string[]; role?: string; testId?: string;
  text?: string;                // first 80 chars of visible text
  component?: string[];         // React owner chain, nearest first, max 3: ["Button", "PricingCard"]
  rect: { x: number; y: number; width: number; height: number }; // page CSS px
}
```

Mapping: image px -> page CSS px is `/ captureScale` (`CaptureResult.scale`, = `first.width / metrics.viewportWidth`); page y -> scroller scrollTop = `y - scrollerTop`. The content script scrolls the scroller to the point, calls `document.elementsFromPoint`, skips `[data-shotback-overlay]`, describes the first element, restores scroll. React name: find the `__reactFiber$*` key, walk `.return` collecting `type.displayName || type.name` for function/class types. Inspection runs on create/move/resize commit, best-effort (tab gone -> `context` undefined). Acceptance: unit tests for `cssPath` and `reactComponentName` against fake nodes; e2e serves a page with `<div id="app"><button class="cta" data-testid="buy">Buy</button></div>`, draws a box over the button, asserts the prompt contains `button.cta` and `data-testid="buy"`.

### Task 16: Console errors and failed requests

**Files:** `src/content.ts` (error ring buffer installed at `document_idle`, `SB_GET_DIAGNOSTICS`), `src/lib/capture.ts` (`getDiagnostics`), `src/lib/feedback.ts` (Detailed verbosity), `README.md` (honest limitation: errors are captured from content-script injection onward).

**Interfaces:**

```ts
export interface PageDiagnostics {
  errors: Array<{ message: string; source?: string; line?: number; at: string }>; // last 20
  failedRequests: Array<{ url: string; status: number; initiatorType: string }>; // responseStatus >= 400 via PerformanceResourceTiming
}
```

Acceptance: e2e page throws in a `setTimeout` after load and requests a 404 image; prompt (Detailed) lists both.

### Task 17: JSON sidecar and Claude Code skill

**Files:** `src/lib/sidecar.ts` (`buildSidecar(...)`: version 1, environment, general feedback, numbered annotations with geometry + context, diagnostics, `imagePath`), `src/editor/use-exports.ts` (`copyForClaudeCode` downloads `shotback/cap-<ts>.json` next to the PNG and the prompt references both), `skills/shotback/SKILL.md` (how an agent reads the sidecar and maps `cssPath`/`component` to source), README section "Use with Claude Code".

Acceptance: unit test for `buildSidecar` shape; e2e reads the downloaded JSON via `chrome.downloads.search` and validates `annotations[0].n === 1`.

### Task 18: Prompt verbosity

**Files:** `src/lib/feedback.ts` (`verbosity: "compact" | "standard" | "detailed"`), `src/lib/prefs.ts`, `src/editor/sidebar.tsx` (Select), tests.

Compact = numbers + comments + general feedback; Standard = + environment + geometry + context summary (cssPath, component); Detailed = + text, classes, rect, diagnostics. Acceptance: three unit snapshots.

### Task 19: PRD rewrite

**Files:** `.docs/PRD.md`. Reframe around "visual feedback into a coding agent"; goals, non-goals (no cloud), success criteria (an agent can locate every annotated element from the sidecar without the image). Docs-only PR.

**Phase 2 exit criteria:** the Claude Code prompt + sidecar lets an agent identify the element behind every numbered comment on the e2e fixture page without opening the PNG.

---

# Phase 3 - parity and distribution (detailed steps written at phase start)

### Task 20: Visible-only and delayed capture
`background.ts` opens the editor with `mode=visible|full` and `delay=0|3`; `captureFullPage` takes `{ mode, delaySeconds }` (visible = `steps = [0]`, delay = countdown in the on-page notice). Entry points: **DESIGN GATE** between a `contextMenus` submenu on the toolbar icon and a small chooser in the editor's Capture button. `contextMenus` permission needs a `SECURITY.md` entry.

### Task 21: Crop tool (region capture)
`Annotation` gets no new type; crop is editor state `crop?: {x,y,width,height}` applied in `exportAnnotatedImage` and shifting annotation coordinates. Pure `applyCrop(annotations, crop)` unit-tested.

### Task 22: Blur / redact
New tool `"redact"`: `RedactAnnotation { tool: "redact"; x; y; width; height }` - not numbered, not in the prompt (listed as `[redacted region]` count only). Export pixelates: draw the region to a `Math.ceil(w/12) x Math.ceil(h/12)` offscreen canvas and back with `imageSmoothingEnabled = false`. Canvas shows a hatched rect. Acceptance: export pixel test proves the region's variance collapsed.

### Task 23: Highlight and freehand
`"highlight"` = translucent filled rect (`color` at 35% alpha, multiply); `"pen"` = polyline `points: Array<{x,y}>`. Both numbered like box/arrow. **DESIGN GATE** for the toolbar with 6 tools (reuse the Task 11 pick).

### Task 24: JPEG export and size readout
`exportAnnotatedImage(..., { format: "png" | "jpeg", quality })`; sidebar shows the export size; Download offers PNG/JPEG. Sidecar records `imageFormat`.

### Task 25: Web Store readiness
`PRIVACY.md` published via GitHub Pages; `scripts/package.mjs` zips `dist/` on `git tag v*` through a `release.yml` workflow; listing screenshots generated by an e2e script into `store/`; `manifest.version` bumped by the release workflow.

### Task 26: Batch queue
Saved shares gain a checkbox; "Send selected to agent" writes one sidecar with `captures: [...]` and one prompt. Reuses Task 17's `buildSidecar` per capture.

### Task 27: Diff mode
"Re-capture" on a saved share opens the editor with the same URL in a new tab, captures, and saves a share with `previousShareId`; the viewer renders before/after side by side; the sidecar includes both paths and the agent prompt says "verify the fix".

**Phase 3 exit criteria:** feature table in the review has no red cells except PDF export (deliberately skipped: `chrome.printing` is not available to extensions; users can print the viewer to PDF).

---

## Self-review against the spec

- **P0-1 dark theme** -> Task 3. **P0-2 pins/prompt mismatch** -> Task 5. **P0-3 sidebar overflow** -> Task 4. **P0-4 scrollbar strip** -> Task 2. **P0-5 editor overlap** -> Task 6. **P0-6 undo, focus race, native colour** -> Tasks 7, 6, 11.
- **P1 table**: shortcut 9, clipboard 10, blur 22, modes 20/21, numbers 5, highlight/freehand/crop 23/21, undo 7, zoom 8, swatches/hotkeys 11, JPEG 24 (PDF skipped, stated).
- **P2 list**: environment 13, geometry 14, DOM context 15, diagnostics 16, sidecar + skill 17, verbosity 18, batch 26, diff 27.
- **P3**: PRD 19, hierarchy 12, store 25, empty state copy folded into Task 12, editor split Task 1, branch protection is a repo-settings action for the owner (not a code task).
- Types: `EditorState` (Task 1) is consumed by Tasks 5-12; `numberAnnotations` (Task 5) by 14, 17; `CaptureEnvironment` (13) by 17; `ElementContext` (15) by 17, 18; `History<T>` (7) is self-contained.
