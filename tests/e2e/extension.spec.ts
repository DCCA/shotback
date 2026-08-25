import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
// @ts-expect-error - a plain .mjs build script with no types of its own; it
// owns the one predicate the build guard fails on, reused here rather than
// restated so the test and the gate cannot drift.
import { hasModuleSyntax } from "../../scripts/check-content-script.mjs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
  type Worker as ServiceWorker
} from "@playwright/test";

// Loads the unpacked `dist/` extension in real Chromium and verifies the parts
// of one-click capture that are automatable without the browser's toolbar UI:
// the extension loads, the on-page capture notice shows/hides/removes cleanly
// (driven through the real content script), the editor page renders, and a
// real full-page capture (editor opened with `autocapture=1`, so it runs the
// actual `captureVisibleTab` scroll-and-stitch loop) is complete and in order.

const dir = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.resolve(dir, "..", "..", "dist");

const PAGE_HTML = `<!doctype html><html><head><meta charset="utf8"><title>Acme Dashboard</title></head>
<body style="margin:0;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">
<header style="height:64px;background:#111827;color:#fff;display:flex;align-items:center;padding:0 24px;font-weight:700">Acme Dashboard</header>
<main style="padding:32px;max-width:900px"><h1>Quarterly report</h1>
<div style="height:160px;background:#e5e7eb;border-radius:12px;margin:24px 0"></div>
<div style="height:800px"></div></main></body></html>`;

// Eight 300px colour blocks whose hue encodes their index, so a stitched
// capture can be checked for completeness *and* order by sampling pixels.
const BLOCKS = Array.from(
  { length: 8 },
  (_, i) => `<div style="height:300px;background:hsl(${(i * 37) % 360},70%,60%)"></div>`
).join("");

// A real, identifiable control to annotate: absolutely positioned so it sits
// over a colour block without changing the page height the capture assertions
// depend on, and clear of the sampled columns (x=20 and the right edge). The
// inline script hangs a React-shaped fiber off it exactly the way React does
// (a page expando), so the main-world component pass has something to find.
const ctaAt = (top: number): string =>
  `<div id="app" style="position:absolute;top:${top}px;left:200px"><section class="hero"><button class="cta" data-testid="buy" style="width:200px;height:120px;font-size:20px">Buy now</button></section></div>` +
  `<script>document.querySelector("button.cta")["__reactFiber$e2e"] = ` +
  `{ type: "button", return: { type: { name: "PricingCard" }, return: ` +
  `{ type: "div", return: { type: { displayName: "Page" }, return: null } } } };</script>`;

const CTA = ctaAt(120);

/**
 * Where the `scrolled` fixture's CTA sits, and how far down that page the
 * visible-area test scrolls before capturing. The difference is where the
 * button lands in the one captured frame - so an image coordinate read back
 * without the capture's own scroll offset points at a colour block instead.
 */
const SCROLLED_CTA_TOP = 1300;
const SCROLLED_BY = 1200;

// A page that goes wrong on purpose, for the prompt's Diagnostics block: one
// request the server answers with 404. The image is 1px and transparent so it
// changes neither the page height nor any sampled pixel the capture assertions
// depend on. (The uncaught error that belongs beside it is not here: Chromium
// reports an error only to the world that threw, so the content script cannot
// see the page's - see README's "Known limitations".)
const FAILING = `<img src="/missing.png" style="position:absolute;top:0;left:0;width:1px;height:1px;opacity:0">`;

const CAPTURE_PAGES: Record<string, string> = {
  // The document itself scrolls, but with `scroll-behavior: smooth` - an
  // animated scroll must not be captured mid-flight.
  smooth: `<!doctype html><html style="scroll-behavior:smooth"><body style="margin:0;position:relative">${BLOCKS}${CTA}${FAILING}</body></html>`,
  // SPA shell: the document does not scroll at all, an inner element does.
  // The CTA well below the fold, for the visible-area inspection test.
  scrolled: `<!doctype html><html><body style="margin:0;position:relative">${BLOCKS}${ctaAt(SCROLLED_CTA_TOP)}</body></html>`,
  inner: `<!doctype html><html style="height:100%;overflow:hidden"><body style="margin:0;height:100%;overflow:hidden;display:flex;flex-direction:column"><div style="height:64px;background:#111;flex:none"></div><div style="flex:1;overflow:auto;position:relative">${BLOCKS}${CTA}</div></body></html>`
};

let ctx: BrowserContext;
let sw: ServiceWorker;
let extId: string;
let server: http.Server;
let base: string;

test.beforeAll(async () => {
  expect(existsSync(EXT), "dist/ must be built first (run: npm run build)").toBe(true);

  server = http.createServer((req, res) => {
    const route = (req.url ?? "/").slice(1);
    // Anything that is not a fixture page 404s, so the fixtures can ask for a
    // resource that fails the way a real broken page does.
    if (route && !CAPTURE_PAGES[route]) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("not found");
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(CAPTURE_PAGES[route] ?? PAGE_HTML);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;

  ctx = await chromium.launchPersistentContext("", {
    headless: false,
    // No emulated viewport: captureVisibleTab grabs the real window, and an
    // emulated `innerHeight` would disagree with it.
    viewport: null,
    args: [
      "--headless=new",
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      "--no-sandbox"
    ]
  });

  sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
  extId = new URL(sw.url()).host;
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
});

test.afterAll(async () => {
  await ctx?.close();
  await new Promise<void>((resolve) => server?.close(() => resolve()));
});

/**
 * Send a message to the target tab's content script from the service worker,
 * retrying until it is delivered. The content script registers its listener at
 * `document_idle`, so the first send can race page load; this waits it out and
 * fails clearly if the message is never received.
 */
async function send(message: Record<string, unknown>): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const delivered = await sw.evaluate(
      async ([b, msg]) => {
        const [tab] = await chrome.tabs.query({ url: (b as string) + "*" });
        if (tab?.id == null) return false;
        try {
          await chrome.tabs.sendMessage(tab.id, msg);
          return true;
        } catch {
          return false;
        }
      },
      [base, message] as const
    );
    if (delivered) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`content script never received ${JSON.stringify(message)}`);
}

/**
 * Copy the cloud-LLM prompt. Only the clipboard read is worth polling
 * (`readClipboard` below) - each click of this button also downloads a PNG.
 */
async function copyCloudPrompt(editor: Page): Promise<void> {
  await editor.getByRole("button", { name: "Prepare for Cloud LLM" }).click();
  // The copy runs async after the click; wait for the success status before
  // reading the clipboard, or the read can race the write.
  await expect(editor.locator('[aria-live="polite"] p.font-medium')).toContainText("Prompt copied");
}

const readClipboard = (editor: Page): Promise<string> =>
  editor.evaluate(async () => navigator.clipboard.readText());

/**
 * The absolute path of the most recent completed download of a given MIME
 * type, polled through the service worker because `chrome.downloads` only
 * reports a path once Chrome has finished writing the file. Matching on the
 * MIME type rather than the name is deliberate: Playwright intercepts every
 * download and renames it to a GUID artifact, so the `shotback/cap-<ts>.json`
 * name the extension asks for is not what lands on disk here. The name is
 * asserted through the sidecar's own `imagePath` (a bare `cap-<ts>.<ext>`,
 * relative to the JSON beside it) instead.
 */
async function downloadedFile(mime: string): Promise<string> {
  let filename = "";
  await expect
    .poll(
      async () => {
        filename = await sw.evaluate(async (type) => {
          const items = await chrome.downloads.search({
            state: "complete",
            orderBy: ["-startTime"],
            limit: 20
          });
          return items.find((item) => item.mime === type)?.filename ?? "";
        }, mime);
        return filename;
      },
      { timeout: 15_000 }
    )
    .not.toBe("");
  return filename;
}

/**
 * The editor stamps `data-sb-inspect-gen` on its body every time an inspection
 * writes contexts back (a test hook, set in `refreshContexts`). Waiting for it
 * to move past the value read before a gesture is what makes "the prompt names
 * the element" deterministic instead of a race with the round trip.
 */
const inspectGen = (editor: Page): Promise<number> =>
  editor.evaluate(() => Number(document.body.dataset.sbInspectGen ?? 0));

async function waitForInspection(editor: Page, previous: number): Promise<void> {
  await expect.poll(() => inspectGen(editor), { timeout: 10_000 }).toBeGreaterThan(previous);
}

/**
 * Pick a segment on the canvas tool palette. `exact` matters: "Crop" would
 * otherwise also match the marquee's own "Apply crop" button.
 */
async function pickTool(editor: Page, label: string): Promise<void> {
  await editor.getByRole("button", { name: label, exact: true }).click();
}

/** The on-page capture notice's text, or "" when there is no notice. */
const noticeText = (page: Page): Promise<string> =>
  page.evaluate(
    () => (document.querySelector("[data-shotback-overlay]") as HTMLElement | null)?.innerText ?? ""
  );

/** Pick a capture mode from the chooser beside the Capture Page button. */
async function pickMode(editor: Page, label: string): Promise<void> {
  await editor.getByRole("combobox", { name: "Capture mode" }).click();
  await editor.getByRole("option", { name: label }).click();
}

/** True when that palette segment is the lit one. */
const toolIsActive = (editor: Page, label: string): Promise<boolean> =>
  editor
    .getByRole("button", { name: label, exact: true })
    .evaluate((el) => el.getAttribute("aria-pressed") === "true");

/** The x/y/width/height of an SVG rect, in the canvas's image-px coordinate space. */
async function rectOf(
  locator: Locator
): Promise<{ x: number; y: number; width: number; height: number }> {
  const [x, y, width, height] = await Promise.all(
    ["x", "y", "width", "height"].map(async (name) => Number(await locator.getAttribute(name)))
  );
  return { x, y, width, height };
}

/**
 * The crop in force, in image px. Read off the canvas window rather than a
 * marquee rect: once a crop is applied the canvas stops drawing a marquee
 * entirely and shows only the cropped region, so `#capture-window`'s own
 * `data-crop` is where the applied region is stated.
 */
async function appliedCrop(
  editor: Page
): Promise<{ x: number; y: number; width: number; height: number }> {
  const raw = await editor.locator("#capture-window").getAttribute("data-crop");
  const [x, y, width, height] = (raw ?? "").split(",").map(Number);
  return { x, y, width, height };
}

/**
 * Draw a box over the fixture's CTA button. `top` is the header band above the
 * scroller on the stitched image, so the same call works for the document
 * scroller (0) and the inner one (64). Returns the button centre on screen.
 */
async function boxOverCta(
  editor: Page,
  img: Locator,
  top: number
): Promise<{ x: number; y: number }> {
  const natural = await img.evaluate((el) => (el as HTMLImageElement).naturalWidth);
  const shown = (await img.boundingBox())!;
  // Stitched image px -> editor screen px (the image is fit to the pane).
  const k = shown.width / natural;
  const onScreen = (px: number, py: number) => ({ x: shown.x + px * k, y: shown.y + py * k });

  // Either caller can arrive here on any segment, so the palette is set
  // explicitly - Box puts the canvas in draw mode by itself.
  await pickTool(editor, "Box");

  const from = onScreen(250, top + 150);
  const to = onScreen(350, top + 215);
  await editor.mouse.move(from.x, from.y);
  await editor.mouse.down();
  await editor.mouse.move(to.x, to.y, { steps: 5 });
  await editor.mouse.up();
  await editor.keyboard.press("Escape");

  return onScreen(300, top + 182);
}

test("extension loads with no popup and the downloads permission", async () => {
  const manifest = await sw.evaluate(() => chrome.runtime.getManifest());
  expect(manifest.action?.default_popup).toBeUndefined();
  expect(manifest.permissions).toContain("downloads");
  expect(manifest.commands?._execute_action?.suggested_key?.default).toBe("Alt+Shift+S");

  // The content script is a *classic* script (the service worker is the only
  // `"type": "module"` entry), so it has to be self-contained. The moment a
  // helper it imports is also imported by the editor, Vite emits it as a
  // shared chunk and `content.js` starts with `import ... from "./assets/..."`
  // - which a classic content script cannot execute. It then never loads at
  // all, and every capture dies with "Receiving end does not exist", far from
  // the change that caused it. Cheaper to fail here, on the built file.
  // `hasModuleSyntax` is the build guard's own predicate - it already fails
  // `npm run build`, and so `npm run check`, before this test can run.
  // Imported rather than restated so the two cannot drift, and asserted here
  // too because this is the file the loaded extension is actually running.
  expect(hasModuleSyntax(await readFile(path.join(EXT, "content.js"), "utf8"))).toBe(false);
});

