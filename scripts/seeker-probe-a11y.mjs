import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync } from "node:fs";

const serial = process.env.SEEKER_SERIAL || "SM02E4072803429";
const adb = (...args) => execFileSync("adb", ["-s", serial, ...args], { encoding: "utf8" });
adb("shell", "uiautomator", "dump", "/sdcard/uidump.xml");
adb("pull", "/sdcard/uidump.xml", "docs/evidence/2026-10-09-seeker/92-probe.xml");
const x = readFileSync("docs/evidence/2026-10-09-seeker/92-probe.xml", "utf8");
const texts = [...x.matchAll(/text="([^"]+)"/g)].map((m) => m[1]);
const descs = [...x.matchAll(/content-desc="([^"]+)"/g)].map((m) => m[1]).filter(Boolean);
const nodes = [...x.matchAll(/text="([^"]*)"[^>]*content-desc="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g)]
  .map((m) => ({ text: m[1], desc: m[2], bounds: [+m[3], +m[4], +m[5], +m[6]] }));
writeFileSync(
  "docs/evidence/2026-10-09-seeker/92-probe.json",
  JSON.stringify({ texts: texts.slice(0, 60), descs: descs.slice(0, 60), sampleNodes: nodes.slice(0, 30), len: x.length }, null, 2),
);
console.log(JSON.stringify({ textCount: texts.length, descCount: descs.length, rowDescs: descs.filter((d) => /Row /.test(d)).length, texts: texts.slice(0, 35) }, null, 2));
