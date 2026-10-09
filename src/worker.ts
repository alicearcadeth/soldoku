import { createHash } from "node:crypto";
import { feedbackAllowed, feedbackNote } from "./coach/feedback";
import { playEvent } from "./coach/play";
import { runCoach } from "./coach/run";
import { verifyClassic, verifyHistoryList, verifyName } from "./match/identity";
import { decideQuote, orderUrl } from "./solana/dflow";
import { cardFundingCapabilities, disabledProductionAdapter } from "./solana/cardFunding";
import { ensureCardFundingTables } from "./solana/cardFundingPersist";
import { capabilityBody, sandboxSessionBody, webhookBody } from "./solana/fundingProviders";
import { applySettleSignatures, settledChainUpdate, settleSignaturesIn } from "./solana/recover";
import { createCompetitionStore } from "./competition/store";
import { advanceRoomSettlement, mergeSettlementFields, type SettlementPersist } from "./competition/settlement";
import { marketTokens } from "./competition/market";
import { competitionChain, type CompetitionEnvironment } from "./competition/chain";
import { prepareCompetitionRequest, type CompetitionRequest } from "./competition/funded";

type Statement = {
  bind: (...values: unknown[]) => Statement;
  first: <T>() => Promise<T | null>;
  all: <T>() => Promise<{ results: T[] }>;
  run: () => Promise<{ meta?: { changes?: number } }>;
};

type Env = CompetitionEnvironment & {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  DB: { prepare: (sql: string) => Statement };
  SOLANA_RPC?: string;
  SOLANA_CLUSTER?: string;
  SUDOKU_MINT?: string;
  SUDOKU_AUTHORITY_KEY?: string;
  SUDOKU_ESCROW_PROGRAM_ID?: string;
  SUDOKU_ESCROW_V2?: string;
  SUDOKU_STAGING?: string;
  GEMINI_API_KEY?: string;
  JUPITER_API_KEY?: string;
  DFLOW_QUOTE_URL?: string;
  DFLOW_API_KEY?: string;
  MOONPAY_PUBLISHABLE_KEY?: string;
  MOONPAY_SECRET_KEY?: string;
  MOONPAY_WEBHOOK_KEY?: string;
  FIAT_FUNDING_MODE?: string;
};

let api: Promise<typeof import("./match/plugin")> | null = null;

function loadApi(env: Env) {
  if (env.SOLANA_RPC) process.env.SOLANA_RPC = env.SOLANA_RPC;
  if (env.SOLANA_CLUSTER) process.env.SOLANA_CLUSTER = env.SOLANA_CLUSTER;
  if (env.SUDOKU_MINT) process.env.SUDOKU_MINT = env.SUDOKU_MINT;
  if (env.SUDOKU_AUTHORITY_KEY) process.env.SUDOKU_AUTHORITY_KEY = env.SUDOKU_AUTHORITY_KEY;
  if (env.SUDOKU_ESCROW_PROGRAM_ID) process.env.SUDOKU_ESCROW_PROGRAM_ID = env.SUDOKU_ESCROW_PROGRAM_ID;
  if (env.SUDOKU_ESCROW_V2) process.env.SUDOKU_ESCROW_V2 = env.SUDOKU_ESCROW_V2;
  if (env.SUDOKU_STAGING) process.env.SUDOKU_STAGING = env.SUDOKU_STAGING;
  api ??= import("./match/plugin");
  return api;
}

export default {
  async scheduled(_event: { cron?: string }, env: Env): Promise<void> {
    await settleDueCompetitions(env);
  },
  async fetch(request: Request, env: Env): Promise<Response> {
    return withSecurityHeaders(await handleFetch(request, env));
  },
};