test("capture notice shows, hides for the frame, and is removed", async () => {
  const page = await ctx.newPage();
  await page.goto(base, { waitUntil: "load" });

  await send({ type: "SB_CAPTURE_BEGIN" });
  const shown = await page.evaluate(() => {
    const el = document.querySelector("[data-shotback-overlay]") as HTMLElement | null;
    return {
      present: !!el,
      display: el && getComputedStyle(el).display,
      text: el?.innerText ?? ""
    };
  });
  expect(shown.present).toBe(true);
  expect(shown.display).toBe("flex");
  expect(shown.text).toContain("Capturing full page");

  await send({ type: "SB_SET_OVERLAY", visible: false });
  const hidden = await page.evaluate(() => {
    const el = document.querySelector("[data-shotback-overlay]") as HTMLElement | null;
    return el && getComputedStyle(el).display;
  });
  expect(hidden).toBe("none");

  await send({ type: "SB_CAPTURE_END" });
  const removed = await page.evaluate(() => !document.querySelector("[data-shotback-overlay]"));
  expect(removed).toBe(true);

  await page.close();
});

test("capture notice spinner is static under prefers-reduced-motion", async () => {
  const page = await ctx.newPage();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(base, { waitUntil: "load" });

  await send({ type: "SB_CAPTURE_BEGIN" });
  const animationName = await page.evaluate(() => {
    const spinner = document.querySelector("[data-shotback-spinner]") as HTMLElement;
    return getComputedStyle(spinner).animationName;
  });
  // The ring itself stays visible (it communicates progress on its own); only
  // the spin is skipped.
  expect(animationName).toBe("none");

  await send({ type: "SB_CAPTURE_END" });
  await page.close();
});

