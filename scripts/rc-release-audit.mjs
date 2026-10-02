import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function pngSize(file) {
  const bytes = readFileSync(file);
  return { file, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

const images = [
  "store/icon-512.png",
  "store/screen-home.png",
  "store/screen-classic.png",
  "store/screen-compete.png",
].map(pngSize);

const apk = join(homedir(), "sudoku-seeker", "app", "build", "outputs", "apk", "release", "app-release.apk");
const cert = spawnSync("keytool", ["-printcert", "-jarfile", apk], { encoding: "utf8" });
const sha256 = cert.stdout?.match(/SHA256:\s*([0-9A-F:]+)/)?.[1] ?? null;
const owner = cert.stdout?.match(/Owner:\s*(.+)/)?.[1] ?? null;

console.log(JSON.stringify({ images, apkSha256: sha256, apkOwner: owner, certListed: cert.status === 0 }, null, 2));
