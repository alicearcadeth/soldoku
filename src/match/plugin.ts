import type { Connect, Plugin } from "vite";
import type { Level } from "../engine/types";
import { join } from "node:path";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { settlementStep } from "../solana/recover";
import { verifyHistory } from "./identity";
import { assertDepositBound, buildCancel, buildClose, buildDeposit, chainConfig, coSignSubmittedDeposit, escrowStatus, fundPlayer, matchFunds, readBalances, settlementOpen, settleMatch, submitCancel, submitClose, submitDeposit, transactionStatus } from "../solana/desk";
import { ESCROW_PROGRAM_ID, STAGING_ESCROW_PROGRAM_ID, activeEscrowProgramId } from "../solana/program";
import { assertProposedPreset } from "../solana/stakePolicy";
import { createMatchStore } from "./rooms";

const store = createMatchStore(Date.now, false, process.env.SUDOKU_MATCH_STORE || join(process.cwd(), "data", "matches.json"));

export function matchApi(): Plugin {
  return {
    name: "sudoku-match-api",
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

const handler: Connect.NextHandleFunction = (req, res, next) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith("/api/")) return next();

  void (async () => {
    try {
      const body = await readBody(req);
      const result = await route(req.method ?? "GET", url, body);
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(result));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed";
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: message }));
    }
  })();
};

export function replaceMatches(raw: string | null) {
  store.replace(raw);
}

export function snapshotMatches() {
  return store.snapshot();
}

export async function handleMatchRequest(method: string, url: URL, body: Record<string, unknown>) {
  return route(method, url, body);
}

async function route(method: string, url: URL, body: Record<string, unknown>) {
  if (method === "GET" && url.pathname === "/api/chain") return chainConfig();
  if (method === "GET" && url.pathname === "/api/balances") return readBalances(url.searchParams.get("wallet") ?? "");
  if (method === "POST" && url.pathname === "/api/faucet") return fundPlayer(String(body.pubkey ?? ""));
  if (method === "POST" && url.pathname === "/api/captcha") return store.issueCaptcha();
  if (method === "POST" && url.pathname === "/api/captcha/check") {
    return { ok: store.checkCaptcha(String(body.id ?? ""), Number(body.value)) };
  }
  if (method === "POST" && url.pathname === "/api/rooms") {
    const wallet = body.wallet ? String(body.wallet) : undefined;
    const short = body.short === true && chainConfig().localnet;
    const practice = body.practice === true;
    if (wallet && !practice && process.env.SUDOKU_FUNDING_PAUSED === "1") {
      throw new Error("New paid rooms are paused");
    }
    const stake = wallet && !practice && chainConfig().cluster === "mainnet-beta" ? assertProposedPreset(body.stake).toString() : body.stake;
    const mint = wallet && !practice ? chainConfig().mint : undefined;
    return store.createRoom(body.level as Level, String(body.captchaId ?? ""), wallet, short ? 30_000 : undefined, practice, stake, mint);
  }
  if (method === "POST" && url.pathname === "/api/rooms/quick") {
    return store.quickMatch(body.level as Level, String(body.captchaId ?? ""));
  }
  if (method === "GET" && url.pathname === "/api/rooms/open") {
    return { rooms: store.listOpen() };
  }
  if (method === "POST" && url.pathname === "/api/rooms/join") {
    const wallet = body.wallet ? String(body.wallet) : undefined;
    return store.joinRoom(String(body.code ?? ""), String(body.captchaId ?? ""), wallet);
  }
  if (method === "POST" && url.pathname === "/api/rooms/deposit") {
    return confirmDeposit(String(body.code ?? ""), String(body.playerId ?? ""), String(body.tx ?? ""));
  }
  if (method === "POST" && url.pathname === "/api/rooms/prepare") {
    return await prepare(String(body.code ?? ""), String(body.playerId ?? ""));
  }
  if (method === "POST" && url.pathname === "/api/rooms/refund") {
    return confirmRefund(String(body.code ?? ""), String(body.playerId ?? ""), String(body.tx ?? ""));
  }
  if (method === "POST" && url.pathname === "/api/rooms/fail-settle" && chainConfig().localnet) {
    failSettleOnce.add(String(body.code ?? "").toUpperCase());
    return { ok: true };
  }
  if (method === "POST" && url.pathname === "/api/history") {
    const wallet = String(body.wallet ?? "");
    const code = String(body.code ?? "");
    verifyHistory(wallet, code, String(body.signature ?? ""), Number(body.at));
    return { summary: store.historyFor(code, wallet) };
  }
  if (method === "POST" && url.pathname === "/api/rooms/claim") {
    return claim(String(body.code ?? ""), String(body.wallet ?? ""), String(body.signature ?? ""));
  }
  if (method === "GET" && url.pathname === "/api/rooms/funds") {
    const info = store.stakeInfo(url.searchParams.get("code") ?? "");
    if (!info?.wallets[0]) throw new Error("This room has no stake");
    const funds = await matchFunds(info.matchId, info.wallets[0], info.wallets[1] ?? null, info.programId);
    return { signature: null, ...funds, chain: info.chain, settleSignature: info.settleSignature };
  }
  if (method === "POST" && url.pathname === "/api/rooms/prepare-refund") {
    return await prepareRefund(String(body.code ?? ""), String(body.playerId ?? ""));
  }
  if (method === "POST" && url.pathname === "/api/rooms/prepare-close") {
    return await prepareClose(String(body.code ?? ""), String(body.playerId ?? ""));
  }
  if (method === "POST" && url.pathname === "/api/rooms/close") {
    return await confirmClose(String(body.code ?? ""), String(body.playerId ?? ""), String(body.tx ?? ""));
  }
  if (method === "POST" && url.pathname === "/api/rooms/move") {
    return store.move(String(body.code ?? ""), String(body.playerId ?? ""), body.values as number[]);
  }
  if (method === "GET" && url.pathname === "/api/rooms/state") {
    const code = url.searchParams.get("code") ?? "";
    const playerId = url.searchParams.get("playerId") ?? "";
    const view = store.state(code, playerId);
    if (view.verdict && view.chain === "pending") {
      try {
        await trySettle(code);
      } catch {
        // Leave the room pending so the next poll can retry a confirmed settlement.
      }
    }
    return store.state(code, playerId);
  }
  if (method === "GET" && url.pathname === "/api/rooms/solution") {
    const reveal = process.env.SUDOKU_REVEAL;
    if (!chainConfig().localnet || !reveal || url.searchParams.get("reveal") !== reveal) {
      throw new Error("Unknown request");
    }
    return { solution: store.localSolution(url.searchParams.get("code") ?? "") };
  }
  throw new Error("Unknown request");
}