for (const [name, headerHeight] of [
  ["smooth", 0],
  ["inner", 64]
] as const) {
  test(`full-page capture stitches every viewport in order (${name})`, async () => {
    const page = await ctx.newPage();
    await page.goto(base + name, { waitUntil: "load" });
    // The prompt's Environment block must describe the *captured* tab, so read
    // its real viewport here (the editor page is resized later in this test).
    const viewport = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight
    }));
    const { tabId, windowId } = await sw.evaluate(async (url) => {
      const [tab] = await chrome.tabs.query({ url });
      return { tabId: tab.id, windowId: tab.windowId };
    }, base + name);

    const editor = await ctx.newPage();
    await editor.goto(
      `chrome-extension://${extId}/editor.html?tabId=${tabId}&windowId=${windowId}&autocapture=1`
    );
    const img = editor.locator("img[src^='data:image/png']");
    await expect(img).toHaveJSProperty("complete", true, { timeout: 30_000 });

    // Sample the middle of each block (x=20, away from any text) and compare
    // its hue with the index it encodes.
    const result = await img.evaluate((el, top) => {
      const image = el as HTMLImageElement;
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const c = canvas.getContext("2d")!;
      c.drawImage(image, 0, 0);
      const hueAt = (x: number, y: number) => {
        const [r, g, b] = c.getImageData(x, y, 1, 1).data;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const d = max - min || 1;
        const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
        return (Math.round(h * 60) + 360) % 360;
      };
      const mismatched: number[] = [];
      for (let i = 0; i < 8; i += 1) {
        for (const y of [top + i * 300 + 20, top + i * 300 + 150, top + i * 300 + 280]) {
          if (Math.abs(hueAt(20, y) - ((i * 37) % 360)) > 3) mismatched.push(y);
        }
        // Right edge (near the scrollbar track) must show page content, not the
        // scrollbar itself, once capture hides it.
        if (Math.abs(hueAt(image.naturalWidth - 4, top + i * 300 + 150) - ((i * 37) % 360)) > 3)
          mismatched.push(-(top + i * 300 + 150));
      }
      return { height: image.naturalHeight, mismatched };
    }, headerHeight);

    expect(result.height).toBe(headerHeight + 8 * 300);
    expect(result.mismatched).toEqual([]);

    if (name === "smooth") {
      // Draw a box and type straight away, with no wait: the comment textarea
      // must already be focused when the first keystroke arrives, or the "C"
      // of "Chart" is lost to the window.
      await editor.setViewportSize({ width: 1280, height: 900 });
      const canvas = (await img.boundingBox())!;
      const x = canvas.x + 60;
      const y = canvas.y + 60;
      await editor.mouse.move(x, y);
      await editor.mouse.down();
      await editor.mouse.move(x + 160, y + 120, { steps: 5 });
      await editor.mouse.up();
      await editor.keyboard.type("Chart");

      const row = editor.locator("ol li button").first();
      // `nth(1)`, not `last()`: the row is meta line, note, then - once the
      // DOM inspection lands - the element descriptor, so `last()` raced the
      // round trip and read the selector instead of the note.
      await expect(row.locator("div").nth(1)).toHaveText("Chart");

      await editor.getByRole("button", { name: "Copy Image" }).click();
      // The copy runs async after the click; wait for the success status
      // before reading the clipboard, or the read can race the write.
      await expect(editor.locator('[aria-live="polite"] p.font-medium')).toContainText("copied");
      const type = await editor.evaluate(
        async () => (await navigator.clipboard.read())[0].types[0]
      );
      expect(type).toBe("image/png");

      // The outcome is announced over the canvas, not at the bottom of the
      // sidebar's scroll flow, where it was routinely off screen. Checked
      // against the canvas pane's own box rather than a coordinate.
      // "missing" rather than a thrown dereference: the toast clears itself
      // after 4s, and a slow machine could get here after it has gone. That is
      // a real failure, but it should read as one rather than as a TypeError.
      //
      // And it is docked to the *bottom* of that pane: the tool palette runs
      // along the top of the same card, so a toast up there covered the colour
      // swatches and (being pointer-events-auto) ate clicks aimed at them for
      // the whole 4s it was up.
      const toastInCanvasPane = await editor.evaluate(() => {
        const node = document.querySelector('[aria-live="polite"] p.font-medium');
        if (!node) return "missing";
        const pane = document.querySelectorAll("main > div")[1].getBoundingClientRect();
        const toast = node.getBoundingClientRect();
        const swatches = document
          .querySelector('[role="group"][aria-label="Annotation color"]')!
          .getBoundingClientRect();
        return {
          inPane:
            toast.left >= pane.left &&
            toast.right <= pane.right &&
            toast.top >= pane.top &&
            toast.bottom <= pane.bottom,
          clearOfPalette: toast.top > swatches.bottom,
          // Not just z-order: the toast is pointer-events-auto, so what
          // matters is which element a click on the swatch row actually hits.
          swatchesClickable: Boolean(
            document
              .elementFromPoint(
                (swatches.left + swatches.right) / 2,
                (swatches.top + swatches.bottom) / 2
              )
              ?.closest('[role="group"][aria-label="Annotation color"]')
          )
        };
      });
      expect(toastInCanvasPane).toMatchObject({
        inPane: true,
        clearOfPalette: true,
        swatchesClickable: true
      });
      // A success clears itself rather than sitting there through the next
      // three exports, and capture progress leaves nothing behind either.
      await expect(editor.locator('[aria-live="polite"] p.font-medium')).toHaveCount(0, {
        timeout: 10_000
      });
      await expect(editor.getByText(/Capturing/)).toHaveCount(0);

      // One scroller: at the desktop breakpoint the window itself does not
      // scroll at all, and the capture's own scrollport is what moves.
      const shell = await editor.evaluate(() => {
        const viewport = document.querySelector("#capture-viewport")!;
        return {
          pageOverflow: document.documentElement.scrollHeight - window.innerHeight,
          viewportScrolls: viewport.scrollHeight > viewport.clientHeight
        };
      });
      expect(shell.pageOverflow).toBeLessThanOrEqual(0);
      expect(shell.viewportScrolls).toBe(true);

      // A second box, over the CTA: with the document scrolling, the element
      // under an annotation must be named just as it is for an inner scroller.
      const inspectedBefore = await inspectGen(editor);
      await boxOverCta(editor, img, headerHeight);
      await expect(editor.locator("ol li")).toHaveCount(2);
      await waitForInspection(editor, inspectedBefore);

      // The cloud-LLM prompt carries the captured tab's environment, at the
      // default "Standard" prompt detail level - but not the Diagnostics
      // block, which is Detailed-only (see the verbosity checks below).
      await copyCloudPrompt(editor);
      const prompt = await readClipboard(editor);
      expect(prompt).toContain(`Viewport: ${viewport.width}x${viewport.height}`);
      expect(prompt).toContain("Scroller: document");
      // The drawn box's line carries its geometry (px + % of page) so an
      // agent can locate it without opening the image.
      expect(prompt).toMatch(
        /1\. \[box\] Chart - at \(\d+, \d+\) size \d+x\d+ px \[\d+%, \d+% of page\]/
      );
      expect(prompt).toContain("-> #app > section.hero > button.cta");
      expect(prompt).not.toContain("Diagnostics:");

      // The verbosity switches are wrapped so a failed expectation cannot
      // leave the stored preference on Compact/Detailed for the tests after
      // this one - the pref outlives the editor page.
      try {
        // Compact drops the Environment block (and geometry/context) entirely.
        await editor.getByRole("combobox", { name: "Prompt detail" }).click();
        await editor.getByRole("option", { name: "Compact" }).click();
        await copyCloudPrompt(editor);
        expect(await readClipboard(editor)).not.toContain("Environment:");

        // Detailed adds the Diagnostics block: what the page reported going
        // wrong, read back from resource timing (the fixture's 404'd image).
        await editor.getByRole("combobox", { name: "Prompt detail" }).click();
        await editor.getByRole("option", { name: "Detailed" }).click();
        await copyCloudPrompt(editor);
        const detailedPrompt = await readClipboard(editor);
        expect(detailedPrompt).toContain("Diagnostics:");
        expect(detailedPrompt).toContain("- Failed requests:");
        expect(detailedPrompt).toContain("404 ");
        expect(detailedPrompt).toContain("/missing.png");
      } finally {
        // Reset to Standard so the rest of the suite sees today's default.
        await editor.getByRole("combobox", { name: "Prompt detail" }).click();
        await editor.getByRole("option", { name: "Standard" }).click();
      }
    }

    if (name === "inner") {
      // This branch is the suite's mega-block: capture, annotate, share,
      // sidecar, JPEG, crop and the batch handoff, all against one editor.
      // It needs more than the default per-test budget.
      test.setTimeout(180_000);

      // Fit-to-width default: a capture wider than the editor pane must not
      // be silently clipped by the canvas Card's `overflow-hidden` (nor
      // scroll the page itself sideways). Pick a viewport narrower than the
      // real capture so the pane is actually forced to shrink it.
      const naturalWidth = await img.evaluate((el) => (el as HTMLImageElement).naturalWidth);
      await editor.setViewportSize({ width: Math.round(naturalWidth * 0.7), height: 800 });
      const canvasClipped = () =>
        editor.evaluate(() => {
          const card = document.querySelectorAll("main > div")[1] as HTMLElement; // second Card = AnnotationCanvas
          return card.scrollWidth > card.clientWidth;
        });
      const pageScrolls = () =>
        editor.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth
        );
      // The SVG annotation overlay must cover the image exactly - not just
      // the pane's visible width - or pointer hit-testing silently misses
      // whatever part of the image is only reachable by scrolling.
      const overlayMatchesImage = () =>
        editor.evaluate(() => {
          const img = document.querySelector("#capture-image")!.getBoundingClientRect();
          const svg = document.querySelector("#capture-viewport svg")!.getBoundingClientRect();
          return (
            Math.abs(svg.width - img.width) < 1 &&
            Math.abs(svg.height - img.height) < 1 &&
            Math.abs(svg.left - img.left) < 1 &&
            Math.abs(svg.top - img.top) < 1
          );
        });
      expect(await canvasClipped()).toBe(false);
      expect(await pageScrolls()).toBe(false);
      expect(await overlayMatchesImage()).toBe(true);

      // Switching to 1:1 must not clip or scroll the page either - the
      // wrapper around the image scrolls instead.
      await editor.getByRole("combobox", { name: "Zoom" }).click();
      await editor.getByRole("option", { name: "Actual size (100%)" }).click();
      expect(await canvasClipped()).toBe(false);
      expect(await pageScrolls()).toBe(false);
      expect(await overlayMatchesImage()).toBe(true);
      const wrapScrolls = await editor.evaluate(() => {
        const wrap = document.querySelector("#capture-viewport")!;
        return wrap.scrollWidth > wrap.clientWidth;
      });
      expect(wrapScrolls).toBe(true);

      // The overlay must still cover the image exactly once scrolled - the
      // part of the image only visible after scrolling must stay annotatable.
      await editor.evaluate(() => {
        const el = document.querySelector("#capture-viewport")!;
        el.scrollLeft = el.scrollWidth;
      });
      expect(await overlayMatchesImage()).toBe(true);

      await editor.getByRole("combobox", { name: "Zoom" }).click();
      await editor.getByRole("option", { name: "Fit width" }).click();

      // The share link anchor renders the full chrome-extension:// URL as one
      // unbreakable string; it must wrap instead of pushing the sidebar wide.
      // Widen past the lg breakpoint so the sidebar sits in its fixed-width
      // column (the capture itself already ran against the real window size).
      await editor.setViewportSize({ width: 1280, height: 900 });
      await editor.getByRole("button", { name: "Copy Local Share Link" }).click();
      await editor.waitForSelector("a[href*='viewer.html']");
      const overflow = await editor.evaluate(() => {
        const card = document.querySelector("main > div")!; // first Card = sidebar
        return card.scrollWidth - card.clientWidth;
      });
      expect(overflow).toBe(0);

      // Undo/redo: a drag is one history entry, so Ctrl+Z puts the box back
      // where it was drawn and Ctrl+Shift+Z moves it again.
      const canvas = (await img.boundingBox())!;
      await editor.mouse.move(canvas.x + 60, canvas.y + 60);
      await editor.mouse.down();
      await editor.mouse.move(canvas.x + 220, canvas.y + 180, { steps: 5 });
      await editor.mouse.up();

      const rect = editor.locator("svg > g > rect").first();
      const originalX = (await rect.getAttribute("x"))!;

      await pickTool(editor, "Select");

      await editor.mouse.move(canvas.x + 140, canvas.y + 120);
      await editor.mouse.down();
      await editor.mouse.move(canvas.x + 190, canvas.y + 120, { steps: 5 });
      await editor.mouse.up();
      const movedX = (await rect.getAttribute("x"))!;
      expect(Number(movedX)).toBeGreaterThan(Number(originalX));

      await editor.keyboard.press("Control+z");
      await expect(rect).toHaveAttribute("x", originalX);
      await editor.keyboard.press("Control+Shift+z");
      await expect(rect).toHaveAttribute("x", movedX);

      // A comment edit is its own entry, and it must be committed even when the
      // inline editor is closed by a click on empty canvas (which unmounts the
      // textarea, so no blur is dispatched) - otherwise the next undo throws
      // the typed comment away with no redo path.
      const row = editor.locator("ol li button").first();
      await editor.locator("foreignObject textarea").fill("hello");
      await expect(row).toContainText("hello");
      await editor.mouse.click(canvas.x + 600, canvas.y + 500);

      await editor.keyboard.press("Control+z");
      await expect(row).toContainText("(no comment)");
      await expect(rect).toHaveAttribute("x", movedX);
      await editor.keyboard.press("Control+z");
      await expect(rect).toHaveAttribute("x", originalX);

      // A delete is one entry too, from the keyboard path.
      await editor.mouse.click(canvas.x + 140, canvas.y + 120);
      await editor.keyboard.press("Delete");
      await expect(rect).toHaveCount(0);
      await editor.keyboard.press("Control+z");
      await expect(rect).toHaveAttribute("x", originalX);

      // A text annotation is created on pointer-DOWN, so it never reaches the
      // pointer-up commit: placing one must still be its own entry, and undoing
      // it must not reach past it into the previous edit.
      const rows = editor.locator("ol li");
      await expect(rows).toHaveCount(1);
      await pickTool(editor, "Text");

      await editor.mouse.click(canvas.x + 600, canvas.y + 500);
      await expect(rows).toHaveCount(2);
      await editor.keyboard.press("Escape");

      await editor.keyboard.press("Control+z");
      await expect(rows).toHaveCount(1);
      await expect(rect).toHaveAttribute("x", originalX);
      await editor.keyboard.press("Control+Shift+z");
      await expect(rows).toHaveCount(2);

      // Per-annotation DOM context: a box drawn over the CTA is mapped back to
      // the live tab, so the copied prompt names the element it covers - and
      // the component chain comes from the page's own JavaScript world.
      const inspectedBefore = await inspectGen(editor);
      const centre = await boxOverCta(editor, img, headerHeight);
      await expect(rows).toHaveCount(3);
      await waitForInspection(editor, inspectedBefore);

      // ...and the editor says so *before* the export: the element the box
      // landed on is one muted line in its timeline row, with the whole path
      // on hover. `elementsFromPoint` always answers something, so a box a few
      // px off its target still resolves a confident selector - which used to
      // surface for the first time in the copied prompt.
      const cta = rows.nth(2);
      await expect(cta).toContainText("button.cta");
      await expect(cta.locator("[title]")).toHaveAttribute(
        "title",
        "#app > section.hero > button.cta"
      );
      // The text annotation landed on nothing named, and says that rather than
      // showing nothing at all - asserted on the descriptor element itself
      // (the one node in the row carrying the full path as its `title`), so
      // unrelated note text elsewhere in the row cannot satisfy it.
      const anonymous = rows.nth(1).locator("[title]");
      await expect(anonymous).toHaveText(/^[a-z]+(:nth-of-type\(\d+\)|[#.][\w-]+)?$/);
      await expect(anonymous).toHaveAttribute("title", /^html > body/);

      await copyCloudPrompt(editor);
      expect(await readClipboard(editor)).toContain(
        "-> #app > section.hero > button.cta in <PricingCard > Page>"
      );

      // The context is derived data re-read on every commit, so it must still
      // be there after the box is moved (while it still covers the button).
      // Drawing leaves the Box tool active now, so moving one is an explicit
      // switch to Select.
      const inspectedBeforeMove = await inspectGen(editor);
      await pickTool(editor, "Select");
      await editor.mouse.move(centre.x, centre.y);
      await editor.mouse.down();
      await editor.mouse.move(centre.x + 20, centre.y, { steps: 5 });
      await editor.mouse.up();
      await waitForInspection(editor, inspectedBeforeMove);
      await copyCloudPrompt(editor);
      const uncroppedPrompt = await readClipboard(editor);
      expect(uncroppedPrompt).toContain("button.cta");
      // The placed text annotation is in the prompt while nothing is cropped;
      // it sits well outside the crop drawn below, so it must vanish from it.
      expect(uncroppedPrompt).toContain("[text]");

      // The Claude Code handoff writes a JSON sidecar beside the PNG, so an
      // agent can read the annotations instead of pixel-hunting in the image.
      await editor.getByRole("button", { name: "Copy for Claude Code" }).click();
      await expect(editor.locator('[aria-live="polite"] p.font-medium')).toContainText(
        "Copied a Claude Code prompt"
      );
      const claudePrompt = await readClipboard(editor);
      // ...and leaves a trace inside the extension itself. The files go to
      // Downloads and the prompt to the clipboard, and until this the tool
      // that made the capture could not show it to you afterwards: one saved
      // share existed at this point (the one saved above), and this export
      // adds its own.
      await expect(editor.locator("#saved-share-count")).toHaveText("2");
      const sidecarFile = await downloadedFile("application/json");
      expect(claudePrompt.split("\n")[0]).toBe(
        `Review this screenshot: ${await downloadedFile("image/png")}`
      );
      expect(claudePrompt.split("\n")[1]).toBe(
        `Machine-readable annotations (selectors, rects, diagnostics): ${sidecarFile}`
      );

      const sidecar = JSON.parse(await readFile(sidecarFile, "utf8"));
      expect(sidecar.version).toBe(1);
      expect(sidecar.imagePath).toMatch(/^cap-\d+\.png$/);
      expect(sidecar.pageUrl).toBe(base + name);
      expect(sidecar.annotations[0].n).toBe(1);
      expect(sidecar.annotations[0].rect.width).toBeGreaterThan(0);
      expect(sidecar.annotations[0].normalizedRect.width).toBeLessThanOrEqual(1);
      // The box drawn over the CTA carries the element it covers.
      const onCta = sidecar.annotations.find(
        (a: { context?: { cssPath: string } }) =>
          a.context?.cssPath === "#app > section.hero > button.cta"
      );
      expect(onCta).toBeTruthy();

      // Export format: switching to JPEG changes the download's MIME, the
      // image path's extension, the sidecar's `imageFormat` field and the
      // Download button's label - the PNG-only clipboard copy and share link
      // (tested elsewhere) must stay untouched by it.
      // Wrapped so a failed expectation below cannot leave the stored
      // export format on JPEG for the rest of the suite (the crop
      // section's saved share must stay PNG) - the pref outlives the page.
      try {
        await editor.getByRole("combobox", { name: "Export format" }).click();
        await editor.getByRole("option", { name: "JPEG" }).click();
        await expect(editor.getByRole("button", { name: "Download Image (JPEG)" })).toBeVisible();

        await editor.getByRole("button", { name: "Copy for Claude Code" }).click();
        await expect(editor.locator('[aria-live="polite"] p.font-medium')).toContainText(
          "Copied a Claude Code prompt"
        );
        // Matched by MIME, not name, for the same reason as `downloadedFile`'s
        // own comment: Playwright renames every intercepted download to a GUID
        // artifact, so the `.jpg` extension is asserted through the sidecar's
        // own `imagePath` below instead.
        const jpegImageFile = await downloadedFile("image/jpeg");
        const jpegPrompt = await readClipboard(editor);
        expect(jpegPrompt.split("\n")[0]).toBe(`Review this screenshot: ${jpegImageFile}`);

        const jpegSidecarFile = await downloadedFile("application/json");
        const jpegSidecar = JSON.parse(await readFile(jpegSidecarFile, "utf8"));
        expect(jpegSidecar.imageFormat).toBe("jpeg");
        expect(jpegSidecar.imagePath).toMatch(/^cap-\d+\.jpg$/);

        // The size readout appears once any export has run.
        await expect(editor.getByText(/^Last export: \d+ KB$/)).toBeVisible();

        // Visual proof the JPEG the canvas produced is a real, paintable
        // picture - not a corrupt or blank export - by decoding the downloaded
        // file's own bytes back into a data URL and loading it as an <img>.
        const jpegBase64 = (await readFile(jpegImageFile)).toString("base64");
        const jpegNaturalWidth = await editor.evaluate(
          (base64) =>
            new Promise<number>((resolve, reject) => {
              const img = new Image();
              img.onload = () => resolve(img.naturalWidth);
              img.onerror = () => reject(new Error("failed to decode JPEG export"));
              img.src = `data:image/jpeg;base64,${base64}`;
            }),
          jpegBase64
        );
        expect(jpegNaturalWidth).toBeGreaterThan(0);
      } finally {
        // Reset to PNG so the rest of the suite (the crop section's saved share,
        // which must stay PNG) sees today's default.
        await editor.getByRole("combobox", { name: "Export format" }).click();
        await editor.getByRole("option", { name: "PNG" }).click();
      }

      // Crop: every output describes the crop region instead of the whole
      // capture. Annotations are stored uncropped and shifted only on the way
      // out, so the element context read from the live tab is untouched.
      const ctaBox = editor.locator("#capture-viewport svg > g").nth(2).locator("rect").first();
      const ctaBefore = await rectOf(ctaBox);

      const naturalPx = await img.evaluate((el) => (el as HTMLImageElement).naturalWidth);
      const shownBox = (await img.boundingBox())!;
      const scale = shownBox.width / naturalPx;
      const onScreen = (px: number, py: number) => ({
        x: shownBox.x + px * scale,
        y: shownBox.y + py * scale
      });

      // The documented path: annotate, then pick Crop and drag. The canvas is
      // in move mode after the box drag above, and picking Crop must put it
      // back into draw mode by itself.
      await pickTool(editor, "Crop");

      // Dragged bottom-right to top-left, so the marquee is normalised too.
      const cropFrom = onScreen(
        ctaBefore.x + ctaBefore.width + 120,
        ctaBefore.y + ctaBefore.height + 120
      );
      const cropTo = onScreen(ctaBefore.x - 24, ctaBefore.y - 30);
      await editor.mouse.move(cropFrom.x, cropFrom.y);
      await editor.mouse.down();
      await editor.mouse.move(cropTo.x, cropTo.y, { steps: 5 });
      await editor.mouse.up();

      // A marquee is not an annotation: no timeline row, no pin, no history.
      await expect(rows).toHaveCount(3);
      // While it waits for Apply it is adjustable: the same eight handles a
      // box gets, drawn on the marquee itself.
      await expect(editor.locator("[data-crop-handles] > g")).toHaveCount(8);

      // The floating bar never leaves the window whatever the marquee's
      // position: its anchor is clamped against its own size, so it cannot be
      // clipped out of reach by the window's overflow.
      const barInsideWindow = await editor.evaluate(() => {
        const win = document.querySelector("#capture-window")!.getBoundingClientRect();
        const bar = document.querySelector("[data-crop-controls]")!.getBoundingClientRect();
        return (
          bar.left >= win.left - 1 &&
          bar.right <= win.right + 1 &&
          bar.top >= win.top - 1 &&
          bar.bottom <= win.bottom + 1
        );
      });
      expect(barInsideWindow).toBe(true);

      await editor.getByRole("button", { name: "Apply crop" }).click();
      const cropRect = await appliedCrop(editor);
      expect(cropRect.width).toBeGreaterThan(0);
      // Applied means applied: no marquee, no dimming, and the canvas window
      // now shows the crop and nothing else. Measured as a ratio, because the
      // window is fit to the pane - the visible fraction of the capture must
      // be the crop's fraction of it on both axes.
      await expect(editor.locator("#crop-region")).toHaveCount(0);
      await expect(editor.locator("[data-crop-handles]")).toHaveCount(0);
      const cropped = await editor.evaluate(() => {
        const image = document.querySelector("#capture-image") as HTMLImageElement;
        const shown = image.getBoundingClientRect();
        const window_ = document.querySelector("#capture-window")!.getBoundingClientRect();
        return {
          widthRatio: window_.width / shown.width,
          heightRatio: window_.height / shown.height,
          natural: { width: image.naturalWidth, height: image.naturalHeight }
        };
      });
      expect(cropped.widthRatio).toBeCloseTo(cropRect.width / cropped.natural.width, 2);
      expect(cropped.heightRatio).toBeCloseTo(cropRect.height / cropped.natural.height, 2);
      // The overlay still covers the whole image, not the window: annotations
      // keep their capture coordinates, and the part the crop hides is still
      // hit-tested correctly the moment the crop is cleared.
      expect(await overlayMatchesImage()).toBe(true);

      // 1:1 with a crop applied: the same percentage mapping, so the window
      // is exactly the crop's pixel size and the overlay still covers the
      // image. Untested until now - the zoom branch only changes the window.
      await editor.getByRole("combobox", { name: "Zoom" }).click();
      await editor.getByRole("option", { name: "Actual size (100%)" }).click();
      const actualWindow = await editor
        .locator("#capture-window")
        .evaluate((el) => ({ width: el.clientWidth, height: el.clientHeight }));
      expect(actualWindow).toEqual({ width: cropRect.width, height: cropRect.height });
      expect(await overlayMatchesImage()).toBe(true);

      // ...and a pointer still lands where it looks like it lands. At 1:1 an
      // offset in window px is the same offset in capture px, so a marquee
      // dragged from 10px inside the window's top-left must report the crop
      // origin plus 10 - which only holds if `getScreenCTM` sees through the
      // window's offset wrapper. (The overlay deliberately keeps the FULL
      // image's viewBox rather than switching it to the crop rect - see
      // `.docs/done/2026-08-25-feedback-shell/design.md`.)
      const windowBox = (await editor.locator("#capture-window").boundingBox())!;
      await editor.mouse.move(windowBox.x + 10, windowBox.y + 10);
      await editor.mouse.down();
      await editor.mouse.move(windowBox.x + 90, windowBox.y + 90, { steps: 5 });
      await editor.mouse.up();
      const probe = await rectOf(editor.locator("#crop-region"));
      expect(probe.x).toBeGreaterThanOrEqual(cropRect.x + 8);
      expect(probe.x).toBeLessThanOrEqual(cropRect.x + 12);
      expect(probe.y).toBeGreaterThanOrEqual(cropRect.y + 8);
      expect(probe.y).toBeLessThanOrEqual(cropRect.y + 12);
      // Escape cancels the probe marquee; the applied crop is untouched.
      await editor.keyboard.press("Escape");
      await expect(editor.locator("#crop-region")).toHaveCount(0);
      expect(await appliedCrop(editor)).toEqual(cropRect);

      await editor.getByRole("combobox", { name: "Zoom" }).click();
      await editor.getByRole("option", { name: "Fit width" }).click();

      // Only the CTA box is inside the crop; the chip over the canvas says
      // what that costs.
      await expect(editor.getByText("outside the crop")).toContainText(
        "2 annotations outside the crop are excluded from exports"
      );
      await expect(
        editor.getByText(`Cropped to ${cropRect.width}x${cropRect.height}`)
      ).toBeVisible();

      // The canvas numbers what the export numbers: two of the three
      // annotations fall outside the crop, so exactly one pin is drawn, and it
      // is pin 1 - not the 3 it carried before the crop was applied.
      const pinLabels = await editor
        .locator("#capture-viewport svg text[text-anchor='middle']")
        .allTextContents();
      expect(pinLabels).toEqual(["1"]);

      await copyCloudPrompt(editor);
      const croppedPrompt = await readClipboard(editor);
      // The CTA box now reports where it sits *in the crop*, not on the page.
      expect(croppedPrompt).toContain(
        `at (${Math.round(ctaBefore.x - cropRect.x)}, ${Math.round(ctaBefore.y - cropRect.y)}) ` +
          `size ${Math.round(ctaBefore.width)}x${Math.round(ctaBefore.height)} px`
      );
      // Contexts are read in capture space and are not touched by a crop.
      expect(croppedPrompt).toContain("-> #app > section.hero > button.cta");
      // The text annotation is outside the crop, so it is gone from the list.
      expect(croppedPrompt).not.toContain("[text]");

      // The saved share carries the cropped image: its width is exactly the
      // crop's, and its height is the crop plus the notes legend footer drawn
      // under it - nothing like the full capture.
      await editor.getByRole("button", { name: "Copy Local Share Link" }).click();
      await expect(editor.locator('[aria-live="polite"] p.font-medium')).toContainText(
        "Local share link generated"
      );
      const shareHref = (await editor.locator("a[href*='viewer.html']").getAttribute("href"))!;
      const viewer = await ctx.newPage();
      await viewer.goto(shareHref);
      const shared = viewer.locator("img[alt='Annotated share']");
      await expect(shared).toHaveJSProperty("complete", true, { timeout: 15_000 });
      const sharedSize = await shared.evaluate((el) => ({
        width: (el as HTMLImageElement).naturalWidth,
        height: (el as HTMLImageElement).naturalHeight
      }));
      expect(sharedSize.width).toBe(cropRect.width);
      expect(sharedSize.height).toBeGreaterThanOrEqual(cropRect.height);
      expect(sharedSize.height).toBeLessThan(result.height);
      await viewer.close();

      // Clearing the crop puts the whole capture back.
      await editor.getByRole("button", { name: "Clear", exact: true }).click();
      await expect(editor.locator("#capture-window")).not.toHaveAttribute("data-crop");
      expect(await overlayMatchesImage()).toBe(true);

      // Enter applies a drawn marquee from the keyboard, the counterpart to
      // Escape cancelling one - so the floating bar is never the only way in.
      await editor.mouse.move(cropFrom.x, cropFrom.y);
      await editor.mouse.down();
      await editor.mouse.move(cropTo.x, cropTo.y, { steps: 5 });
      await editor.mouse.up();
      await expect(editor.locator("#capture-window")).not.toHaveAttribute("data-crop");
      await editor.keyboard.press("Enter");
      await expect(editor.locator("#capture-window")).toHaveAttribute("data-crop", /\d+/);
      await editor.getByRole("button", { name: "Clear", exact: true }).click();
      await expect(editor.locator("#capture-window")).not.toHaveAttribute("data-crop");

      // Batch handoff: four shares are saved by now - the sidebar-overflow
      // one, the cropped one, and one each from the PNG and JPEG Claude Code
      // exports, which now record what they handed over. Ticking two of them
      // writes those PNGs plus a single batch.json into one folder, and copies
      // a prompt that leads with it.
      await editor.getByRole("button", { name: "Show" }).click();
      const checkboxes = editor.getByRole("checkbox");
      await expect(checkboxes).toHaveCount(4);
      // Target size (WCAG 2.5.8): the label wrapping each checkbox is the
      // real tappable area, at least 24x24 - not the ~13px native tick.
      for (const box of await checkboxes.evaluateAll((inputs) =>
        inputs.map((input) => {
          const rect = (input.closest("label") ?? input).getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        })
      )) {
        expect(box.width).toBeGreaterThanOrEqual(24);
        expect(box.height).toBeGreaterThanOrEqual(24);
      }
      // Wrapped so a mid-batch failure cannot leave the saved-shares
      // selection ticked for whatever runs next.
      try {
        await checkboxes.nth(0).check();
        await checkboxes.nth(1).check();

        await editor.getByRole("button", { name: "Copy batch for Claude Code (2)" }).click();
        await expect(editor.locator('[aria-live="polite"] p.font-medium')).toContainText(
          "Copied a Claude Code prompt for 2 saved captures"
        );

        const batchPrompt = await readClipboard(editor);
        const batchLines = batchPrompt.split("\n");
        const batchFile = await downloadedFile("application/json");
        expect(batchLines[0]).toBe("Review these 2 screenshots together.");
        // The JSON leads, before any capture is listed.
        expect(batchLines[1]).toBe(
          `Machine-readable annotations for every capture (selectors, rects, environment): ${batchFile}`
        );

        // One numbered line per capture, each naming a PNG that is really there.
        const batchImages = batchLines
          .filter((line) => /^\d+\. /.test(line))
          .map((line) => line.split(" - ").pop()!);
        expect(batchImages).toHaveLength(2);
        expect(new Set(batchImages).size).toBe(2);
        for (const file of batchImages) expect(existsSync(file)).toBe(true);

        const batchSidecar = JSON.parse(await readFile(batchFile, "utf8"));
        expect(batchSidecar.version).toBe(1);
        expect(batchSidecar.captures).toHaveLength(2);
        expect(batchSidecar.captures.map((c: { imagePath: string }) => c.imagePath)).toEqual([
          "cap-0.png",
          "cap-1.png"
        ]);
        for (const capture of batchSidecar.captures) {
          expect(capture.version).toBe(1);
          expect(capture.pageUrl).toBe(base + name);
        }
        // The prompt's counts come from the same sidecars, so they cannot drift.
        expect(batchLines[3]).toContain(
          `${batchSidecar.captures[0].annotations.length} annotation`
        );
      } finally {
        // Untick both so no later test inherits a selection.
        await checkboxes.nth(0).uncheck();
        await checkboxes.nth(1).uncheck();
        await editor.getByRole("button", { name: "Hide" }).click();
      }
    }

    await editor.close();
    await page.close();
  });
}

