import { existsSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  chromium,
  expect,
  test,
  type BrowserContext,
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

const CAPTURE_PAGES: Record<string, string> = {
  // The document itself scrolls, but with `scroll-behavior: smooth` - an
  // animated scroll must not be captured mid-flight.
  smooth: `<!doctype html><html style="scroll-behavior:smooth"><body style="margin:0">${BLOCKS}</body></html>`,
  // SPA shell: the document does not scroll at all, an inner element does.
  inner: `<!doctype html><html style="height:100%;overflow:hidden"><body style="margin:0;height:100%;overflow:hidden;display:flex;flex-direction:column"><div style="height:64px;background:#111;flex:none"></div><div style="flex:1;overflow:auto">${BLOCKS}</div></body></html>`
};

let ctx: BrowserContext;
let sw: ServiceWorker;
let extId: string;
let server: http.Server;
let base: string;

test.beforeAll(async () => {
  expect(existsSync(EXT), "dist/ must be built first (run: npm run build)").toBe(true);

  server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(CAPTURE_PAGES[(req.url ?? "/").slice(1)] ?? PAGE_HTML);
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

      // The cloud-LLM prompt carries the captured tab's environment.
      await editor.getByRole("button", { name: "Prepare for Cloud LLM" }).click();
      await expect(editor.locator('[aria-live="polite"] p.font-medium')).toContainText(
        "Prompt copied"
      );
      const prompt = await editor.evaluate(async () => navigator.clipboard.readText());
      expect(prompt).toContain(`Viewport: ${viewport.width}x${viewport.height}`);
      expect(prompt).toContain("Scroller: document");
      // The drawn box's line carries its geometry (px + % of page) so an
      // agent can locate it without opening the image.
      expect(prompt).toMatch(
        /1\. \[box\] Chart - at \(\d+, \d+\) size \d+x\d+ px \[\d+%, \d+% of page\]/
      );
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