async function handleFetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/release") {
      if (request.method !== "GET") return Response.json({ error: "Use GET for release information." }, { status: 405 });
      const manifest = await env.ASSETS.fetch(new Request(new URL("/release.json", url)));
      if (!manifest.ok || !manifest.headers.get("content-type")?.includes("json")) {
        return Response.json({ error: "Release manifest unavailable. Rebuild the app before deploying." }, { status: 503 });
      }
      const headers = new Headers(manifest.headers);
      headers.set("cache-control", "no-store");
      return new Response(manifest.body, { status: manifest.status, headers });
    }
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (url.pathname === "/api/tokens" || url.pathname.startsWith("/api/competitions")) return competitions(request, env);
    if (url.pathname === "/api/coach") return coach(request, env);
    if (url.pathname === "/api/feedback") return feedback(request, env);
    if (url.pathname === "/api/play") return play(request, env);
    if (url.pathname === "/api/profile") return profile(request, env);
    if (url.pathname === "/api/history") return saveHistory(request, env);
    if (url.pathname === "/api/classic") return saveClassic(request, env);
    if (url.pathname === "/api/quote") return dflowQuote(request, env);
    if (url.pathname === "/api/funding/capabilities") return Response.json(capabilityBody(env));
    if (url.pathname === "/api/funding/session") return fundingSession(request, env);
    if (url.pathname === "/api/funding/webhook") return fundingWebhook(request, env);
    if (url.pathname === "/api/funding/card") return cardFundingDisabled(request, env);
    try {
      const matches = await loadApi(env);
      const body = request.method === "GET" ? {} : await request.json().catch(() => ({}));
      await ensureSettle(env);
      let conflict = true;
      for (let attempt = 0; attempt < 4 && conflict; attempt++) {
        const row = await env.DB.prepare("SELECT body FROM matches WHERE id = 1").first<{ body: string }>();
        const before = row?.body ?? "";
        const saved = await settleTable(env);
        matches.replaceMatches(applySettleSignatures(before, saved) || null);
        try {
          const result = await matches.handleMatchRequest(request.method, url, body as Record<string, unknown>);
          const next = await rememberSettleSignatures(env, matches.snapshotMatches(), saved);
          const written = await env.DB.prepare(
            "INSERT INTO matches (id, body) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET body = excluded.body WHERE body = ?",
          ).bind(next, before).run();
          conflict = (written.meta?.changes ?? 0) < 1;
          if (!conflict) {
            const chainUpdate = settledChainUpdate(result);
            if (chainUpdate) {
              await ensureProfiles(env);
              await env.DB.prepare(
                "UPDATE results SET chain = ? WHERE code = ? AND (chain IS NULL OR chain = 'pending')",
              ).bind(chainUpdate.chain, chainUpdate.code).run();
            }
            return Response.json(result);
          }
        } catch (error) {
          await rememberSettleSignatures(env, matches.snapshotMatches(), saved);
          throw error;
        }
      }
      return Response.json({ error: "Match state changed. Retry the same request." }, { status: 409 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed";
      return Response.json({ error: message }, { status: 400 });
    }
}

function nullBodyStatus(status: number): boolean {
  return status === 101 || status === 204 || status === 205 || status === 304;
}

async function withSecurityHeaders(response: Response): Promise<Response> {
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "no-referrer");
  if (nullBodyStatus(response.status)) {
    return new Response(null, { status: response.status, statusText: response.statusText, headers });
  }
  const type = headers.get("content-type") ?? "";
  if (type.includes("text/html")) {
    const html = await response.clone().text();
    const script = html.match(/<script>([\s\S]*?)<\/script>/);
    const hash = script ? createHash("sha256").update(script[1].replaceAll("\r\n", "\n")).digest("base64") : "";
    headers.set("content-security-policy", `script-src 'self'${hash ? ` 'sha256-${hash}'` : ""}; frame-ancestors 'none'`);
    return new Response(html, { status: response.status, statusText: response.statusText, headers });
  }
  if (!headers.get("content-security-policy")?.includes("frame-ancestors")) headers.set("content-security-policy", "frame-ancestors 'none'");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function finishCompetition(env: Env, store: { snapshot(): string }, prepared: CompetitionRequest, stored: string | null): Promise<Response> {
  const headers = { "cache-control": "no-store" };
  if (!prepared.afterCommit) return Response.json(prepared.result, { headers });
  try {
    const payload = await prepared.afterCommit();
    await persistCompetitionSnapshot(env, store.snapshot(), stored);
    return Response.json(payload, { headers });
  } catch (error) {
    await persistCompetitionSnapshot(env, store.snapshot(), stored);
    throw error;
  }
}

async function persistCompetitionSnapshot(env: Env, next: string, expected: string | null): Promise<"saved" | "conflict" | "unchanged" | "error"> {
  if (next === expected) return "unchanged";
  try {
    const written = await env.DB.prepare("INSERT INTO competition_state (id, body) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET body = excluded.body WHERE body = ?").bind(next, expected ?? "").run();
    if ((written.meta?.changes ?? 0) < 1) return "conflict";
    return "saved";
  } catch {
    return "error";
  }
}

function competitionPersist(env: Env, store: { snapshot(): string; replace(raw: string | null): void }, expected: { body: string | null }, codes: string[]): SettlementPersist {
  return async () => {
    const status = await persistCompetitionSnapshot(env, store.snapshot(), expected.body);
    if (status === "saved") { expected.body = store.snapshot(); return "saved"; }
    if (status === "unchanged") return "saved";
    if (status !== "conflict") return "error";
    const fresh = await env.DB.prepare("SELECT body FROM competition_state WHERE id = 1").first<{ body: string }>();
    const base = fresh?.body ?? "";
    if (!base) return "conflict";
    store.replace(mergeSettlementFields(base, store.snapshot(), codes));
    const retry = await persistCompetitionSnapshot(env, store.snapshot(), base);
    if (retry === "saved" || retry === "unchanged") { expected.body = store.snapshot(); return "saved"; }
    return "conflict";
  };
}

async function settleDueCompetitions(env: Env): Promise<{ settled: string[] }> {
  const chain = competitionChain(env);
  const prepareSettlement = chain?.prepareSettlement;
  const broadcastSettlement = chain?.broadcastSettlement;
  const observeSettlement = chain?.observeSettlement;
  if (!chain || !prepareSettlement || !broadcastSettlement || !observeSettlement) return { settled: [] };
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS competition_state (id INTEGER PRIMARY KEY, body TEXT NOT NULL)").run();
  const row = await env.DB.prepare("SELECT body FROM competition_state WHERE id = 1").first<{ body: string }>();
  const store = createCompetitionStore(Date.now, undefined, chain.config);
  store.replace(row?.body ?? null);
  const expected = { body: row?.body ?? null };
  const settled: string[] = [];
  for (const code of [...new Set([...store.dueSettlementCodes(), ...store.receiptReconciliationCodes()])]) {
    const report = await advanceRoomSettlement(store, { read: chain.read, prepareSettlement, broadcastSettlement, observeSettlement }, code, competitionPersist(env, store, expected, [code]), Date.now());
    if (report.confirmed) settled.push(code);
  }
  return { settled };
}

async function competitions(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    if (url.pathname === "/api/tokens") {
      if (request.method !== "GET") throw new Error("Use GET for token prices.");
      return Response.json({ tokens: await marketTokens(url.searchParams.get("q") ?? "", url.searchParams.get("mint") ?? undefined, env.JUPITER_API_KEY), registryEnabled: Boolean(env.JUPITER_API_KEY), source: "DEX Screener", refreshSeconds: 30 }, { headers: { "cache-control": "no-store" } });
    }
    const raw = request.method === "GET" ? "" : await request.text();
    if (raw.length > 16384) throw new Error("Request is too large.");
    const body = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    const chain = competitionChain(env);
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS competition_state (id INTEGER PRIMARY KEY, body TEXT NOT NULL)").run();
    for (let attempt = 0; attempt < 4; attempt++) {
      const row = await env.DB.prepare("SELECT body FROM competition_state WHERE id = 1").first<{ body: string }>();
      const store = createCompetitionStore(Date.now, undefined, chain?.config);
      store.replace(row?.body ?? null);
      const expected = { body: row?.body ?? null };
      const prepared = await prepareCompetitionRequest(store, chain, request.method, url, body, {
        paused: env.SUDOKU_COMPETITION_PAUSED === "1",
        persist: competitionPersist(env, store, expected, [String(body.code ?? "")]),
      });
      const next = store.snapshot();
      if (request.method === "GET" || next === row?.body) return await finishCompetition(env, store, prepared, row?.body ?? null);
      const written = await env.DB.prepare("INSERT INTO competition_state (id, body) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET body = excluded.body WHERE body = ?").bind(next, row?.body ?? "").run();
      if ((written.meta?.changes ?? 0) > 0) {
        expected.body = next;
        return await finishCompetition(env, store, prepared, next);
      }
    }
    return Response.json({ error: "Room changed. Try the action again." }, { status: 409 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Competition request failed." }, { status: 400 });
  }
}

let profilesReady: Promise<void> | null = null;

async function profile(request: Request, env: Env): Promise<Response> {
  await ensureProfiles(env);
  const url = new URL(request.url);
  if (request.method === "GET") {
    const wallet = url.searchParams.get("wallet") ?? "";
    const row = await env.DB.prepare("SELECT name FROM profiles WHERE wallet = ?").bind(wallet).first<{ name: string }>();
    return Response.json({ name: row?.name ?? null });
  }
  const body = await request.json().catch(() => ({})) as { wallet?: string; name?: string; signature?: string; at?: number };
  try {
    const name = verifyName(String(body.wallet ?? ""), String(body.name ?? ""), String(body.signature ?? ""), Number(body.at));
    await env.DB.prepare(
      "INSERT INTO profiles (wallet, name, updated) VALUES (?, ?, ?) ON CONFLICT(wallet) DO UPDATE SET name = excluded.name, updated = excluded.updated",
    ).bind(body.wallet, name, Date.now()).run();
    return Response.json({ name });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Name was not saved";
    return Response.json({ error: message }, { status: 400 });
  }
}

function ensureProfiles(env: Env): Promise<void> {
  profilesReady ??= env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS profiles (
      wallet TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      updated INTEGER NOT NULL
    )`,
  ).run().then(() => env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS results (
      wallet TEXT NOT NULL,
      code TEXT NOT NULL,
      mode TEXT NOT NULL,
      level TEXT NOT NULL,
      outcome TEXT NOT NULL,
      seconds INTEGER,
      chain TEXT,
      at INTEGER NOT NULL,
      PRIMARY KEY (wallet, code)
    )`,
  ).run()).then(() => env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS classic_totals (
      wallet TEXT PRIMARY KEY,
      completed INTEGER NOT NULL,
      updated INTEGER NOT NULL
    )`,
  ).run()).then(() => undefined);
  return profilesReady;
}

let settleReady: Promise<void> | null = null;

function ensureSettle(env: Env): Promise<void> {
  settleReady ??= env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS settle_signatures (
      code TEXT PRIMARY KEY,
      signature TEXT NOT NULL
    )`,
  ).run().then(() => undefined);
  return settleReady;
}