/**
 * How much fine detail a region of an image holds: the mean luminance step
 * between horizontally adjacent pixels. That is exactly what pixelation
 * destroys - inside a block every pixel is identical, so only the block seams
 * contribute - which makes it the honest measure of "the text is gone",
 * unlike plain variance, which survives as the spread between block averages.
 *
 * Takes an `<img>` or a `<canvas>`: the export and the saved share are images,
 * the editor's live redaction overlay is a canvas, and both must be measured
 * the same way for "what you see is what is burned in" to mean anything.
 */
function pixelDetail(
  image: Locator,
  region: { x: number; y: number; width: number; height: number }
): Promise<number> {
  return image.evaluate((el, rect) => {
    const source = el as HTMLImageElement | HTMLCanvasElement;
    const canvas = document.createElement("canvas");
    canvas.width = "naturalWidth" in source ? source.naturalWidth : source.width;
    canvas.height = "naturalHeight" in source ? source.naturalHeight : source.height;
    const c = canvas.getContext("2d")!;
    c.drawImage(source, 0, 0);
    const { data } = c.getImageData(rect.x, rect.y, rect.width, rect.height);
    const luma = (i: number) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

    let total = 0;
    let pairs = 0;
    for (let y = 0; y < rect.height; y += 1) {
      for (let x = 0; x + 1 < rect.width; x += 1) {
        const i = (y * rect.width + x) * 4;
        total += Math.abs(luma(i + 4) - luma(i));
        pairs += 1;
      }
    }
    return total / pairs;
  }, region);
}

