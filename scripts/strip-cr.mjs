import { readFileSync, writeFileSync } from "node:fs";
const path = process.argv[2];
writeFileSync(path, readFileSync(path, "utf8").replaceAll("\r\n", "\n"));