async function rejectRetiredLegacyOpen(info: { programId: string; matchId: string; deposited: boolean[] }) {
  if (info.programId !== ESCROW_PROGRAM_ID || info.deposited.some(Boolean)) return;
  if (activeEscrowProgramId() === ESCROW_PROGRAM_ID) return;
  if ((await escrowStatus(info.matchId, info.programId)) != null) return;
  throw new Error("This room expired before it was funded. Create a new room.");
}

async function prepare(code: string, playerId: string) {
  const info = store.stakeInfo(code);
  const view = store.state(code, playerId);
  if (!info || !view.you.wallet) throw new Error("This room has no stake");
  await rejectRetiredLegacyOpen(info);
  const role = info.wallets[0] === view.you.wallet ? "open" : "join";
  return buildDeposit(info.matchId, view.you.wallet, role, info.limitMs, info.programId, BigInt(info.stake));
}

function claim(code: string, wallet: string, signature: string) {
  const message = new TextEncoder().encode(`sudoku-seat:${code}:${wallet}`);
  const ok = nacl.sign.detached.verify(message, bs58.decode(signature), bs58.decode(wallet));
  if (!ok) throw new Error("Wallet proof was rejected");
  return store.claimSeat(code, wallet);
}

function seatedWallet(code: string, playerId: string) {
  const info = store.stakeInfo(code);
  const index = info?.playerIds.indexOf(playerId) ?? -1;
  const wallet = index >= 0 ? info?.wallets[index] : null;
  return { info, wallet };
}

async function prepareRefund(code: string, playerId: string) {
  const { info, wallet } = seatedWallet(code, playerId);
  if (!info || !wallet || !info.wallets[0]) throw new Error("This room has no stake");
  return buildCancel(info.matchId, info.wallets[0], info.wallets[1] ?? null, wallet, info.programId);
}