/**
 * Mean absolute luminance difference between the same region of two images (or
 * canvases). Zero means the two are showing identical pixels there - which is
 * the only honest way to state "the editor's preview IS the export".
 */
async function regionDelta(
  a: Locator,
  aRegion: { x: number; y: number; width: number; height: number },
  b: Locator,
  bRegion: { x: number; y: number; width: number; height: number }
): Promise<number> {
  const read = (locator: Locator, rect: typeof aRegion): Promise<number[]> =>
    locator.evaluate((el, r) => {
      const source = el as HTMLImageElement | HTMLCanvasElement;
      const canvas = document.createElement("canvas");
      canvas.width = "naturalWidth" in source ? source.naturalWidth : source.width;
      canvas.height = "naturalHeight" in source ? source.naturalHeight : source.height;
      const c = canvas.getContext("2d")!;
      c.drawImage(source, 0, 0);
      const { data } = c.getImageData(r.x, r.y, r.width, r.height);
      const out: number[] = [];
      for (let i = 0; i < data.length; i += 4) {
        out.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      }
      return out;
    }, rect);

  const [left, right] = await Promise.all([read(a, aRegion), read(b, bRegion)]);
  expect(left).toHaveLength(right.length);
  let total = 0;
  for (let i = 0; i < left.length; i += 1) total += Math.abs(left[i] - right[i]);
  return total / left.length;
}

/**
 * The alpha of one pixel of the live redaction overlay, in image px. 255 means
 * the overlay is painting there (the capture underneath is hidden), 0 means it
 * is not - which is the whole of "Alt reveals the original".
 */
function overlayAlpha(overlay: Locator, x: number, y: number): Promise<number> {
  return overlay.evaluate(
    (el, point) => {
      const c = (el as HTMLCanvasElement).getContext("2d")!;
      return c.getImageData(point.x, point.y, 1, 1).data[3];
    },
    { x, y }
  );
}

test("a redaction is pixelated in the export and in the saved share", async () => {
  const page = await ctx.newPage();
  await page.goto(base + "smooth", { waitUntil: "load" });
  const { tabId, windowId } = await sw.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url });
    return { tabId: tab.id, windowId: tab.windowId };
  }, base + "smooth");

  const editor = await ctx.newPage();
  await editor.goto(
    `chrome-extension://${extId}/editor.html?tabId=${tabId}&windowId=${windowId}&autocapture=1`
  );
  const img = editor.locator("img[src^='data:image/png']");
  await expect(img).toHaveJSProperty("complete", true, { timeout: 30_000 });
  await editor.setViewportSize({ width: 1280, height: 900 });

  // The fixture's CTA sits at 200,120 and is 200x120. `sample` is its label,
  // which the redaction below covers; `control` is the button's own left edge
  // against the colour block behind it, 15px clear of the redaction. Both hold
  // real detail, and only the first is allowed to lose it - otherwise
  // "detail collapsed" would also pass for a blank or corrupted export.
  const sample = { x: 245, y: 165, width: 110, height: 30 };
  const control = { x: 185, y: 130, width: 35, height: 100 };
  const before = await pixelDetail(img, sample);
  const controlBefore = await pixelDetail(img, control);
  expect(before).toBeGreaterThan(5);
  expect(controlBefore).toBeGreaterThan(2);

  const natural = await img.evaluate((el) => (el as HTMLImageElement).naturalWidth);
  const shown = (await img.boundingBox())!;
  const k = shown.width / natural;
  const onScreen = (px: number, py: number) => ({ x: shown.x + px * k, y: shown.y + py * k });

  // Select first, and no switch back: picking Redact must put the canvas into
  // draw mode by itself, the way picking Crop does.
  await pickTool(editor, "Select");
  await pickTool(editor, "Redact");

  const from = onScreen(235, 155);
  const to = onScreen(365, 210);
  await editor.mouse.move(from.x, from.y);
  await editor.mouse.down();
  await editor.mouse.move(to.x, to.y, { steps: 5 });
  await editor.mouse.up();
  await editor.keyboard.press("Escape");

  // Drawn, and mute: one region on the canvas, no timeline row, no pin.
  await expect(editor.locator("svg rect[stroke='#ef4444']")).toHaveCount(1);
  await expect(editor.locator("ol li")).toHaveCount(0);
  // The sidebar counts them apart from the notes, and says where they land.
  await expect(editor.getByText("0 notes")).toBeVisible();
  await expect(editor.getByText("1 redacted region (pixelated here,")).toBeVisible();

  // ...and the canvas shows the pixels actually gone, not a hatch promising
  // they will be: the overlay paints the region, its detail has collapsed the
  // same way the export's does, and it stops at the region's edge.
  const overlay = editor.locator("#redaction-overlay");
  await expect.poll(() => overlayAlpha(overlay, sample.x + 10, sample.y + 10)).toBe(255);
  expect(await overlayAlpha(overlay, control.x + 5, control.y + 5)).toBe(0);
  const onCanvas = await pixelDetail(overlay, sample);
  expect(onCanvas).toBeGreaterThan(0);
  expect(onCanvas).toBeLessThan(before / 4);

  // Holding Alt over the selected region shows what is under it, and letting
  // go covers it again - a check before the file is written, not a hole.
  await pickTool(editor, "Select");
  await editor.mouse.click(onScreen(300, 182).x, onScreen(300, 182).y);
  await editor.keyboard.down("Alt");
  await expect.poll(() => overlayAlpha(overlay, sample.x + 10, sample.y + 10)).toBe(0);
  await editor.keyboard.up("Alt");
  await expect.poll(() => overlayAlpha(overlay, sample.x + 10, sample.y + 10)).toBe(255);
  await editor.keyboard.press("Escape");

  // The prompt counts it and says nothing else about it - no numbered line, no
  // tool tag, and no element name read from under it.
  await copyCloudPrompt(editor);
  const prompt = await readClipboard(editor);
  expect(prompt).toContain("Redacted regions: 1");
  expect(prompt).not.toContain("[redact]");
  expect(prompt).not.toContain("button.cta");
  expect(prompt.split("\n").filter((line) => /^\d+\. /.test(line))).toEqual([]);

  // The saved share carries the pixelated image, not the capture: this is the
  // only copy of the annotated capture that outlives the editor tab.
  await editor.getByRole("button", { name: "Copy Local Share Link" }).click();
  await expect(editor.locator('[aria-live="polite"] p.font-medium')).toContainText(
    "Local share link generated"
  );
  const shareHref = (await editor.locator("a[href*='viewer.html']").getAttribute("href"))!;
  const viewer = await ctx.newPage();
  await viewer.goto(shareHref);
  const shared = viewer.locator("img[alt='Annotated share']");
  await expect(shared).toHaveJSProperty("complete", true, { timeout: 15_000 });
  const after = await pixelDetail(shared, sample);
  expect(after).toBeLessThan(before / 4);
  // ...and the damage stopped at the region's edge: everything else in the
  // share still carries the detail it was captured with.
  expect(await pixelDetail(shared, control)).toBeGreaterThan(controlBefore * 0.7);

  // The preview must not merely *look* pixelated - it has to be the export.
  // A crop whose left edge cuts through the redaction is where that stops
  // being free: the export clips the region and blocks it from the crop's own
  // edge, so a preview that blocked the whole region off the untouched capture
  // would land a different grid. Compare the two, pixel for pixel.
  await pickTool(editor, "Crop");
  await editor.mouse.move(onScreen(241, 120).x, onScreen(241, 120).y);
  await editor.mouse.down();
  await editor.mouse.move(onScreen(700, 400).x, onScreen(700, 400).y, { steps: 5 });
  await editor.mouse.up();
  await editor.keyboard.press("Enter");
  await expect(editor.locator("#capture-window")).toHaveAttribute("data-crop", /\d+/);

  const crop = await appliedCrop(editor);
  // The crop really does cut the region (235..365) rather than clear it.
  expect(crop.x).toBeGreaterThan(235);
  expect(crop.x).toBeLessThan(261);

  await editor.getByRole("button", { name: "Copy Local Share Link" }).click();
  await expect(editor.locator('[aria-live="polite"] p.font-medium')).toContainText(
    "Local share link generated"
  );
  const croppedHref = (await editor.locator("a[href*='viewer.html']").getAttribute("href"))!;
  const croppedViewer = await ctx.newPage();
  await croppedViewer.goto(croppedHref);
  const croppedShare = croppedViewer.locator("img[alt='Annotated share']");
  await expect(croppedShare).toHaveJSProperty("complete", true, { timeout: 15_000 });

  // A window wholly inside the clipped redaction, addressed in image px on the
  // canvas and in crop px in the export - the same pixels, two coordinate
  // systems. Identical blocks mean identical `drawImage` calls upstream.
  const window = { x: crop.x + 4, y: 165, width: 100, height: 30 };
  const delta = await regionDelta(overlay, window, croppedShare, {
    x: window.x - crop.x,
    y: window.y - crop.y,
    width: window.width,
    height: window.height
  });
  expect(delta).toBeLessThan(1);

  await croppedViewer.close();
  await viewer.close();
  await editor.close();
  await page.close();
});

test("editing is frozen while an export is in flight", async () => {
  const page = await ctx.newPage();
  await page.goto(base + "smooth", { waitUntil: "load" });
  const { tabId, windowId } = await sw.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url });
    return { tabId: tab.id, windowId: tab.windowId };
  }, base + "smooth");

  const editor = await ctx.newPage();
  await editor.goto(
    `chrome-extension://${extId}/editor.html?tabId=${tabId}&windowId=${windowId}&autocapture=1`
  );
  const img = editor.locator("img[src^='data:image/png']");
  await expect(img).toHaveJSProperty("complete", true, { timeout: 30_000 });
  await editor.setViewportSize({ width: 1280, height: 900 });

  const natural = await img.evaluate((el) => (el as HTMLImageElement).naturalWidth);
  const shown = (await img.boundingBox())!;
  const k = shown.width / natural;
  const onScreen = (px: number, py: number) => ({ x: shown.x + px * k, y: shown.y + py * k });
  const drawRedaction = async (): Promise<void> => {
    const from = onScreen(235, 155);
    const to = onScreen(365, 210);
    await editor.mouse.move(from.x, from.y);
    await editor.mouse.down();
    await editor.mouse.move(to.x, to.y, { steps: 5 });
    await editor.mouse.up();
  };
  const regions = editor.locator("svg rect[stroke='#ef4444']");
  const redactSegment = editor.getByRole("button", { name: "Redact", exact: true });

  /**
   * Hold Copy Image open on its last await, so the export is genuinely in
   * flight for as long as this test wants it to be. Every output snapshots
   * `exportView(state)` synchronously and then awaits the render, so anything
   * drawn after that point reaches no artifact the run produces - and for a
   * redaction that means a region the user watched go grey missing from the
   * file the success toast is about to announce.
   */
  await editor.evaluate(() => {
    const clipboard = navigator.clipboard;
    const original = clipboard.write.bind(clipboard);
    (window as unknown as { release?: () => void }).release = undefined;
    clipboard.write = (items: ClipboardItem[]): Promise<void> =>
      new Promise<void>((resolve, reject) => {
        (window as unknown as { release?: () => void }).release = () => {
          original(items).then(resolve, reject);
        };
      });
  });

  await pickTool(editor, "Redact");
  await editor.getByRole("button", { name: "Copy Image" }).click();
  await expect(redactSegment).toBeDisabled();

  // The pointer is the half that matters: a disabled palette still leaves the
  // canvas underneath it, and that is where the region would have been drawn.
  await drawRedaction();
  await expect(regions).toHaveCount(0);
  // The hotkeys are no way around it either.
  await editor.keyboard.press("r");
  await drawRedaction();
  await expect(regions).toHaveCount(0);

  await editor.evaluate(() => (window as unknown as { release: () => void }).release());
  await expect(editor.locator('[aria-live="polite"] p.font-medium')).toContainText(
    "Annotated image copied"
  );
  await expect(redactSegment).toBeEnabled();

  // ...and it is a freeze, not a break: the very same drag lands once the
  // export that could not have carried it is done.
  await drawRedaction();
  await expect(regions).toHaveCount(1);

  await editor.close();
  await page.close();
});

