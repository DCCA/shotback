// Generates Chrome Web Store listing screenshots (1280x800) into `store/`:
// the editor with a real annotated capture (box, arrow, text, and a
// redaction, so the pixelation is visible), the local share viewer, and the
// editor in dark mode. Loads the built `dist/` extension in real Chromium the
// same way `tests/e2e/extension.spec.ts` does.
//
// Usage: npm run build && node scripts/store-screenshots.mjs
//
// `document`/`window`/`chrome` below are page.evaluate()/sw.evaluate()
// callback bodies - they run inside the browser/extension, not this Node
// process, so ESLint's Node globals do not cover them.
/* global document, window, chrome */

import { existsSync, mkdirSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(dir, "..");
const EXT = path.resolve(ROOT, "dist");
const OUT_DIR = path.resolve(ROOT, "store");

if (!existsSync(EXT)) {
  console.error("dist/ must be built first (run: npm run build)");
  process.exit(1);
}
mkdirSync(OUT_DIR, { recursive: true });

// A presentable fixture page, short enough to capture in one viewport so the
// script does not depend on the scroll-and-stitch loop finishing more than
// one step. Includes a fake email address as the thing the redaction hides.
const FIXTURE_HTML = `<!doctype html><html><head><meta charset="utf8"><title>Acme Analytics</title></head>
<body style="margin:0;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#f8fafc">
<header style="height:64px;background:#111827;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 32px">
  <div style="font-weight:700;font-size:18px">Acme Analytics</div>
  <div style="display:flex;align-items:center;gap:24px;font-size:14px;color:#cbd5e1">
    <span>Overview</span><span>Reports</span><span>Settings</span>
    <span id="user-email">jordan.smith@acme-corp.com</span>
  </div>
</header>
<main style="padding:32px;max-width:1000px;margin:0 auto">
  <h1 style="font-size:26px;margin:0 0 24px">Team overview</h1>
  <div id="stats-row" style="display:flex;gap:16px;margin-bottom:28px">
    <div style="flex:1;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px">
      <div style="font-size:13px;color:#64748b">Active users</div>
      <div id="stat-users" style="font-size:28px;font-weight:700;color:#0f172a">4,812</div>
    </div>
    <div style="flex:1;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px">
      <div style="font-size:13px;color:#64748b">Revenue</div>
      <div style="font-size:28px;font-weight:700;color:#0f172a">$92,140</div>
    </div>
    <div style="flex:1;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px">
      <div style="font-size:13px;color:#64748b">Churn</div>
      <div style="font-size:28px;font-weight:700;color:#0f172a">1.8%</div>
    </div>
  </div>
  <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px">
    <div style="font-size:15px;font-weight:600;margin-bottom:12px">Billing settings</div>
    <div style="color:#475569;font-size:14px;line-height:1.5;margin-bottom:20px">
      Update the plan and payment details for this workspace.
    </div>
    <div style="display:flex;gap:12px">
      <button id="cancel-btn" style="padding:10px 18px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;font-size:14px">Cancel</button>
      <button id="save-btn" style="padding:10px 18px;border-radius:8px;border:none;background:#10b981;color:#fff;font-size:14px;margin-top:14px">Save changes</button>
    </div>
  </div>
</main>
</body></html>`;

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(FIXTURE_HTML);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}/`;

const ctx = await chromium.launchPersistentContext("", {
  headless: false,
  viewport: null,
  args: [
    "--headless=new",
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    "--no-sandbox"
  ]
});

try {
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
  const extId = new URL(sw.url()).host;

  // Resize the *source* window before capture (captureVisibleTab grabs the
  // real window, and the default new-headless window is small), then read
  // real element rects off the live page rather than guessing pixel offsets
  // - a layout tweak to the fixture would otherwise silently break every
  // annotation position.
  async function openEditor(colorScheme) {
    const page = await ctx.newPage();
    if (colorScheme) await page.emulateMedia({ colorScheme });
    await page.goto(base, { waitUntil: "load" });
    await page.setViewportSize({ width: 1280, height: 800 });

    const rectOf = (sel) =>
      page.evaluate((s) => {
        const b = document.querySelector(s).getBoundingClientRect();
        return { x: b.x, y: b.y, width: b.width, height: b.height };
      }, sel);
    const dpr = await page.evaluate(() => window.devicePixelRatio);
    const rects = {
      saveBtn: await rectOf("#save-btn"),
      userEmail: await rectOf("#user-email"),
      statsRow: await rectOf("#stats-row"),
      statUsers: await rectOf("#stat-users")
    };

    const { tabId, windowId } = await sw.evaluate(async (url) => {
      const [tab] = await chrome.tabs.query({ url });
      return { tabId: tab.id, windowId: tab.windowId };
    }, base);

    const editor = await ctx.newPage();
    if (colorScheme) await editor.emulateMedia({ colorScheme });
    await editor.goto(
      `chrome-extension://${extId}/editor.html?tabId=${tabId}&windowId=${windowId}&autocapture=1`
    );
    const img = editor.locator("img[src^='data:image/png']");
    await img.waitFor({ state: "attached", timeout: 30_000 });
    await editor.waitForFunction(
      () => (document.querySelector("img[src^='data:image/png']")?.complete ?? false) === true,
      { timeout: 30_000 }
    );
    await editor.setViewportSize({ width: 1280, height: 800 });

    // Image-px point for a page-px point, via the actual capture scale
    // (naturalWidth / page CSS width), not an assumed dpr.
    const natural = await img.evaluate((el) => el.naturalWidth);
    const scale = natural / 1280;
    const toImg = (pageX, pageY) => [pageX * scale, pageY * scale];

    return { page, editor, img, rects, dpr, toImg };
  }

  async function pickTool(editor, tool) {
    await editor.getByRole("combobox", { name: "Interaction" }).click();
    await editor.getByRole("option", { name: "Draw New" }).click();
    await editor.getByRole("combobox", { name: "Tool" }).click();
    await editor.getByRole("option", { name: tool }).click();
  }

  async function toScreen(img, px, py) {
    const natural = await img.evaluate((el) => el.naturalWidth);
    const shown = await img.boundingBox();
    const k = shown.width / natural;
    return { x: shown.x + px * k, y: shown.y + py * k };
  }

  async function drag(editor, from, to) {
    await editor.mouse.move(from.x, from.y);
    await editor.mouse.down();
    await editor.mouse.move(to.x, to.y, { steps: 5 });
    await editor.mouse.up();
  }

  // --- Shot 1: light editor with box, arrow, text, and a redaction ---
  {
    const { page, editor, img, rects, toImg } = await openEditor();

    // Box over "Save changes", padded 6px, with a comment.
    await pickTool(editor, "Box");
    const b = rects.saveBtn;
    await drag(
      editor,
      await toScreen(img, ...toImg(b.x - 6, b.y - 6)),
      await toScreen(img, ...toImg(b.x + b.width + 6, b.y + b.height + 6))
    );
    await editor.keyboard.type("Button sits lower than Cancel - align baselines");
    await editor.keyboard.press("Escape");

    // Arrow from the right-hand gutter pointing at the "Active users" stat.
    await pickTool(editor, "Arrow");
    const s = rects.statUsers;
    await drag(
      editor,
      await toScreen(img, ...toImg(rects.statsRow.x + rects.statsRow.width + 60, s.y + 60)),
      await toScreen(img, ...toImg(s.x + s.width - 10, s.y + s.height + 4))
    );
    await editor.keyboard.type("Verify this number, looks stale");
    await editor.keyboard.press("Escape");

    // A free-standing text note in the same right-hand gutter.
    await pickTool(editor, "Text");
    const textAt = await toScreen(
      img,
      ...toImg(rects.statsRow.x + rects.statsRow.width + 40, rects.statsRow.y + 8)
    );
    await editor.mouse.click(textAt.x, textAt.y);
    await editor.keyboard.type("Looks great overall!");
    await editor.keyboard.press("Escape");

    // Redact the email address so the pixelation is visible in the shot.
    await pickTool(editor, "Redact");
    const e = rects.userEmail;
    await drag(
      editor,
      await toScreen(img, ...toImg(e.x - 4, e.y - 4)),
      await toScreen(img, ...toImg(e.x + e.width + 4, e.y + e.height + 4))
    );
    await editor.keyboard.press("Escape");

    await editor.screenshot({ path: path.join(OUT_DIR, "1-editor-annotations.png") });
    await editor.close();
    await page.close();
  }

  // --- Shot 2: local share viewer ---
  {
    const { page, editor, img, rects, toImg } = await openEditor();
    await pickTool(editor, "Box");
    const b = rects.saveBtn;
    await drag(
      editor,
      await toScreen(img, ...toImg(b.x - 6, b.y - 6)),
      await toScreen(img, ...toImg(b.x + b.width + 6, b.y + b.height + 6))
    );
    await editor.keyboard.type("Ship this for the next release");
    await editor.keyboard.press("Escape");

    await editor.getByRole("button", { name: "Copy Local Share Link" }).click();
    await editor.waitForSelector("a[href*='viewer.html']");
    const href = await editor.locator("a[href*='viewer.html']").getAttribute("href");

    const viewer = await ctx.newPage();
    await viewer.setViewportSize({ width: 1280, height: 800 });
    await viewer.goto(href);
    await viewer.locator("img[alt='Annotated share']").waitFor({ state: "attached" });
    await viewer.screenshot({ path: path.join(OUT_DIR, "2-viewer.png") });

    await viewer.close();
    await editor.close();
    await page.close();
  }

  // --- Shot 3: dark editor ---
  {
    const { page, editor, img, rects, toImg } = await openEditor("dark");
    await pickTool(editor, "Box");
    const b = rects.saveBtn;
    await drag(
      editor,
      await toScreen(img, ...toImg(b.x - 6, b.y - 6)),
      await toScreen(img, ...toImg(b.x + b.width + 6, b.y + b.height + 6))
    );
    await editor.keyboard.type("Dark mode looks sharp here");
    await editor.keyboard.press("Escape");

    await editor.screenshot({ path: path.join(OUT_DIR, "3-editor-dark.png") });
    await editor.close();
    await page.close();
  }

  console.log(`Wrote listing screenshots to ${OUT_DIR}`);
} finally {
  await ctx.close();
  await new Promise((resolve) => server.close(() => resolve()));
}
