// Hand-drawn ink line art for marketing surfaces (docs/DESIGN.md "Illustration").
// ponytail: hand-authored SVG placeholders; replace with commissioned illustrations before launch.

const INK = "var(--text)";

// Slight wobble so strokes read as pen, not vector.
function Wobble({ id }: { id: string }) {
  return (
    <filter id={id}>
      <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" />
      <feDisplacementMap in="SourceGraphic" scale="2.2" />
    </filter>
  );
}

export function Chai({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 200" className={className} role="img" aria-label="A cup of chai, steaming">
      <defs>
        <Wobble id="w2" />
      </defs>
      <g filter="url(#w2)" fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path className="steam" d="M92 58 C80 44 104 36 92 20" />
        <path className="steam s2" d="M120 58 C108 42 132 34 120 16" />
        <path d="M56 74 L164 74 L150 166 L70 166 Z" fill="#fffdf8" />
        <path d="M60 96 L160 96" />
        <path d="M66 96 L158 96 L152 120 L70 120 Z" fill="#c98f4f" stroke="none" opacity="0.55" />
        <path d="M162 92 C196 92 196 140 156 138" />
        <path d="M40 176 C80 184 140 184 180 176" />
      </g>
    </svg>
  );
}