test("re-capture links the new share to the one it follows", async () => {
  const page = await ctx.newPage();
  await page.goto(base + "smooth", { waitUntil: "load" });
  const { tabId, windowId } = await sw.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url });
    return { tabId: tab.id, windowId: tab.windowId };
  }, base + "smooth");

  const editor = await ctx.newPage();
  await editor.goto(
    `chrome-extension://${extId}/editor.html?tabId=${tabId}&windowId=${windowId}&autocapture=1`
  );
  await expect(editor.locator("img[src^='data:image/png']")).toHaveJSProperty("complete", true, {
    timeout: 30_000
  });
  await editor.setViewportSize({ width: 1280, height: 900 });

  // Share A: the "before" capture.
  await editor.getByRole("button", { name: "Copy Local Share Link" }).click();
  await expect(editor.locator('[aria-live="polite"] p.font-medium')).toContainText(
    "Local share link generated"
  );
  const shareA = new URL(
    (await editor.locator("a[href*='viewer.html']").getAttribute("href"))!
  ).searchParams.get("share")!;

  // Re-capture the newest saved share (the list is sorted newest first, so
  // shares left behind by earlier tests sit below it).
  await editor.getByRole("button", { name: "Show" }).click();
  const opened: Page[] = [];
  const collect = (opening: Page): void => {
    opened.push(opening);
  };
  ctx.on("page", collect);
  await editor.getByRole("button", { name: "Re-capture" }).first().click();
  // Two tabs: the page itself, then a second editor pointed at it.
  await expect.poll(() => opened.length, { timeout: 30_000 }).toBe(2);
  ctx.off("page", collect);

  const recaptured = opened.find((tab) => tab.url().includes("editor.html"))!;
  expect(recaptured).toBeTruthy();
  expect(new URL(recaptured.url()).searchParams.get("previousShareId")).toBe(shareA);
  expect(opened.some((tab) => tab.url() === base + "smooth")).toBe(true);

  // Share B: the "after" capture, saved from the re-capture editor.
  await expect(recaptured.locator("img[src^='data:image/png']")).toHaveJSProperty(
    "complete",
    true,
    { timeout: 30_000 }
  );
  await recaptured.setViewportSize({ width: 1280, height: 900 });
  await recaptured.getByRole("button", { name: "Copy Local Share Link" }).click();
  await expect(recaptured.locator('[aria-live="polite"] p.font-medium')).toContainText(
    "Local share link generated"
  );
  const shareHrefB = (await recaptured.locator("a[href*='viewer.html']").getAttribute("href"))!;
  const shareB = new URL(shareHrefB).searchParams.get("share")!;

  // The stored record, read straight out of chrome.storage.local, carries the
  // link - not just the URL the editor was opened with.
  const stored = await sw.evaluate(async (id) => {
    const key = `share:${id}`;
    const items = await chrome.storage.local.get([key]);
    return items[key] as { previousShareId?: string };
  }, shareB);
  expect(stored.previousShareId).toBe(shareA);

  // The viewer puts the two captures side by side.
  const viewer = await ctx.newPage();
  await viewer.goto(shareHrefB);
  const images = viewer.locator("img[src^='data:image/png']");
  await expect(images).toHaveCount(2, { timeout: 15_000 });
  await expect(images.first()).toHaveJSProperty("complete", true, { timeout: 15_000 });
  await expect(viewer.getByText("Before", { exact: true })).toBeVisible();
  await expect(viewer.getByText("After", { exact: true })).toBeVisible();

  // A predecessor that has since been deleted degrades to the new capture on
  // its own, with a note saying why there is nothing to compare against.
  await sw.evaluate((id) => chrome.storage.local.remove(`share:${id}`), shareA);
  await viewer.reload();
  await expect(viewer.getByText("no longer stored")).toBeVisible();
  await expect(images).toHaveCount(1);

  await viewer.close();
  // Every tab this test opened, so later tests inherit no extra pages.
  for (const tab of opened) await tab.close();
  await editor.close();
  await page.close();
});

test("the tool palette keeps a drawing tool active, and its hotkeys stay off the comment box", async () => {
  const page = await ctx.newPage();
  await page.goto(base + "smooth", { waitUntil: "load" });
  const { tabId, windowId } = await sw.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url });
    return { tabId: tab.id, windowId: tab.windowId };
  }, base + "smooth");

  const editor = await ctx.newPage();
  await editor.goto(
    `chrome-extension://${extId}/editor.html?tabId=${tabId}&windowId=${windowId}&autocapture=1`
  );
  const img = editor.locator("img[src^='data:image/png']");
  await expect(img).toHaveJSProperty("complete", true, { timeout: 30_000 });
  await editor.setViewportSize({ width: 1280, height: 900 });

  const shown = (await img.boundingBox())!;
  const at = (x: number, y: number) => ({ x: shown.x + x, y: shown.y + y });
  const drag = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
    await editor.mouse.move(from.x, from.y);
    await editor.mouse.down();
    await editor.mouse.move(to.x, to.y, { steps: 5 });
    await editor.mouse.up();
  };
  const boxes = editor.locator("#capture-viewport svg > g");
  const rows = editor.locator("ol li");

  // The palette is eight segments wide now. It must wrap rather than widen the
  // canvas pane: a toolbar that refuses to shrink used to grow the grid's
  // `1fr` column past the window and clip the capture inside it.
  const layout = await editor.evaluate(() => ({
    pageWidth: document.scrollingElement!.scrollWidth,
    windowWidth: window.innerWidth,
    viewportRight: document.querySelector("#capture-viewport")!.getBoundingClientRect().right
  }));
  expect(layout.pageWidth).toBeLessThanOrEqual(layout.windowWidth);
  expect(layout.viewportRight).toBeLessThanOrEqual(layout.windowWidth);

  // A fresh editor opens on Box, in draw mode.
  expect(await toolIsActive(editor, "Box")).toBe(true);
  expect(await toolIsActive(editor, "Select")).toBe(false);

  // A swatch sets the colour the *next* annotation is drawn in.
  await editor.getByRole("button", { name: "Blue annotation color" }).click();

  // The heart of the palette: press B, then draw two boxes back to back with
  // no click, no keypress and no mode switch between them. Committing one used
  // to flip the canvas into move mode, which made the second drag a no-op.
  await editor.keyboard.press("b");
  await drag(at(40, 40), at(160, 130));
  await expect(rows).toHaveCount(1);
  expect(await toolIsActive(editor, "Box")).toBe(true);

  await drag(at(320, 40), at(450, 130));
  await expect(rows).toHaveCount(2);
  expect(await toolIsActive(editor, "Box")).toBe(true);

  // Both carry the swatch's colour, not the default red.
  await expect(boxes.nth(0).locator("rect").first()).toHaveAttribute("stroke", "#3b82f6");
  await expect(boxes.nth(1).locator("rect").first()).toHaveAttribute("stroke", "#3b82f6");

  // The inline comment editor still opens and focuses on commit, so a note can
  // be typed straight after the drag - and every tool letter typed into it is
  // a letter, not a shortcut.
  const note = editor.locator("foreignObject textarea");
  await expect(note).toHaveCount(1);
  await editor.keyboard.type("vbathprc");
  await expect(note).toHaveValue("vbathprc");
  expect(await toolIsActive(editor, "Box")).toBe(true);

  // ...and so is a listbox's typeahead. `Select` is a WAI-ARIA listbox built
  // on a button, not a form field, so the isTyping guard alone does not cover
  // it: typing "a" to reach "Actual size" in Zoom must not pick the Arrow tool.
  await editor.getByRole("combobox", { name: "Zoom" }).click();
  await editor.keyboard.press("a");
  expect(await toolIsActive(editor, "Box")).toBe(true);
  expect(await toolIsActive(editor, "Arrow")).toBe(false);
  // The guard covers the *whole* keymap, not just the tool letters. `Select`
  // calls preventDefault but never stopPropagation, so every keystroke aimed
  // at an open list still reaches the canvas's window listener - and Backspace
  // on a focused listbox is a "go back" reflex, which used to delete the
  // selected annotation instead.
  await editor.keyboard.press("Backspace");
  await expect(rows).toHaveCount(2);
  // Escape closes the list and returns focus to the combobox button, which is
  // still inside the listbox guard - so hand focus back to the page before the
  // keyboard checks below.
  await editor.keyboard.press("Escape");
  await editor.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

  // V is the old Move Existing mode: it selects an existing annotation on
  // click rather than drawing over it.
  await editor.keyboard.press("Escape");
  await editor.keyboard.press("v");
  expect(await toolIsActive(editor, "Select")).toBe(true);
  expect(await toolIsActive(editor, "Box")).toBe(false);

  await editor.mouse.click(at(100, 85).x, at(100, 85).y);
  await expect(rows).toHaveCount(2);
  await expect(note).toHaveCount(1);
  // The first box is the selected one: the canvas draws a selected box thicker.
  await expect(boxes.nth(0).locator("rect").first()).toHaveAttribute("stroke-width", "4");

  // A swatch picked now changes the next annotation, and leaves the drawn ones
  // alone.
  await editor.keyboard.press("Escape");
  await editor.keyboard.press("b");
  await editor.getByRole("button", { name: "Red annotation color" }).click();
  await drag(at(40, 260), at(160, 350));
  await expect(rows).toHaveCount(3);
  await expect(boxes.nth(2).locator("rect").first()).toHaveAttribute("stroke", "#ef4444");
  await expect(boxes.nth(0).locator("rect").first()).toHaveAttribute("stroke", "#3b82f6");

  // A crop marquee is the other thing those keys reach. Escape aimed at an
  // open Zoom list closes the list and used to silently discard the marquee
  // with it; Enter picked the highlighted option and applied the crop in the
  // same keystroke. The marquee has to survive both.
  await editor.keyboard.press("Escape");
  await editor.keyboard.press("c");
  await drag(at(60, 60), at(300, 260));
  const marquee = editor.locator("#crop-region");
  await expect(marquee).toHaveCount(1);

  await editor.getByRole("combobox", { name: "Zoom" }).click();
  await editor.keyboard.press("Escape");
  await expect(marquee).toHaveCount(1);

  await editor.getByRole("combobox", { name: "Zoom" }).click();
  await editor.keyboard.press("Enter");
  await expect(marquee).toHaveCount(1);

  await editor.close();
  await page.close();
});

