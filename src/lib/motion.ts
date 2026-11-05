// Motion (JS) equivalents of the CSS motion tokens (docs/DESIGN.md 2.8.1). CSS first; use these only where CSS can't.
export const spring = { type: "spring", visualDuration: 0.3, bounce: 0.1 } as const; // menus, layout
export const press = { type: "spring", visualDuration: 0.35, bounce: 0.35 } as const; // seal, confirm check
export const sheet = { type: "spring", visualDuration: 0.32, bounce: 0 } as const; // drag release
export const fade = { duration: 0.2, ease: [0.23, 1, 0.32, 1] } as const;
