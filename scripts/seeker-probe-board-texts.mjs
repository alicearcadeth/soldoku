import { readFileSync } from "node:fs";
const x = readFileSync("docs/evidence/2026-10-09-seeker/92b-wait-0.xml", "utf8");
const texts = [...x.matchAll(/text="([^"]+)"/g)].map((m) => m[1]);
const nodes = [];
const re = /text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g;
let m;
while ((m = re.exec(x))) {
  nodes.push({ text: m[1], x1: +m[2], y1: +m[3], x2: +m[4], y2: +m[5], cx: ((+m[2] + +m[4]) / 2) | 0, cy: ((+m[3] + +m[5]) / 2) | 0 });
}
console.log(JSON.stringify({
  texts,
  digitNodes: nodes.filter((n) => /^[1-9]$/.test(n.text)),
  interesting: nodes.filter((n) => /time|Erase|Room|Home|[1-9]/.test(n.text)).slice(0, 40),
}, null, 2));
