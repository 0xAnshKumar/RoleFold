import s from "./Card.module.css";

/**
 * Base card (DESIGN.md 3.8): surface, r-lg, rim, shadow-1. One level only: never a card inside a card.
 * `interactive` = a link card: put `cardLink` on the title's <a> so the whole card is the target (stretched link);
 * other buttons inside get `cardRaised` so they stay clickable.
 */
export function Card<T extends React.ElementType = "div">({
  as,
  interactive = false,
  flush = false,
  className,
  ...rest
}: { as?: T; interactive?: boolean; flush?: boolean; className?: string } & Omit<React.ComponentPropsWithoutRef<T>, "as" | "className">) {
  const Tag = (as ?? "div") as React.ElementType;
  return <Tag {...rest} className={[s.card, "rim", interactive && s.interactive, flush && s.flush, className].filter(Boolean).join(" ")} />;
}

export const cardLink = s.link;
export const cardRaised = s.raised;

/** A set of cards with sibling dimming on hover-capable devices. */
export function CardSet({ children, className, as: Tag = "div" }: { children: React.ReactNode; className?: string; as?: "div" | "ul" }) {
  return <Tag className={`${s.set} ${className ?? ""}`}>{children}</Tag>;
}
