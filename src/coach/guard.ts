const TECHNIQUE_NAMES = [
  "naked single",
  "hidden single",
  "naked pair",
  "hidden pair",
  "pointing",
  "claiming",
  "naked triple",
  "hidden triple",
  "x-wing",
];

const CLAIMS = ["solved", "complete", "finished", "final", "rating", "genius", "improved", "excellent"];

export function explanationAllowed(text: string, source: string): boolean {
  if (text.length === 0 || text.length > 320) return false;
  const sourceNumbers: string[] = source.match(/\d+/g) ?? [];
  if (!(text.match(/\d+/g) ?? []).every((item) => sourceNumbers.includes(item))) return false;
  const sourceLower = source.toLowerCase();
  const textLower = text.toLowerCase();
  for (const word of CLAIMS) {
    const pattern = new RegExp(`\\b${word}\\b`, "i");
    if (pattern.test(text) && !pattern.test(source)) return false;
  }
  for (const name of TECHNIQUE_NAMES) {
    if (textLower.includes(name) && !sourceLower.includes(name)) return false;
  }
  for (const match of text.match(/digit(?:\s+is)?\s+\d/gi) ?? []) {
    if (!sourceLower.includes(match.toLowerCase())) return false;
  }
  return true;
}
