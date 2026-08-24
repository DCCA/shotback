import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
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
const CTA =
  `<div id="app" style="position:absolute;top:120px;left:200px"><section class="hero"><button class="cta" data-testid="buy" style="width:200px;height:120px;font-size:20px">Buy now</button></section></div>` +
  `<script>document.querySelector("button.cta")["__reactFiber$e2e"] = ` +
  `{ type: "button", return: { type: { name: "PricingCard" }, return: ` +
  `{ type: "div", return: { type: { displayName: "Page" }, return: null } } } };</script>`;

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
 * name the extension asks for is not what lands on disk here. That name is
 * asserted through the sidecar's own `imagePath` instead.
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

  // Creating an annotation switches the editor into move mode, so either
  // caller can arrive here in either mode.
  await editor.getByRole("combobox", { name: "Interaction" }).click();
  await editor.getByRole("option", { name: "Draw New" }).click();
  await editor.getByRole("combobox", { name: "Tool" }).click();
  await editor.getByRole("option", { name: "Box" }).click();

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
      await expect(row.locator("div").last()).toHaveText("Chart");

      await editor.getByRole("button", { name: "Copy Image" }).click();
      // The copy runs async after the click; wait for the success status
      // before reading the clipboard, or the read can race the write.
      await expect(editor.locator('[aria-live="polite"] p.font-medium')).toContainText("copied");
      const type = await editor.evaluate(
        async () => (await navigator.clipboard.read())[0].types[0]
      );
      expect(type).toBe("image/png");

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

      // Reset to Standard so the rest of the suite sees today's default.
      await editor.getByRole("combobox", { name: "Prompt detail" }).click();
      await editor.getByRole("option", { name: "Standard" }).click();
    }

    if (name === "inner") {
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

      await editor.getByRole("combobox", { name: "Interaction" }).click();
      await editor.getByRole("option", { name: "Move Existing" }).click();

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
      await editor.getByRole("combobox", { name: "Interaction" }).click();
      await editor.getByRole("option", { name: "Draw New" }).click();
      await editor.getByRole("combobox", { name: "Tool" }).click();
      await editor.getByRole("option", { name: "Text" }).click();

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

      await copyCloudPrompt(editor);
      expect(await readClipboard(editor)).toContain(
        "-> #app > section.hero > button.cta in <PricingCard > Page>"
      );

      // The context is derived data re-read on every commit, so it must still
      // be there after the box is moved (while it still covers the button).
      // Drawing an annotation already switched the editor into move mode.
      const inspectedBeforeMove = await inspectGen(editor);
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
      const sidecarFile = await downloadedFile("application/json");
      expect(claudePrompt.split("\n")[0]).toBe(
        `Review this screenshot: ${await downloadedFile("image/png")}`
      );
      expect(claudePrompt.split("\n")[1]).toBe(
        `Machine-readable annotations (selectors, rects, diagnostics): ${sidecarFile}`
      );

      const sidecar = JSON.parse(await readFile(sidecarFile, "utf8"));
      expect(sidecar.version).toBe(1);
      expect(sidecar.imagePath).toMatch(/^shotback\/cap-\d+\.png$/);
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

      // The documented path: annotate, then pick Crop and drag. No Interaction
      // switch here on purpose - the editor is in move mode after the last
      // commit, and picking Crop must put it back into draw mode by itself.
      await editor.getByRole("combobox", { name: "Tool" }).click();
      await editor.getByRole("option", { name: "Crop" }).click();

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
      await editor.getByRole("button", { name: "Apply crop" }).click();
      const cropRect = await rectOf(editor.locator("#crop-region"));
      // Only the CTA box is inside the crop; the sidebar says what it costs.
      await expect(editor.getByText("outside the crop")).toContainText(
        "2 annotations outside the crop are excluded from exports"
      );

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
      await expect(editor.locator("#crop-region")).toHaveCount(0);
    }

    await editor.close();
    await page.close();
  });
}

test("editor page renders the capture UI", async () => {
  const editor = await ctx.newPage();
  await editor.goto(`chrome-extension://${extId}/editor.html`, { waitUntil: "load" });
  await expect(editor.getByRole("button", { name: "Capture Page" })).toBeVisible();
  await expect(editor.getByRole("button", { name: "Copy for Claude Code" })).toBeVisible();
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
