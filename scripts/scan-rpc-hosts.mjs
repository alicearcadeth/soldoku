import { existsSync, readFileSync } from "node:fs";
import { solanaConfig } from "./operator-env.mjs";

const files = [
  "config/operator.env",
  solanaConfig("cli/config.yml"),
];
for (const file of files) {
  if (!existsSync(file)) {
    console.log(file.split("/").pop(), "missing");
    continue;
  }
  const hosts = new Set();
  for (const match of readFileSync(file, "utf8").matchAll(/https?:\/\/([^/\s"']+)/g)) {
    const host = match[1].replace(/:.*/, "");
    if (!/alchemy|localhost|127\.0\.0\.1/i.test(host)) hosts.add(host);
  }
  console.log(file.split("/").pop(), [...hosts].join(",") || "no other hosts");
}
