// Multi-size PNG-in-ICO writer. Embeds 16/32/48 PNG frames directly into
// site/favicon.ico (modern browsers + Windows 7+ file explorer support).
//
// No npm dependency; uses raw Buffer ops on PNGs already produced by
// scripts/site-favicon-render.mjs.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const siteDir = resolve(__dirname, "..", "site");

const frames = [
  { size: 16, path: resolve(siteDir, "favicon-16.png") },
  { size: 32, path: resolve(siteDir, "favicon-32.png") },
  { size: 48, path: resolve(siteDir, "favicon-48.png") },
];

const ICONDIR_SIZE = 6;
const ICONDIRENTRY_SIZE = 16;

const header = Buffer.alloc(ICONDIR_SIZE);
header.writeUInt16LE(0, 0);            // reserved
header.writeUInt16LE(1, 2);            // type 1 = ICO
header.writeUInt16LE(frames.length, 4);

const buffers = frames.map((f) => readFileSync(f.path));
const entries = [];
let offset = ICONDIR_SIZE + ICONDIRENTRY_SIZE * frames.length;

for (let i = 0; i < frames.length; i++) {
  const e = Buffer.alloc(ICONDIRENTRY_SIZE);
  // Width / height: byte 0 means 256.
  e.writeUInt8(frames[i].size === 256 ? 0 : frames[i].size, 0);
  e.writeUInt8(frames[i].size === 256 ? 0 : frames[i].size, 1);
  e.writeUInt8(0, 2);                  // colors in palette
  e.writeUInt8(0, 3);                  // reserved
  e.writeUInt16LE(1, 4);               // color planes
  e.writeUInt16LE(32, 6);              // bits per pixel
  e.writeUInt32LE(buffers[i].length, 8);
  e.writeUInt32LE(offset, 12);
  entries.push(e);
  offset += buffers[i].length;
}

const ico = Buffer.concat([header, ...entries, ...buffers]);
const outPath = resolve(siteDir, "favicon.ico");
writeFileSync(outPath, ico);
console.log(`wrote ${outPath} (${ico.length} bytes, ${frames.length} frames)`);
