import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const key = readFileSync("F:/James/AI daily/codex-video-lab/.secrets/gemini-aistudio.key", "utf8").trim();
if (key.length < 20) throw new Error("Gemini key is missing");
const child = spawn("npx", ["--yes", "wrangler", "secret", "put", "GEMINI_API_KEY"], { shell: true, stdio: ["pipe", "pipe", "pipe"] });
let out = "";
child.stdout.on("data", (chunk) => { out += chunk.toString(); });
child.stderr.on("data", (chunk) => { out += chunk.toString(); });
child.on("exit", (code) => {
  process.stdout.write(out.replace(key, "[key]"));
  process.exit(code ?? 1);
});
child.stdin.write(key);
child.stdin.end();
