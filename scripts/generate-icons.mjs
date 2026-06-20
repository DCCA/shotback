// Generates Shotback's extension icons (16/32/48/128) from a single vector
// description. Pure Node — no native or third-party image dependencies — so the
// icons are reproducible in CI. Run with: node scripts/generate-icons.mjs
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../public/icons");
const SIZES = [16, 32, 48, 128];
const SS = 4; // supersampling factor for anti-aliasing

// Brand palette (emerald theme matching the app UI).
const BG_TOP = [16, 185, 129]; // emerald-500
const BG_BOTTOM = [4, 120, 87]; // emerald-700
const WHITE = [255, 255, 255];
const LENS_GLASS = [6, 95, 70];

const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];

// Inside test for an axis-aligned rounded rectangle, all args in 0..1 space.
function inRoundedRect(x, y, cx, cy, hw, hh, r) {
  const ax = Math.abs(x - cx);
  const ay = Math.abs(y - cy);
  if (ax > hw || ay > hh) return false;
  const qx = ax - (hw - r);
  const qy = ay - (hh - r);
  if (qx <= 0 || qy <= 0) return true;
  return qx * qx + qy * qy <= r * r;
}

const inCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

// Returns [r,g,b,a] (0..255) for a point in 0..1 space, painting back-to-front.
function sample(x, y) {
  let color = null;

  if (inRoundedRect(x, y, 0.5, 0.5, 0.5, 0.5, 0.22)) {
    color = mix(BG_TOP, BG_BOTTOM, y);
  }
  if (color === null) return [0, 0, 0, 0];

  // Camera body + viewfinder bump.
  if (
    inRoundedRect(x, y, 0.5, 0.56, 0.32, 0.22, 0.06) ||
    inRoundedRect(x, y, 0.4, 0.31, 0.1, 0.055, 0.03)
  ) {
    color = WHITE;
  }
  // Lens glass.
  if (inCircle(x, y, 0.5, 0.58, 0.125)) {
    color = LENS_GLASS;
  }
  // Lens highlight + flash dot.
  if (inCircle(x, y, 0.45, 0.53, 0.035) || inCircle(x, y, 0.66, 0.42, 0.022)) {
    color = WHITE;
  }

  return [Math.round(color[0]), Math.round(color[1]), Math.round(color[2]), 255];
}

function renderRgba(size) {
  const buf = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const x = (px + (sx + 0.5) / SS) / size;
          const y = (py + (sy + 0.5) / SS) / size;
          const [sr, sg, sb, sa] = sample(x, y);
          const af = sa / 255;
          r += sr * af;
          g += sg * af;
          b += sb * af;
          a += sa;
        }
      }
      const n = SS * SS;
      const alpha = a / n;
      const cover = alpha === 0 ? 0 : a / 255; // premultiplied weight sum
      const i = (py * size + px) * 4;
      buf[i] = cover === 0 ? 0 : Math.round(r / cover);
      buf[i + 1] = cover === 0 ? 0 : Math.round(g / cover);
      buf[i + 2] = cover === 0 ? 0 : Math.round(b / cover);
      buf[i + 3] = Math.round(alpha);
    }
  }
  return buf;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // no filter
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  const png = encodePng(size, renderRgba(size));
  writeFileSync(resolve(OUT_DIR, `icon${size}.png`), png);
  console.log(`wrote icons/icon${size}.png (${png.length} bytes)`);
}
