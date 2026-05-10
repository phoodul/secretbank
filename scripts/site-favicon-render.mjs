// Render site/favicon.svg into 6 PNG sizes via Playwright (chromium headless).
// Source SVG = the same VaultMechanism logo used in site nav.
//
// Outputs (site/ root, overwriting any prior files):
//   favicon-16.png         16×16  browser tab (legacy)
//   favicon-32.png         32×32  browser tab (HiDPI)
//   favicon-48.png         48×48  Windows file explorer
//   apple-touch-icon.png   180×180  iOS Safari home screen
//   favicon-192.png        192×192  Android Chrome / PWA
//   favicon-512.png        512×512  PWA splash / install prompt

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { chromium } from "@playwright/test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const siteDir = resolve(__dirname, "..", "site");
const svgPath = resolve(siteDir, "favicon.svg");
const svg = readFileSync(svgPath, "utf8");

const targets = [
  { size: 16, out: "favicon-16.png" },
  { size: 32, out: "favicon-32.png" },
  { size: 48, out: "favicon-48.png" },
  { size: 180, out: "apple-touch-icon.png" },
  { size: 192, out: "favicon-192.png" },
  { size: 512, out: "favicon-512.png" },
];

const browser = await chromium.launch();
try {
  for (const { size, out } of targets) {
    const ctx = await browser.newContext({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    const html = `<!doctype html><html><head><style>
      html, body { margin:0; padding:0; background: transparent; }
      svg { display:block; width:${size}px; height:${size}px; }
    </style></head><body>${svg}</body></html>`;
    await page.setContent(html, { waitUntil: "load" });
    const el = await page.$("svg");
    if (!el) throw new Error("svg not found in rendered page");
    const buf = await el.screenshot({ omitBackground: true, type: "png" });
    writeFileSync(resolve(siteDir, out), buf);
    console.log(`  wrote site/${out} (${buf.length} bytes, ${size}×${size})`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log("Done.");
