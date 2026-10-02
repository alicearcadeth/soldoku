import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Connect } from "vite";
import { createCompetitionStore } from "./store";
import { marketTokens } from "./market";

const path = process.env.SUDOKU_COMPETITION_STORE || join(process.cwd(), "data", "competitions.json");
const store = createCompetitionStore(Date.now, raw => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, raw);
});
try { store.replace(readFileSync(path, "utf8")); } catch { /* First local run. */ }
export const replaceCompetitions = store.replace;
export const snapshotCompetitions = store.snapshot;
export const handleCompetitionRequest = store.route;
export async function handleMarketRequest(url: URL) {
  return { tokens: await marketTokens(url.searchParams.get("q") ?? "", url.searchParams.get("mint") ?? undefined, process.env.JUPITER_API_KEY), registryEnabled: Boolean(process.env.JUPITER_API_KEY), source: "DEX Screener", refreshSeconds: 30 };
}
export const competitionMiddleware: Connect.NextHandleFunction = (req, res, next) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  if (!url.pathname.startsWith("/api/competitions") && url.pathname !== "/api/tokens") return next();
  void (async () => {
    try {
      let result;
      if (url.pathname === "/api/tokens") {
        if (req.method !== "GET") throw new Error("Use GET for token prices.");
        result = await handleMarketRequest(url);
      } else {
        let raw = "";
        for await (const chunk of req) {
          raw += String(chunk);
          if (raw.length > 16384) throw new Error("Request is too large.");
        }
        result = store.route(req.method ?? "GET", url, raw ? JSON.parse(raw) : {});
      }
      res.setHeader("content-type", "application/json");
      res.setHeader("cache-control", "no-store");
      res.end(JSON.stringify(result));
    } catch (error) {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Competition request failed." }));
    }
  })();
};