async function settleTable(env: Env): Promise<Record<string, string>> {
  const rows = await env.DB.prepare("SELECT code, signature FROM settle_signatures").all<{ code: string; signature: string }>();
  return Object.fromEntries(rows.results.map((row) => [row.code, row.signature]));
}

async function rememberSettleSignatures(env: Env, body: string, saved: Record<string, string>): Promise<string> {
  for (const item of settleSignaturesIn(body)) {
    await env.DB.prepare(
      "INSERT INTO settle_signatures (code, signature) VALUES (?, ?) ON CONFLICT(code) DO NOTHING",
    ).bind(item.code, item.signature).run();
    const stored = await env.DB.prepare("SELECT signature FROM settle_signatures WHERE code = ?").bind(item.code).first<{ signature: string }>();
    if (stored?.signature) saved[item.code] = stored.signature;
  }
  return applySettleSignatures(body, saved);
}

async function recentResults(env: Env, wallet: string) {
  return env.DB.prepare(
    "SELECT code, mode, level, outcome, seconds, chain, at FROM results WHERE wallet = ? ORDER BY at DESC LIMIT 20",
  ).bind(wallet).all<{ code: string; mode: string; level: string; outcome: string; seconds: number | null; chain: string | null; at: number }>();
}

async function profileTotals(env: Env, wallet: string) {
  const rows = await env.DB.prepare(
    "SELECT mode, outcome, COUNT(*) AS n FROM results WHERE wallet = ? GROUP BY mode, outcome",
  ).bind(wallet).all<{ mode: string; outcome: string; n: number }>();
  const tally = (mode: string) => {
    const pick = (outcome: string) => Number(rows.results.find((row) => row.mode === mode && row.outcome === outcome)?.n ?? 0);
    return { wins: pick("win"), losses: pick("loss"), draws: pick("draw") };
  };
  const classic = await env.DB.prepare("SELECT completed FROM classic_totals WHERE wallet = ?").bind(wallet).first<{ completed: number }>();
  return { practice: tally("practice"), competitive: tally("staked"), classicCompleted: classic?.completed ?? 0 };
}

