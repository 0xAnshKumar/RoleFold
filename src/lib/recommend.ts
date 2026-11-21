// Which template to mark "Recommended for you" in the gallery: a plain keyword read of the resume's target role.
// Ids match shared/resume-templates.json. Kept free of the JSON import so node --test can load it.

const RULES: [RegExp, string][] = [
  [/\b(research(er)?|phd|professor|faculty|lecturer|postdoc|academic)\b/i, "academic"],
  [/\b(engineer(ing)?|developer|software|frontend|front-end|backend|back-end|full[- ]?stack|devops|sre|data scien\w*|programmer|ml|ai)\b/i, "tech"],
  [/\b(fresher|student|intern(ship)?|graduate|campus)\b/i, "campus"],
  [/\b(switch\w*|returning|career break|transition\w*)\b/i, "combination"],
  [/\b(product|design\w*|marketing|business|analyst|consultant|sales|growth)\b/i, "modern"],
];

/** Template id for this target role; no work history means a fresher's resume. */
export function recommendTemplate(target: string, hasExperience: boolean): string {
  const hit = RULES.find(([re]) => re.test(target))?.[1];
  if (hit === "academic" || hit === "combination") return hit;
  if (!hasExperience) return "campus";
  return hit ?? "classic";
}
