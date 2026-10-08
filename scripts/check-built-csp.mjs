import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import worker from "../src/worker.ts";

const html = readFileSync("dist/index.html");
const text = html.toString("utf8");
const script = text.match(/<script>([\s\S]*?)<\/script>/);
if (!script) throw new Error("Built index.html has no inline script to hash.");
const expected = createHash("sha256").update(script[1]).digest("base64");
const env = {
  DB: { prepare: () => ({ bind: () => ({ first: async () => null, all: async () => ({ results: [] }), run: async () => ({ meta: { changes: 1 } }) }) }) },
  ASSETS: { fetch: async () => new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } }) },
};
const page = await worker.fetch(new Request("https://soldoku.test/"), env);
const policy = page.headers.get("content-security-policy") ?? "";
const api = await worker.fetch(new Request("https://soldoku.test/api/competitions", { method: "GET" }), env);
const apiPolicy = api.headers.get("content-security-policy") ?? "";
if (!policy.includes(`script-src 'self' 'sha256-${expected}'`)) throw new Error("HTML policy does not match the built inline script.");
if (policy.includes("unsafe-inline") || !policy.includes("frame-ancestors 'none'")) throw new Error("HTML policy is not the expected script and frame policy.");
if (page.headers.get("x-content-type-options") !== "nosniff" || page.headers.get("referrer-policy") !== "no-referrer") throw new Error("Isolation headers missing.");
if (apiPolicy !== "frame-ancestors 'none'" || apiPolicy.includes("script-src")) throw new Error("JSON response received a script policy.");
console.log(JSON.stringify({ passed: true, scriptHash: expected, htmlPolicy: policy, apiPolicy }));
