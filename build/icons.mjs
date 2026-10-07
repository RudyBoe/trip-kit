#!/usr/bin/env node
// Draw the app icons (a red 止まれ-style triangle) as PNGs without
// dependencies. Usage: node build/icons.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "icons");
const BG = [0xf6, 0xf3, 0xee];
const RED = [0xb5, 0x45, 0x2f];
const WHITE = [0xff, 0xff, 0xff];

const CRC = new Int32Array(256).map((_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n;
});
const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) raw.set(pixel(x, y), y * (size * 3 + 1) + 1 + x * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Inverted triangle, centred, inside the maskable safe zone (80%).
function inTri(u, v, inset) {
  const top = 0.27 + inset * 0.6, bottom = 0.78 - inset, half = 0.27 - inset;
  if (v < top || v > bottom) return false;
  const w = half * (bottom - v) / (bottom - top);
  return Math.abs(u - 0.5) <= w;
}
function draw(size) {
  const S = 4;   // supersampling
  return png(size, (x, y) => {
    const acc = [0, 0, 0];
    for (let i = 0; i < S; i++) for (let j = 0; j < S; j++) {
      const u = (x + (i + 0.5) / S) / size, v = (y + (j + 0.5) / S) / size;
      const c = inTri(u, v, 0.045) ? RED : inTri(u, v, 0.02) ? WHITE : inTri(u, v, 0) ? RED : BG;
      c.forEach((ch, k) => (acc[k] += ch));
    }
    return acc.map((a) => Math.round(a / (S * S)));
  });
}

mkdirSync(OUT, { recursive: true });
for (const [name, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]]) {
  writeFileSync(join(OUT, name), draw(size));
}
console.log("icons written to", OUT);
