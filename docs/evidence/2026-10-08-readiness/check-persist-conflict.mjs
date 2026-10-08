import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../../../src/worker.ts", import.meta.url), "utf8");
const start = source.indexOf("async function persistCompetitionSnapshot");
const end = source.indexOf("function competitionPersist");
const fn = source.slice(start, end);
const checksChanges = /meta\?\.changes|written\.meta/.test(fn);
console.log(`persist checks conflict result=${checksChanges}`);
if (!checksChanges) {
  console.error("FAIL: persistCompetitionSnapshot updates only when the stored body still matches, and it ignores a zero-change result");
  process.exit(1);
}
console.log("PASS: persistCompetitionSnapshot reports a lost write");
