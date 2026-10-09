import { readFileSync } from "node:fs";
const x = readFileSync("docs/evidence/2026-10-09-seeker/41-classic-entry.xml", "utf8");
const descs = [...x.matchAll(/content-desc="([^"]+)"/g)].map((m) => m[1]).filter(Boolean);
const texts = [...x.matchAll(/text="([^"]+)"/g)].map((m) => m[1]);
console.log(JSON.stringify({
  classicDescs: descs.filter((d) => /Row|empty|given|cell|Sudoku/i.test(d)).slice(0, 20),
  allDescSample: descs.slice(0, 30),
  classicTexts: texts.slice(0, 50),
}, null, 2));