async function dflowQuote(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return Response.json({ error: "A quote is requested, never sent on its own." }, { status: 405 });
  const body = await request.json().catch(() => ({})) as { inputMint?: string; outputMint?: string; amount?: string; stake?: string };
  const cluster = env.SOLANA_CLUSTER ?? "devnet";
  const inputMint = String(body.inputMint ?? "");
  const outputMint = String(body.outputMint ?? "");
  const stake = BigInt(body.stake ?? "0");
  const now = Date.now();
  if (!env.DFLOW_QUOTE_URL) {
    const decision = decideQuote({ cluster, configured: false, executionArmed: false, inputMint, outputMint, stake, wallet: null, order: null, now });
    return Response.json(decision.body, { status: decision.status });
  }
  const headers: Record<string, string> = { Accept: "application/json" };
  if (env.DFLOW_API_KEY) headers["x-api-key"] = env.DFLOW_API_KEY;
  const response = await fetch(orderUrl(env.DFLOW_QUOTE_URL, inputMint, outputMint, BigInt(body.amount ?? "0")), { headers });
  if (!response.ok) return Response.json({ enabled: false, executed: false, error: "The route was not available." }, { status: 502 });
  try {
    const order = await response.json() as Record<string, unknown>;
    const decision = decideQuote({
      cluster,
      configured: true,
      executionArmed: false,
      inputMint,
      outputMint,
      stake,
      wallet: null,
      order,
      now,
    });
    return Response.json(decision.body, { status: decision.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The quote was rejected";
    return Response.json({ enabled: false, executed: false, error: message }, { status: 400 });
  }
}

async function fundingSession(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return Response.json({ error: "A funding session is created by the server.", funded: false }, { status: 405 });
  const body = await request.json().catch(() => ({})) as { matchId?: string; wallet?: string; expectedAtomic?: string };
  const customerIp = request.headers.get("True-Client-IP") ?? request.headers.get("CF-Connecting-IP") ?? undefined;
  const result = await sandboxSessionBody(env, { ...body, customerIp });
  return Response.json(result.body, { status: result.status });
}

async function fundingWebhook(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return Response.json({ error: "Webhooks are posted by the provider.", funded: false }, { status: 405 });
  const result = await webhookBody(env, await request.text(), request.headers.get("Moonpay-Signature-V2"));
  return Response.json(result.body, { status: result.status });
}

/** Card checkout stays unavailable. Credentials or FIAT_FUNDING_MODE cannot open this route. */
async function cardFundingDisabled(request: Request, env: Env): Promise<Response> {
  // Schema is prepared early so later activation can persist without replacing the model.
  await ensureCardFundingTables(env.DB);
  const caps = cardFundingCapabilities(env.SOLANA_CLUSTER === "localnet" ? "localnet" : "devnet");
  if (request.method === "GET") {
    return Response.json({ ...caps, funded: false, admitsEntrant: false, persistenceReady: true }, { headers: { "cache-control": "no-store" } });
  }
  if (request.method !== "POST") {
    return Response.json({ error: "Card funding is unavailable.", funded: false, admitsEntrant: false }, { status: 405 });
  }
  try {
    const body = await request.json().catch(() => ({})) as {
      destinationWallet?: string; roomCode?: string; assetMint?: string; expectedBaseUnits?: string; registrationDeadlineAt?: number;
    };
    const adapter = disabledProductionAdapter();
    const opened = adapter.createCheckout({
      existing: null,
      sessionActor: null,
      destinationWallet: String(body.destinationWallet || "11111111111111111111111111111111"),
      roomCode: String(body.roomCode || "DISABLED"),
      cluster: env.SOLANA_CLUSTER === "localnet" ? "localnet" : "devnet",
      assetMint: String(body.assetMint ?? env.SUDOKU_COMPETITION_MINT ?? "BtdrgokAvXQE4yj3zS48c4ktnMSy3TGoRkHCWD5fV8U4"),
      assetDecimals: 6,
      expectedBaseUnits: BigInt(String(body.expectedBaseUnits ?? "1000000")),
      registrationDeadlineAt: typeof body.registrationDeadlineAt === "number" ? body.registrationDeadlineAt : null,
      nowMs: Date.now(),
    });
    return Response.json({
      error: opened.ok ? "Card funding unavailable." : opened.error,
      funded: false,
      admitsEntrant: false,
      available: false,
      externalExecution: false,
      intent: opened.ok ? null : opened.intent ?? null,
    }, { status: 403 });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "Card funding is unavailable.",
      funded: false,
      admitsEntrant: false,
      available: false,
      externalExecution: false,
    }, { status: 403 });
  }
}

