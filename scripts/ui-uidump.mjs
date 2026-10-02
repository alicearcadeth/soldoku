import { readFileSync } from "node:fs";

const xml = readFileSync(process.argv[2], "utf8");
const texts = [...xml.matchAll(/text="([^"]*)"/g)].map((match) => match[1]).filter(Boolean);
const ids = [...xml.matchAll(/resource-id="([^"]+)"/g)].map((match) => match[1]).filter((id) => id.includes("mwallet") || id.includes("btn"));
console.log(texts.join("\n"));
console.log("---");
console.log(ids.join("\n"));
const nodes = [...xml.matchAll(/<node[^>]*>/g)].map((match) => match[0]);
for (const node of nodes) {
  const text = node.match(/text="([^"]*)"/)?.[1] ?? "";
  const id = node.match(/resource-id="([^"]*)"/)?.[1] ?? "";
  const clickable = node.includes('clickable="true"');
  const bounds = node.match(/bounds="([^"]*)"/)?.[1] ?? "";
  if (clickable || text) console.log(`${clickable ? "TAP" : "   "} ${bounds} ${id} ${text}`);
}
