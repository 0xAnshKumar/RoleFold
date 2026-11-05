# Hunt brand assets: how to generate them (design system v2)

Three files, all generated locally from code, nothing copied or downloaded. Run once, commit the outputs to
`public/brand/`, and serve them with `Cache-Control: public, max-age=31536000, immutable` (rename on change).
Both scripts were run and checked on 2026-11-06 with Node 24.12 (the repo's `.nvmrc`). No dependencies.

| File | What | Size (raw / gzip) | Used as |
|---|---|---|---|
| `grain.png` | 160×160 tileable 8-bit grey noise around mid-grey | 14.0 KB / n.a. (PNG) | `::before` overlay, `mix-blend-mode: overlay` |
| `guilloche-rosette.svg` | security-print ring, 18 lobes × 6 offset strands | 8.5 KB / 3.6 KB | `mask-image` (tinted by `background-color`) |
| `guilloche-wave.svg` | 7-strand wave band, tiles horizontally | 9.8 KB / 4.0 KB | `mask-image`, `mask-repeat: repeat-x` |

Suggested home for the scripts when built: `scripts/brand/` (they are build tools, not app code).
Tuning knobs: grain `LEVELS`/`SPREAD` (contrast), rosette `lobes`/`copies` (density), wave `strands`.
Keep the rosette mesh open enough that it reads as linework at 6-10% contrast, not as a grey blob.

## grain: `make-grain.mjs`

```js
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
```

## guilloche: `make-guilloche.mjs`

```js
// Writes two security-print line patterns as SVG. Used only as CSS mask-image, so CSS tints them.
// Usage: node make-guilloche.mjs public/brand
import { writeFileSync } from "node:fs";
import { join } from "node:path";
const out = process.argv[2] ?? ".";
const f = (n) => +n.toFixed(1);
const pts2d = (pts) => pts.map(([x, y]) => `${f(x)} ${f(y)}`).join("L");

// 1. Rosette ring: one 18-lobe strand drawn once, repeated 6x by <use>, each turned by 1/6 of a lobe.
//    The overlapping strands make the crossed mesh of security print; file size stays one strand.
{
  const S = 640, c = S / 2, lobes = 18, copies = 6, steps = lobes * 40, pts = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    const rad = 224 + 62 * Math.sin(lobes * t) + 16 * Math.sin(3 * lobes * t);
    pts.push([c + rad * Math.cos(t), c + rad * Math.sin(t)]);
  }
  const step = 360 / lobes / copies;
  const uses = Array.from({ length: copies - 1 }, (_, i) => `<use href="#s" transform="rotate(${f((i + 1) * step)} ${c} ${c})"/>`).join("");
  writeFileSync(
    join(out, "guilloche-rosette.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}"><path id="s" d="M${pts2d(pts)}Z" fill="none" stroke="#000" stroke-width="0.7"/>${uses}</svg>`,
  );
}
// 2. Wave band: 7 phase-shifted strands; width holds whole periods, so it tiles horizontally.
{
  const W = 480, H = 120, strands = 7, ds = [];
  for (let s = 0; s < strands; s++) {
    const ph = (s / strands) * Math.PI * 2, pts = [];
    for (let x = 0; x <= W; x += 3) {
      pts.push([x, H / 2 + Math.sin((x / W) * 4 * Math.PI + ph) * 38 + Math.sin((x / W) * 12 * Math.PI - ph) * 8]);
    }
    ds.push("M" + pts2d(pts));
  }
  writeFileSync(
    join(out, "guilloche-wave.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><path d="${ds.join("")}" fill="none" stroke="#000" stroke-width="0.8"/></svg>`,
  );
}
console.log("guilloche: wrote rosette + wave to", out);
```

## Using them (CSS)

```css
/* One shared grain. Parent needs a background and `isolation: isolate`. */
.grain { position: relative; isolation: isolate; }
.grain::before {
  content: ""; position: absolute; inset: 0; z-index: -1; border-radius: inherit; pointer-events: none;
  background: url("/brand/grain.png") 0 0 / 160px 160px repeat;
  mix-blend-mode: overlay; opacity: var(--grain-opacity, 0.32);
}
/* Guilloche: a tinted shape, never an <img>. */
.guilloche-rosette {
  position: absolute; aspect-ratio: 1; pointer-events: none;
  background: var(--g-color, var(--mk-line));
  -webkit-mask: url("/brand/guilloche-rosette.svg") center / contain no-repeat;
          mask: url("/brand/guilloche-rosette.svg") center / contain no-repeat;
}
.guilloche-wave {
  height: 120px; pointer-events: none; background: var(--g-color, var(--mk-line));
  -webkit-mask: url("/brand/guilloche-wave.svg") 0 50% / 480px 120px repeat-x;
          mask: url("/brand/guilloche-wave.svg") 0 50% / 480px 120px repeat-x;
}
```