async function saveClassic(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return Response.json({ error: "Classic totals are saved with a wallet signature." }, { status: 405 });
  try {
    const body = await request.json().catch(() => ({})) as { wallet?: string; completed?: number; signature?: string; at?: number };
    const wallet = String(body.wallet ?? "");
    await ensureProfiles(env);
    const current = await env.DB.prepare("SELECT completed FROM classic_totals WHERE wallet = ?").bind(wallet).first<{ completed: number }>();
    verifyClassic(wallet, Number(body.completed), String(body.signature ?? ""), Number(body.at), current?.completed ?? 0);
    await env.DB.prepare(
      "INSERT INTO classic_totals (wallet, completed, updated) VALUES (?, ?, ?) ON CONFLICT(wallet) DO UPDATE SET completed = excluded.completed, updated = excluded.updated",
    ).bind(wallet, Number(body.completed), Date.now()).run();
    return Response.json({ classicCompleted: Number(body.completed) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Classic total was not saved";
    return Response.json({ error: message }, { status: 400 });
  }
}

async function saveHistory(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json().catch(() => ({})) as { wallet?: string; code?: string; signature?: string; at?: number };
    const wallet = String(body.wallet ?? "");
    await ensureProfiles(env);
    if (!body.code) {
      verifyHistoryList(wallet, String(body.signature ?? ""), Number(body.at));
      const recent = await recentResults(env, wallet);
      return Response.json({ recent: recent.results, ...(await profileTotals(env, wallet)) });
    }
    const matches = await loadApi(env);
    const row = await env.DB.prepare("SELECT body FROM matches WHERE id = 1").first<{ body: string }>();
    matches.replaceMatches(row?.body ?? null);
    const result = await matches.handleMatchRequest("POST", new URL(request.url), body as Record<string, unknown>) as {
      summary: { code: string; mode: string; level: string; outcome: string; seconds: number | null; chain: string | null; at: number | null };
    };
    await ensureProfiles(env);
    const summary = result.summary;
    await env.DB.prepare(
      `INSERT INTO results (wallet, code, mode, level, outcome, seconds, chain, at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(wallet, code) DO UPDATE SET
         outcome = excluded.outcome,
         seconds = excluded.seconds,
         chain = excluded.chain`,
    ).bind(wallet, summary.code, summary.mode, summary.level, summary.outcome, summary.seconds, summary.chain, summary.at ?? Date.now()).run();
    const recent = await recentResults(env, wallet);
    return Response.json({ summary, recent: recent.results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "History was not saved";
    return Response.json({ error: message }, { status: 400 });
  }
}

const coachHits = new Map<string, number[]>();
const coachCache = new Map<string, string>();
const feedbackHits = new Map<string, number[]>();
let usageReady: Promise<void> | null = null;

const PLAY_COLUMNS = [
  "classic_started",
  "classic_completed",
  "completed_with_hint",
  "completed_with_reveal",
  "hint_stage1",
  "hint_stage2",
  "coach_requests",
  "coach_gemini",
  "coach_fallback",
  "coach_cache",
  "gemini_errors",
  "gemini_ms",
  "gemini_calls",
  "hint_sum",
  "mistake_sum",
  "second_sum",
  "player_started",
  "player_completed",
  "player_with_hint",
  "player_with_reveal",
  "check_started",
  "check_completed",
] as const;

async function coach(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return Response.json({ error: "Coach accepts a short note only." }, { status: 405 });
  const raw = await request.text();
  if (raw.length > 800) return Response.json({ error: "That note is too long." }, { status: 400 });
  let body: unknown;
  try {
    body = JSON.parse(raw) as unknown;
  } catch {
    return Response.json({ error: "Coach needs a short note." }, { status: 400 });
  }
  const now = Date.now();
  const bucket = await bucketId(request.headers.get("cf-connecting-ip") ?? "local", now);
  const dailyCalls = await geminiCalls(env);
  const result = await runCoach(body, {
    now,
    bucket,
    hits: coachHits,
    cache: coachCache,
    key: env.GEMINI_API_KEY,
    dailyCalls,
    fetchImpl: (input, init) => fetch(input, init),
  });
  if (result.status === 400) return Response.json({ error: "Coach does not take a puzzle." }, { status: 400 });
  await bump(env, "coach_requests", 1);
  if (result.source === "cache") await bump(env, "coach_cache", 1);
  if (result.source === "local" && result.status === 200) await bump(env, "coach_fallback", 1);
  if (result.gemini) {
    await bump(env, "gemini_calls", 1);
    await bump(env, "gemini_ms", result.ms);
    if (result.source === "gemini") await bump(env, "coach_gemini", 1);
    if (result.error) await bump(env, "gemini_errors", 1);
  }
  return Response.json({ text: result.text, source: result.source }, { status: result.status });
}

async function feedback(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return Response.json({ error: "Send a short note." }, { status: 405 });
  const raw = await request.text();
  if (raw.length > 1200) return Response.json({ error: "That note is too long." }, { status: 400 });
  let body: unknown;
  try {
    body = JSON.parse(raw) as unknown;
  } catch {
    return Response.json({ error: "Send a short note." }, { status: 400 });
  }
  const note = feedbackNote(body);
  if (!note) return Response.json({ error: "Write a short description of what happened." }, { status: 400 });
  const now = Date.now();
  const bucket = await bucketId(request.headers.get("cf-connecting-ip") ?? "local", now);
  const gate = feedbackAllowed(feedbackHits.get(bucket) ?? [], now);
  feedbackHits.set(bucket, gate.next);
  if (!gate.ok) return Response.json({ error: "That is enough reports for now. Try again later." }, { status: 429 });
  await ensureFeedback(env);
  await env.DB.prepare("INSERT INTO feedback_notes (at, note) VALUES (?, ?)").bind(now, note).run();
  await env.DB.prepare(
    "DELETE FROM feedback_notes WHERE id < COALESCE((SELECT id FROM feedback_notes ORDER BY id DESC LIMIT 1 OFFSET 199), 0)",
  ).run();
  return Response.json({ ok: true });
}

async function play(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return Response.json({ error: "Play accepts a short event." }, { status: 405 });
  const raw = await request.text();
  if (raw.length > 400) return Response.json({ error: "That event is too long." }, { status: 400 });
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return Response.json({ error: "Play needs a short event." }, { status: 400 });
  }
  const event = playEvent(parsed);
  if (!event) return Response.json({ error: "That event is not counted." }, { status: 400 });
  const player = event.audience === "player";
  if (event.event === "start") await bump(env, player ? "player_started" : "check_started", 1);
  if (event.event === "hint" && event.stage === 1) await bump(env, "hint_stage1", 1);
  if (event.event === "hint" && event.stage === 2) await bump(env, "hint_stage2", 1);
  if (event.event === "finish") {
    await bump(env, player ? "player_completed" : "check_completed", 1);
    if (player && event.hints > 0) await bump(env, "player_with_hint", 1);
    if (player && event.reveals > 0) await bump(env, "player_with_reveal", 1);
    if (player) {
      await bump(env, "hint_sum", event.hints);
      await bump(env, "mistake_sum", event.mistakes);
      await bump(env, "second_sum", event.seconds);
    }
  }
  return Response.json({ ok: true });
}

async function bucketId(ip: string, now: number): Promise<string> {
  const day = new Date(now).toISOString().slice(0, 10);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${ip}|${day}|sudoku-coach`));
  return [...new Uint8Array(digest).slice(0, 6)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function geminiCalls(env: Env): Promise<number> {
  try {
    await ensureUsage(env);
    const day = new Date().toISOString().slice(0, 10);
    const row = await env.DB.prepare("SELECT gemini_calls FROM play_daily WHERE day = ?").bind(day).first<{ gemini_calls: number }>();
    return row?.gemini_calls ?? 0;
  } catch {
    return 0;
  }
}

async function bump(env: Env, column: (typeof PLAY_COLUMNS)[number], amount: number) {
  if (!PLAY_COLUMNS.includes(column) || amount <= 0) return;
  try {
    await ensureUsage(env);
    const day = new Date().toISOString().slice(0, 10);
    await env.DB.prepare(
      `INSERT INTO play_daily (day, ${column}) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET ${column} = ${column} + excluded.${column}`,
    ).bind(day, amount).run();
  } catch {
    usageReady = null;
  }
}

let feedbackReady: Promise<void> | null = null;

function ensureFeedback(env: Env): Promise<void> {
  feedbackReady ??= env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS feedback_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at INTEGER NOT NULL,
      note TEXT NOT NULL
    )`,
  ).run().then(() => undefined);
  return feedbackReady;
}

function ensureUsage(env: Env): Promise<void> {
  usageReady ??= env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS play_daily (
      day TEXT PRIMARY KEY,
      classic_started INTEGER NOT NULL DEFAULT 0,
      classic_completed INTEGER NOT NULL DEFAULT 0,
      completed_with_hint INTEGER NOT NULL DEFAULT 0,
      completed_with_reveal INTEGER NOT NULL DEFAULT 0,
      hint_stage1 INTEGER NOT NULL DEFAULT 0,
      hint_stage2 INTEGER NOT NULL DEFAULT 0,
      coach_requests INTEGER NOT NULL DEFAULT 0,
      coach_gemini INTEGER NOT NULL DEFAULT 0,
      coach_fallback INTEGER NOT NULL DEFAULT 0,
      coach_cache INTEGER NOT NULL DEFAULT 0,
      gemini_errors INTEGER NOT NULL DEFAULT 0,
      gemini_ms INTEGER NOT NULL DEFAULT 0,
      gemini_calls INTEGER NOT NULL DEFAULT 0,
      hint_sum INTEGER NOT NULL DEFAULT 0,
      mistake_sum INTEGER NOT NULL DEFAULT 0,
      second_sum INTEGER NOT NULL DEFAULT 0
    )`,
  ).run().then(async () => {
    for (const column of ["player_started", "player_completed", "player_with_hint", "player_with_reveal", "check_started", "check_completed"]) {
      await env.DB.prepare(`ALTER TABLE play_daily ADD COLUMN ${column} INTEGER NOT NULL DEFAULT 0`).run().catch(() => undefined);
    }
  });
  return usageReady;
}

