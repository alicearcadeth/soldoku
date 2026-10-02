import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const expected = {
  "submission/sudoku-clockin.apk": "79529045f97ad9867ab6dc6207a06d038600966c0b687dfd7ba53406e2b0d954",
  "submission/sudoku-clockin-final.mp4": "b8c67a978010387932b9a551a06ec208f336cbe61b54ad64ed9fa32cea530227",
  "submission/pitch.html": "641d7a4bab8db80c64a055fcfce1075da6355790be7e28f940142c58138937c6",
};
const releaseCommit = "812581ec1e850c0d80658eb737369ecb766de34a";
const requiredPaths = [
  "package.json",
  "package-lock.json",
  ".nvmrc",
  ".env.example",
  "docs/MIGRATION.md",
  "docs/PRIVATE_SETUP.md",
  "docs/CURRENT_RELEASE.md",
  "src/ui/depositHold.ts",
  "android/gradlew.bat",
  "android/gradle/wrapper/gradle-wrapper.properties",
  "programs/match-escrow/Cargo.toml",
  "wrangler.jsonc",
];
const privileged = ["SUDOKU_AUTHORITY_KEY", "SOLANA_MOBILE_KEYSTORE_PASSWORD", "SOLANA_MOBILE_KEY_PASSWORD"];
let failed = 0;

function say(level, name, detail = "") {
  if (level === "FAIL") failed += 1;
  console.log(`${level}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function command(bin, args) {
  return spawnSync(bin, args, { encoding: "utf8", shell: process.platform === "win32" });
}

for (const path of requiredPaths) {
  if (existsSync(path)) say("PASS", path);
  else say("FAIL", path, "missing");
}

for (const [path, hash] of Object.entries(expected)) {
  if (!existsSync(path)) {
    say("FAIL", path, "missing");
    continue;
  }
  const raw = readFileSync(path);
  const body = path.endsWith(".html") ? Buffer.from(raw.toString("utf8").replace(/\r\n/g, "\n")) : raw;
  const actual = createHash("sha256").update(body).digest("hex");
  const size = statSync(path).size;
  if (actual === hash) say("PASS", path, `${size} bytes, hash matches`);
  else say("FAIL", path, `${size} bytes, hash differs`);
}

const node = command("node", ["-v"]);
if (node.status === 0 && /^v22\./.test(node.stdout.trim())) say("PASS", "node", node.stdout.trim());
else say("FAIL", "node", (node.stdout || node.stderr || "unavailable").trim());

const npm = command("npm", ["-v"]);
if (npm.status === 0) say("PASS", "npm", npm.stdout.trim());
else say("FAIL", "npm", "unavailable");

if (existsSync("node_modules/vite")) say("PASS", "dependencies", "node_modules/vite present");
else say("WARN", "dependencies", "run npm ci");

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
for (const script of ["dev", "build", "test"]) {
  if (pkg.scripts?.[script]) say("PASS", `npm run ${script}`);
  else say("FAIL", `npm run ${script}`, "script missing");
}
if (pkg.engines?.node?.includes("22")) say("PASS", "engines.node", pkg.engines.node);
else say("FAIL", "engines.node", "expected a Node 22 range");

const java = command("java", ["-version"]);
const javaText = `${java.stdout || ""}${java.stderr || ""}`;
if (java.status === 0 && /version "17/.test(javaText)) say("PASS", "java", "17");
else say("WARN", "java", "JDK 17 not detected; Android release builds need it");

if (process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT) say("PASS", "Android SDK", "environment variable set");
else say("WARN", "Android SDK", "ANDROID_HOME unset; web development does not need it");

for (const name of privileged) {
  if (process.env[name]) say("WARN", name, "set in this shell; value not printed");
  else say("PASS", name, "unset");
}

const banned = [/C:\\Users\\[^\\\s]+/, /\/home\/six7dev/, /[A-Za-z]:\\James/, /\/mnt\/f\/James/];
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "dist", ".git", "target", ".gradle", "build"].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (/\.(mjs|sh|md|json|kts|properties|example)$/.test(entry.name)) {
      const text = readFileSync(path, "utf8");
      const lines = text.split(/\r?\n/);
      lines.forEach((line, index) => {
        if (banned.some((pattern) => pattern.test(line))) {
          say("FAIL", path, `machine-specific path at line ${index + 1}`);
        }
      });
    }
  }
}
walk(".");

const branch = command("git", ["branch", "--show-current"]);
const head = command("git", ["rev-parse", "HEAD"]);
const ancestor = command("git", ["merge-base", "--is-ancestor", releaseCommit, "HEAD"]);
if (branch.status === 0) say("PASS", "branch", branch.stdout.trim() || "(detached)");
else say("WARN", "branch", "not a git checkout");
if (head.status === 0) say("PASS", "commit", head.stdout.trim());
if (ancestor.status === 0) say("PASS", "release ancestor", releaseCommit);
else if (head.status === 0) say("WARN", "release ancestor", `${releaseCommit} is not in HEAD`);

console.log(failed ? `FAIL  ${failed} check(s)` : "PASS  migration checks");
process.exit(failed ? 1 : 0);