async function prepareClose(code: string, playerId: string) {
  const { info, wallet } = seatedWallet(code, playerId);
  if (!info || !wallet || !info.wallets[0]) throw new Error("This room has no stake");
  if (wallet !== info.wallets[0]) throw new Error("Only the player who opened the match can close it");
  const config = chainConfig();
  if (!config.localnet && info.programId !== STAGING_ESCROW_PROGRAM_ID) {
    throw new Error("This program has no Close instruction");
  }
  return buildClose(info.matchId, info.wallets[0], wallet, info.programId);
}

async function confirmClose(code: string, playerId: string, tx: string) {
  const prepared = await prepareClose(code, playerId);
  if (!prepared.tx) throw new Error("The match account is already closed");
  const result = await submitClose(tx, prepared.pda);
  store.noteClose(code, result.signature);
  return { ...result, ...store.state(code, playerId) };
}

async function confirmRefund(code: string, playerId: string, tx: string) {
  const { info, wallet } = seatedWallet(code, playerId);
  if (!info || !wallet || !info.wallets[0]) throw new Error("This room has no stake");
  const built = await buildCancel(info.matchId, info.wallets[0], info.wallets[1] ?? null, wallet, info.programId);
  const result = await submitCancel(tx, built.pda, built.token, BigInt(built.before));
  store.noteSettlement(code, "refunded");
  return { ...result, ...store.state(code, playerId) };
}

async function confirmDeposit(code: string, playerId: string, tx: string) {
  const info = store.stakeInfo(code);
  const view = store.state(code, playerId);
  if (!info || !view.you.wallet) throw new Error("This room has no stake");
  const role = info.wallets[0] === view.you.wallet ? "open" : "join";
  const stake = BigInt(info.stake);
  const built = await buildDeposit(info.matchId, view.you.wallet, role, info.limitMs, info.programId, stake);
  const expected = role === "open" ? stake : stake * 2n;
  const signed = role === "open"
    ? await coSignSubmittedDeposit(tx, info.matchId, view.you.wallet, info.limitMs, info.programId, stake)
    : tx;
  const signature = await submitDeposit(signed, built.vault, expected);
  await assertDepositBound(info.matchId, view.you.wallet, role, info.programId, stake);
  return { signature, ...store.markDeposit(code, playerId) };
}

const settling = new Set<string>();
const failSettleOnce = new Set<string>();

async function trySettle(code: string) {
  if (settling.has(code)) return;
  const info = store.stakeInfo(code);
  if (!info || info.chain !== "pending" || !info.verdict || info.wallets.length < 2) return;
  const [walletA, walletB] = info.wallets;
  if (!walletA || !walletB) return;
  settling.add(code);
  if (failSettleOnce.delete(code.toUpperCase())) {
    settling.delete(code);
    store.noteFailure(code);
    throw new Error("Settlement was not confirmed");
  }
  const outcome = info.verdict.outcome === "draw" ? 3 : info.verdict.winnerId === info.playerIds[0] ? 1 : 2;
  try {
    const status = await escrowStatus(info.matchId, info.programId);
    const known = info.settleSignature ? await transactionStatus(info.settleSignature) : "none";
    const step = settlementStep(status, known);
    if (step === "done") {
      store.noteSettlement(code);
      settling.delete(code);
      return;
    }
    if (step === "wait") {
      settling.delete(code);
      throw new Error("Settlement status is unknown. The same signature will be checked again.");
    }
    if (!(await settlementOpen(info.matchId, info.programId))) {
      settling.delete(code);
      return;
    }
    const signature = await settleMatch(info.matchId, walletA, walletB, outcome, info.programId);
    if (signature !== "already-settled") store.noteSettleSignature(code, signature);
    if (signature === "already-settled" || (await escrowStatus(info.matchId, info.programId)) === 2) {
      store.noteSettlement(code);
      settling.delete(code);
      return;
    }
    settling.delete(code);
    throw new Error("Settlement status is unknown. The same signature will be checked again.");
  } catch (error) {
    settling.delete(code);
    const signature = error instanceof Error && "signature" in error ? String((error as { signature?: string }).signature ?? "") : "";
    if (signature) store.noteSettleSignature(code, signature);
    else if (!(error instanceof Error && /same signature/i.test(error.message))) store.noteFailure(code);
    throw error;
  }
}

function readBody(req: Connect.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>);
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}