test("visible-area mode captures one viewport, not the whole page", async () => {
  const page = await ctx.newPage();
  await page.goto(base + "smooth", { waitUntil: "load" });
  const viewportHeight = await page.evaluate(() => window.innerHeight);
  const { tabId, windowId } = await sw.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url });
    return { tabId: tab.id, windowId: tab.windowId };
  }, base + "smooth");

  // No `autocapture`: the mode has to be picked before the capture runs, which
  // is exactly the path the chooser exists for.
  const editor = await ctx.newPage();
  await editor.goto(`chrome-extension://${extId}/editor.html?tabId=${tabId}&windowId=${windowId}`);
  await pickMode(editor, "Visible area");
  await editor.getByRole("button", { name: "Capture Page" }).click();

  const img = editor.locator("img[src^='data:image/png']");
  await expect(img).toHaveJSProperty("complete", true, { timeout: 30_000 });
  const height = await img.evaluate((el) => (el as HTMLImageElement).naturalHeight);

  // The fixture is 2400px of colour blocks; visible mode must stop at the one
  // viewport that is on screen.
  expect(height).toBe(viewportHeight);
  expect(height).toBeLessThan(8 * 300);

  await editor.close();
  await page.close();
});

test("the delayed mode counts down in the on-page notice before it captures", async () => {
  const page = await ctx.newPage();
  await page.goto(base + "smooth", { waitUntil: "load" });
  const { tabId, windowId } = await sw.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url });
    return { tabId: tab.id, windowId: tab.windowId };
  }, base + "smooth");

  const editor = await ctx.newPage();
  await editor.goto(`chrome-extension://${extId}/editor.html?tabId=${tabId}&windowId=${windowId}`);
  await pickMode(editor, "Full page after 3s");
  await editor.getByRole("button", { name: "Capture Page" }).click();

  // The countdown runs on the *target* tab, for three seconds, so poll it
  // there rather than trying to catch one frame of it. The 3s is the real UI
  // value: there is no injectable shorter delay, and one three-second wait in
  // the suite is cheaper than a test hook that proves something else.
  await expect
    .poll(() => noticeText(page), { timeout: 5_000, intervals: [100] })
    .toMatch(/Capturing in [123]\.\.\./);

  // ...and once the countdown is done the notice says what is happening NOW.
  // Without an explicit heading on the post-countdown begin, "Capturing in
  // 1..." stayed on the page for the whole stitch.
  await expect
    .poll(() => noticeText(page), { timeout: 10_000, intervals: [100] })
    .toContain("Capturing full page");

  // ...and it still produces the full page.
  const img = editor.locator("img[src^='data:image/png']");
  await expect(img).toHaveJSProperty("complete", true, { timeout: 30_000 });
  expect(await img.evaluate((el) => (el as HTMLImageElement).naturalHeight)).toBe(8 * 300);
  // The notice is taken down with the capture, countdown or not.
  await expect
    .poll(() => page.evaluate(() => !document.querySelector("[data-shotback-overlay]")), {
      timeout: 10_000
    })
    .toBe(true);

  await editor.close();
  await page.close();
});

test("a visible-area capture inspects the element really under the annotation", async () => {
  const page = await ctx.newPage();
  await page.goto(base + "scrolled", { waitUntil: "load" });
  // The whole point: capture from somewhere other than the top of the page.
  await page.evaluate((by) => window.scrollTo(0, by), SCROLLED_BY);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(SCROLLED_BY);

  const { tabId, windowId } = await sw.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url });
    return { tabId: tab.id, windowId: tab.windowId };
  }, base + "scrolled");

  const editor = await ctx.newPage();
  await editor.goto(`chrome-extension://${extId}/editor.html?tabId=${tabId}&windowId=${windowId}`);
  await pickMode(editor, "Visible area");
  await editor.getByRole("button", { name: "Capture Page" }).click();

  const img = editor.locator("img[src^='data:image/png']");
  await expect(img).toHaveJSProperty("complete", true, { timeout: 30_000 });
  await editor.setViewportSize({ width: 1280, height: 900 });

  // Where the CTA sits in the ONE captured frame: its page position minus the
  // scroll the capture started from.
  const ctaTop = SCROLLED_CTA_TOP - SCROLLED_BY;
  const natural = await img.evaluate((el) => (el as HTMLImageElement).naturalWidth);
  const shown = (await img.boundingBox())!;
  const k = shown.width / natural;
  const at = (x: number, y: number) => ({ x: shown.x + x * k, y: shown.y + y * k });

  const before = await inspectGen(editor);
  await pickTool(editor, "Box");
  await editor.mouse.move(at(250, ctaTop + 30).x, at(250, ctaTop + 30).y);
  await editor.mouse.down();
  await editor.mouse.move(at(350, ctaTop + 90).x, at(350, ctaTop + 90).y, { steps: 5 });
  await editor.mouse.up();
  await editor.keyboard.press("Escape");
  await waitForInspection(editor, before);

  await copyCloudPrompt(editor);
  const prompt = await readClipboard(editor);
  // Without the capture's own scroll offset this reads the element ~1200px
  // higher up the page - a colour block - and puts that selector in the prompt.
  expect(prompt).toContain("#app > section.hero > button.cta");

  await editor.close();
  await page.close();
});

test("an editor closed mid-countdown does not strand the notice on the page", async () => {
  const page = await ctx.newPage();
  await page.goto(base + "smooth", { waitUntil: "load" });
  const { tabId, windowId } = await sw.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url });
    return { tabId: tab.id, windowId: tab.windowId };
  }, base + "smooth");

  const editor = await ctx.newPage();
  await editor.goto(`chrome-extension://${extId}/editor.html?tabId=${tabId}&windowId=${windowId}`);
  await pickMode(editor, "Full page after 3s");
  await editor.getByRole("button", { name: "Capture Page" }).click();

  // Wait until the notice is really up, then take the editor away mid-count.
  await expect
    .poll(() => noticeText(page), { timeout: 5_000, intervals: [100] })
    .toMatch(/Capturing in/);
  await editor.close();

  // Nobody is coming back, so the page has to clean itself up: the content
  // script's watchdog expires and takes the notice and the scrollbar-hiding
  // style with it. Polled well past the 8s expiry.
  await expect
    .poll(
      () =>
        page.evaluate(() => ({
          notice: !!document.querySelector("[data-shotback-overlay]"),
          scrollbarStyle: !!document.getElementById("shotback-hide-scrollbar")
        })),
      { timeout: 20_000, intervals: [500] }
    )
    .toEqual({ notice: false, scrollbarStyle: false });

  await page.close();
});

test("highlight and pen are drawn, pinned and carried into the prompt", async () => {
  const page = await ctx.newPage();
  await page.goto(base + "smooth", { waitUntil: "load" });
  const { tabId, windowId } = await sw.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url });
    return { tabId: tab.id, windowId: tab.windowId };
  }, base + "smooth");

  const editor = await ctx.newPage();
  await editor.goto(
    `chrome-extension://${extId}/editor.html?tabId=${tabId}&windowId=${windowId}&autocapture=1`
  );
  const img = editor.locator("img[src^='data:image/png']");
  await expect(img).toHaveJSProperty("complete", true, { timeout: 30_000 });
  await editor.setViewportSize({ width: 1280, height: 900 });

  const shown = (await img.boundingBox())!;
  const at = (x: number, y: number) => ({ x: shown.x + x, y: shown.y + y });

  // Highlight: a drag, like a box.
  await pickTool(editor, "Highlight");
  await editor.mouse.move(at(40, 40).x, at(40, 40).y);
  await editor.mouse.down();
  await editor.mouse.move(at(240, 80).x, at(240, 80).y, { steps: 5 });
  await editor.mouse.up();
  await editor.keyboard.type("read this");
  // Tab first, then Escape: Escape *in the note* is a discard now (see the
  // keyboard test at the end of this file), and this one is about keeping the
  // note. Tab commits it and moves focus to the timeline row; Escape from
  // there just clears the selection, so the shape draws unselected below.
  await editor.keyboard.press("Tab");
  await editor.keyboard.press("Escape");

  // Pen: a freehand path, so several moves with the button down.
  await pickTool(editor, "Pen");
  await editor.mouse.move(at(320, 200).x, at(320, 200).y);
  await editor.mouse.down();
  for (const [x, y] of [
    [360, 240],
    [400, 210],
    [440, 260],
    [480, 220]
  ]) {
    await editor.mouse.move(at(x, y).x, at(x, y).y, { steps: 4 });
  }
  await editor.mouse.up();
  await editor.keyboard.type("scribble");
  await editor.keyboard.press("Tab");
  await editor.keyboard.press("Escape");

  // Two numbered rows, two pins on the canvas.
  await expect(editor.locator("ol li")).toHaveCount(2);
  const highlightRect = editor.locator('#capture-viewport svg rect[fill-opacity="0.35"]').first();
  await expect(highlightRect).toHaveCSS("mix-blend-mode", "multiply");
  // The visible stroke, not the transparent hit area under it.
  const stroke = editor.locator('#capture-viewport svg polyline[stroke-width="3"]').first();
  const points = (await stroke.getAttribute("points")) ?? "";
  expect(points.split(" ").length).toBeGreaterThan(2);
  await expect(editor.locator("#capture-viewport svg text")).toHaveText(["1", "2"]);

  await copyCloudPrompt(editor);
  const prompt = await readClipboard(editor);
  expect(prompt).toMatch(/1\. \[highlight\] read this - at \(\d+, \d+\) size \d+x\d+ px/);
  expect(prompt).toMatch(/2\. \[pen\] scribble - pen path of \d+ points from \(\d+, \d+\) to/);

  await editor.close();
  await page.close();
});

test("destructive actions confirm in place before they take anything away", async () => {
  const page = await ctx.newPage();
  await page.goto(base + "smooth", { waitUntil: "load" });
  const { tabId, windowId } = await sw.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url });
    return { tabId: tab.id, windowId: tab.windowId };
  }, base + "smooth");

  const editor = await ctx.newPage();
  await editor.goto(
    `chrome-extension://${extId}/editor.html?tabId=${tabId}&windowId=${windowId}&autocapture=1`
  );
  const img = editor.locator("img[src^='data:image/png']");
  await expect(img).toHaveJSProperty("complete", true, { timeout: 30_000 });
  await editor.setViewportSize({ width: 1280, height: 900 });

  await boxOverCta(editor, img, 0);
  const notes = editor.locator("ol li");
  await expect(notes).toHaveCount(1);

  // A capture replaces the image every annotation is anchored to, so with work
  // on screen the button asks - in place, not through a `window.confirm` - and
  // cancelling keeps the work.
  const captureButton = editor.getByRole("button", { name: "Capture Page" });
  await captureButton.click();
  const replace = editor.getByRole("button", { name: "Replace capture?" });
  await expect(replace).toBeVisible();
  await editor.getByRole("button", { name: "Cancel" }).click();
  await expect(replace).toHaveCount(0);
  await expect(notes).toHaveCount(1);
  await expect(captureButton).toBeVisible();

  // Driven from the keyboard, the pair must hand the keyboard back. The pair
  // replaces the trigger, so confirming, cancelling or waiting out the timer
  // unmounts whatever had focus - without the restore, Escape here would drop
  // the user on `document.body` with nothing to tab from.
  const focused = (): Promise<string> =>
    editor.evaluate(() => document.activeElement?.textContent?.trim() ?? "(body)");
  await captureButton.focus();
  await editor.keyboard.press("Enter");
  await expect(replace).toBeVisible();
  expect(await focused()).toBe("Replace capture?");
  await editor.keyboard.press("Escape");
  await expect(replace).toHaveCount(0);
  expect(await focused()).toBe("Capture Page");
  await expect(notes).toHaveCount(1);

  // A saved share is the only copy of an annotated capture that outlives the
  // tab, so its Delete is two steps as well: the first click only arms the row.
  await editor.getByRole("button", { name: "Copy Local Share Link" }).click();
  await expect(editor.locator('[aria-live="polite"] p.font-medium')).toContainText(
    "Local share link generated"
  );
  // The link is on the clipboard, so the sidebar says so and offers to open it
  // rather than printing 90 unreadable characters of `chrome-extension://`.
  await expect(editor.getByText("Local share link copied")).toBeVisible();
  await expect(editor.getByRole("link", { name: "Open" })).toBeVisible();
  await expect(editor.getByText(/^chrome-extension:\/\//)).toHaveCount(0);
  // ...and it describes the clipboard, so a different export takes it with it.
  await editor.getByRole("button", { name: "Copy Image" }).click();
  await expect(editor.getByText("Local share link copied")).toHaveCount(0);

  await editor.getByRole("button", { name: "Show" }).click();
  const rows = editor.locator("section:has(> div > h2:text-is('Saved Shares')) ul > li");
  const before = await rows.count();
  expect(before).toBeGreaterThan(0);

  const deleteButton = rows.first().getByRole("button", { name: /^Delete saved share/ });
  const confirmButton = rows.first().getByRole("button", { name: /^Confirm deleting/ });
  // A double-click must not delete: the second click lands after the pair has
  // swapped in, on a button the user has had no time to read.
  await deleteButton.dblclick();
  await expect(rows).toHaveCount(before);
  await expect(confirmButton).toBeVisible();
  await editor.keyboard.press("Escape");
  await expect(confirmButton).toHaveCount(0);
  expect(await editor.evaluate(() => document.activeElement?.textContent?.trim())).toBe("Delete");

  await deleteButton.click();
  await expect(rows).toHaveCount(before);
  // Deliberately waited out: the confirm ignores activation for its first
  // quarter-second (the guard that makes the double-click above safe), and a
  // real second click arrives well after that.
  await editor.waitForTimeout(300);
  await confirmButton.click();
  await expect(rows).toHaveCount(before - 1);

  await editor.close();
  await page.close();
});

