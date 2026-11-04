/** A name read from a resume header is often set in ALL CAPS: offer it in natural case. Mixed case is kept as typed. */
export const naturalName = (n: string) =>
  n === n.toUpperCase() && n !== n.toLowerCase() ? n.toLowerCase().replace(/(^|[\s'’.-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase()) : n;
