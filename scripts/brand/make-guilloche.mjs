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
