// Writes a tileable 8-bit grayscale noise PNG for mix-blend-mode: overlay. No dependencies (Node >= 22: zlib.crc32).
import { deflateSync, crc32 } from "node:zlib";
import { writeFileSync } from "node:fs";
const N = 160, LEVELS = 12, SPREAD = 56;           // tile px, grey levels, max distance from mid-grey
let seed = 20261106;                                 // fixed seed: the file is reproducible
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const raw = Buffer.alloc(N * (N + 1));
for (let y = 0; y < N; y++) {
  raw[y * (N + 1)] = 0;                              // PNG filter: none
  for (let x = 0; x < N; x++) {
    const g = (rand() + rand() + rand()) / 3 - 0.5;  // soft, roughly gaussian grain
    const q = Math.round(g * 2 * (LEVELS - 1)) / (LEVELS - 1);
    raw[y * (N + 1) + 1 + x] = Math.max(0, Math.min(255, Math.round(128 + q * SPREAD * 2)));
  }
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 0; // 8-bit, grayscale
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
writeFileSync(process.argv[2] ?? "grain.png", png); // usage: node make-grain.mjs public/brand/grain.png
console.log(`grain: ${N}x${N}, ${png.length} bytes`);