test("editor page renders the capture UI", async () => {
  const editor = await ctx.newPage();
  await editor.goto(`chrome-extension://${extId}/editor.html`, { waitUntil: "load" });
  await expect(editor.getByRole("button", { name: "Capture Page" })).toBeVisible();
  await expect(editor.getByRole("button", { name: "Copy for Claude Code" })).toBeVisible();

  // One filled button in the actions column, and it is the handoff this
  // extension exists for - everything else is a secondary. A second primary
  // would mean the column recommends two things, which is no recommendation.
  const primary = editor.locator("#editor-actions button.bg-primary");
  await expect(primary).toHaveCount(1);
  await expect(primary).toHaveText("Copy for Claude Code");
  // Format-aware: the caption must name the file the export actually writes -
  // and whose Downloads folder it lands in, since a bare "Downloads/shotback"
  // reads as a path relative to something to anyone who has not exported yet.
  await expect(
    editor.getByText(
      /^Saves (PNG|JPEG) \+ JSON to your Downloads folder \(Downloads\/shotback\), copies the prompt and keeps a copy in Saved Shares\.$/
    )
  ).toBeVisible();
  // The order the column reads in: edit, then send, then take the file.
  // The download's format suffix is a persisted pref, so it is normalised out.
  const labels = await editor.locator("#editor-actions button").allInnerTexts();
  expect(labels.map((label) => label.replace(/ \((PNG|JPEG)\)$/, ""))).toEqual([
    "Undo",
    "Redo",
    "Delete Selected Item",
    "Copy for Claude Code",
    "Prepare for Cloud LLM",
    "Copy Local Share Link",
    "Download Image",
    "Copy Image"
  ]);

  // With no capture there is nothing for a tool or a swatch to act on, so the
  // palette says so rather than offering inert controls - and the hotkeys must
  // not be a way around that.
  await expect(editor.getByRole("button", { name: "Box", exact: true })).toBeDisabled();
  await expect(editor.getByRole("button", { name: "Red annotation color" })).toBeDisabled();
  await editor.keyboard.press("r");
  expect(await toolIsActive(editor, "Box")).toBe(true);
  // Zoom is a property of the view, not of a gesture, so it stays live.
  await expect(editor.getByRole("combobox", { name: "Zoom" })).toBeEnabled();

  await editor.close();
});

test("dark theme keeps every control legible", async () => {
  const editor = await ctx.newPage();
  await editor.emulateMedia({ colorScheme: "dark" });
  await editor.goto(`chrome-extension://${extId}/editor.html`, { waitUntil: "load" });
  const unreadable = await editor.evaluate(() => {
    const lum = (rgb: string): number => {
      const [r, g, b] = rgb
        .match(/\d+/g)!
        .map(Number)
        .map((v) => v / 255);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const bad: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("button, p, span, h1, h2, label")) {
      if (!el.textContent?.trim()) continue;
      const s = getComputedStyle(el);
      // walk up to the first painted background
      let bg = s.backgroundColor;
      let node: HTMLElement | null = el;
      while (node && (bg === "rgba(0, 0, 0, 0)" || bg === "transparent")) {
        node = node.parentElement;
        if (node) bg = getComputedStyle(node).backgroundColor;
      }
      if (Math.abs(lum(s.color) - lum(bg)) < 0.3)
        bad.push(`${el.tagName}:${el.textContent.trim().slice(0, 24)}`);
    }
    return bad;
  });
  expect(unreadable).toEqual([]);
  expect(await editor.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe(
    "rgb(248, 250, 252)"
  );
  await editor.close();
});

test("reduced motion drops the button press/colour animation, not the state change", async () => {
  const editor = await ctx.newPage();
  await editor.emulateMedia({ reducedMotion: "reduce" });
  await editor.goto(`chrome-extension://${extId}/editor.html`, { waitUntil: "load" });

  const button = editor.getByRole("button", { name: "Capture Page" });
  const style = await button.evaluate((el) => {
    const s = getComputedStyle(el);
    return { transitionDuration: s.transitionDuration, transitionProperty: s.transitionProperty };
  });
  // The colour/box-shadow transition collapses to instant rather than
  // disappearing - the hover/focus/disabled state itself still applies.
  expect(style.transitionDuration).toBe("0s");

  const chevronDuration = await editor
    .getByRole("combobox", { name: "Zoom" })
    .locator("svg")
    .evaluate((el) => getComputedStyle(el).transitionProperty);
  // The select chevron's rotation animation is removed outright.
  expect(chevronDuration).toBe("none");

  await editor.close();
});

test("the canvas draws, nudges and recovers from the keyboard alone", async () => {
  const page = await ctx.newPage();
  await page.goto(base + "smooth", { waitUntil: "load" });
  const { tabId, windowId } = await sw.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url });
    return { tabId: tab.id, windowId: tab.windowId };
  }, base + "smooth");

  const editor = await ctx.newPage();
  await editor.goto(
    `chrome-extension://${extId}/editor.html?tabId=${tabId}&windowId=${windowId}&autocapture=1`
  );
  const img = editor.locator("img[src^='data:image/png']");
  await expect(img).toHaveJSProperty("complete", true, { timeout: 30_000 });
  await editor.setViewportSize({ width: 1280, height: 900 });

  const canvas = editor.locator("#capture-viewport svg");
  const rows = editor.locator("ol li");
  const note = editor.locator("foreignObject textarea");
  const box = editor.locator("#capture-viewport svg > g").first().locator("rect").first();
  const focused = (): Promise<string> =>
    editor.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return "body";
      return el.getAttribute("data-annotation-row") ? "timeline-row" : el.tagName.toLowerCase();
    });

  // The canvas is in the tab order now: it is where the keyboard draws, and
  // its accessible name says so instead of admitting a pointer is required.
  await expect(canvas).toHaveAttribute("tabindex", "0");
  await expect(canvas).toHaveAttribute("aria-label", /Enter places a shape/);

  // Enter with the Box tool armed places one at the centre of the view, and
  // goes through the same commit a drag does: selected, comment editor open.
  expect(await toolIsActive(editor, "Box")).toBe(true);
  await canvas.focus();
  await editor.keyboard.press("Enter");
  await expect(rows).toHaveCount(1);
  const placed = await rectOf(box);
  expect(placed.width).toBe(160);
  expect(placed.height).toBe(100);
  await expect(note).toHaveCount(1);

  // The comment editor is a <textarea> inside this same SVG, so the canvas's
  // own keys must not reach it: Enter is a newline, not a second annotation,
  // and an arrow key moves the caret, not the shape.
  await editor.keyboard.type("first line");
  const beforeTyping = await rectOf(box);
  await editor.keyboard.press("Enter");
  await editor.keyboard.type("second line");
  await expect(note).toHaveValue("first line\nsecond line");
  await expect(rows).toHaveCount(1);
  await editor.keyboard.press("ArrowLeft");
  await editor.keyboard.press("Shift+ArrowUp");
  expect(await rectOf(box)).toEqual(beforeTyping);

  // Escape in the note discards the draft instead of shipping it - the one
  // place in the editor where Escape used to mean "commit" - and hands the
  // keyboard back to the canvas rather than dropping it on <body>.
  await editor.keyboard.press("Escape");
  await expect(rows.first()).toContainText("(no comment)");
  expect(await focused()).toBe("svg");

  // ...with the annotation still selected, so the very next arrow key moves
  // the shape that was just drawn. Deliberately no programmatic focus and no
  // second annotation here: this is the whole Enter -> type -> Escape -> nudge
  // run a keyboard user actually performs.
  await editor.keyboard.press("ArrowRight");
  await expect.poll(async () => (await rectOf(box)).x).toBe(beforeTyping.x + 8);
  await expect(rows).toHaveCount(1);
  await editor.keyboard.press("Control+z");
  await expect.poll(async () => (await rectOf(box)).x).toBe(beforeTyping.x);

  // The keyboard focus ring is on the scrollport, not on the SVG's own edges:
  // the SVG is as tall as the capture, so a ring drawn on it is off screen on
  // anything taller than the pane (measured: box -775..1625 against a
  // 124..863 scrollport, and no indicator visible anywhere).
  await expect(editor.locator("#capture-viewport")).toHaveCSS(
    "box-shadow",
    /inset|0px 0px 0px 2px/
  );

  // A committed note still commits, from every other leave path: Tab out
  // saves it, and the keyboard lands on that annotation's timeline row rather
  // than on <body> (where the next Tab wrapped to the top of the sidebar).
  await editor.keyboard.press("Enter");
  await expect(rows).toHaveCount(2);
  await editor.keyboard.type("kept");
  await editor.keyboard.press("Tab");
  await expect(rows.nth(1)).toContainText("kept");
  await expect.poll(focused).toBe("timeline-row");

  // Arrow keys move the selection by 8px, Shift+arrow resizes it, and each
  // key-up is one undo entry.
  const second = editor.locator("#capture-viewport svg > g").nth(1).locator("rect").first();
  const before = await rectOf(second);
  await canvas.focus();
  await editor.keyboard.press("ArrowRight");
  await expect.poll(async () => (await rectOf(second)).x).toBe(before.x + 8);
  await editor.keyboard.press("Shift+ArrowDown");
  await expect.poll(async () => (await rectOf(second)).height).toBe(before.height + 8);
  await editor.keyboard.press("Control+z");
  await expect.poll(async () => (await rectOf(second)).height).toBe(before.height);
  await editor.keyboard.press("Control+z");
  await expect.poll(async () => (await rectOf(second)).x).toBe(before.x);

  // Delete, Undo and Redo say so in the editor's screen-reader-only region -
  // the visible toast stays reserved for the exports.
  const announcer = editor.locator("#editor-announcer");
  await editor.keyboard.press("Delete");
  await expect(rows).toHaveCount(1);
  await expect(announcer).toHaveText(/Annotation deleted/);
  await editor.keyboard.press("Control+z");
  await expect(rows).toHaveCount(2);
  await expect(announcer).toHaveText(/Undo/);
  await editor.keyboard.press("Control+Shift+z");
  await expect(announcer).toHaveText(/Redo/);
  // Never visible: it is a second live region, not a second banner.
  expect(await announcer.evaluate((el) => el.getBoundingClientRect().width)).toBeLessThanOrEqual(1);

  // For a text annotation the note *is* the annotation, so one placed and then
  // abandoned is removed rather than restored to an empty baseline. It used to
  // survive whenever nothing had been typed - which is exactly the abandon
  // case - leaving an invisible shape holding a numbered pin, a timeline row,
  // an `[text] (empty)` line in both prompts and an entry in the sidecar.
  const placedRows = await rows.count();
  await canvas.focus();
  await editor.keyboard.press("t");
  await editor.keyboard.press("Enter");
  await expect(rows).toHaveCount(placedRows + 1);
  await expect(note).toHaveCount(1);
  await editor.keyboard.press("Escape");
  await expect(rows).toHaveCount(placedRows);
  await expect(note).toHaveCount(0);

  await editor.close();
  await page.close();
});
