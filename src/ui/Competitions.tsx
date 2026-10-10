import { WinCelebration } from "./WinCelebration";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Brand } from "./Brand";
import bs58 from "bs58";
import { LEVELS, type Level } from "../engine/types";
import { DAY_MS, elapsedLabel, usdLabel, type CompetitionSummary, type CompetitionView, type MarketToken, type FundedConfig } from "../competition/types";
import { connectedAddress, signPlayMessage, signPlayTransaction, setPlayChain } from "../solana/browserWallet";
import { roomCodeFromUrl, roomUrl, stakeBaseUnits, tokenUnitsLabel } from "../competition/roomLink";
import type { PreparedCompetitionTransaction, SettlementObservation } from "../competition/chain";
import { blockSecondApproval, readPending, recoveryMessage, rememberPending, signedTransactionIdentity, storageFailureMessage, writePending, type PendingEscrow } from "../competition/pendingTx";
import { cellLabel } from "./boardInput";
import { DialogFrame } from "./dialogFocus";
import { SettingsSheet } from "./SettingsSheet";
import { AddFunds } from "./AddFunds";
import { TokenStake } from "./TokenStake";
import { useWalletSession } from "./WalletSession";

type Session = { actor: string; wallet: string; expires: number };
async function api<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  let response: Response;
  try { response = await fetch(path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined); }
  catch { throw new Error("Cannot reach the competition server. Check your connection and try again."); }
  let result: T & { error?: string };
  try { result = await response.json() as T & { error?: string }; }
  catch { throw new Error(`The competition server returned an unexpected response (${response.status}). Try again.`); }
  if (!response.ok) throw new Error(result.error ?? "Request failed. Try again.");
  return result;
}
function sessionFor(wallet: string | null): Session | null {
  try {
    const value = JSON.parse(localStorage.getItem("sudoku.competitionSession") ?? "null") as Session | null;
    return value && value.wallet === wallet && value.expires > Date.now() + 5000 ? value : null;
  } catch { return null; }
}
function Duration({ value, onChange, funded = false }: { value: number; onChange: (ms: number) => void; funded?: boolean }) {
  const [custom, setCustom] = useState(value !== DAY_MS && value !== 7 * DAY_MS);
  const [amount, setAmount] = useState("2");
  const [unit, setUnit] = useState(DAY_MS);
  return <section className="stack" aria-label="Competition period">
    <div className="tools" role="group" aria-label="Duration">
      <button type="button" aria-pressed={!custom && value === DAY_MS} className={!custom && value === DAY_MS ? "on" : ""} onClick={() => { setCustom(false); onChange(DAY_MS); }}>1 Day</button>
      <button type="button" aria-pressed={!custom && value === 7 * DAY_MS} className={!custom && value === 7 * DAY_MS ? "on" : ""} onClick={() => { setCustom(false); onChange(7 * DAY_MS); }}>1 Week</button>
      <button type="button" aria-pressed={custom} className={custom ? "on" : ""} onClick={() => { setCustom(true); onChange(Math.round(Number(amount) * unit)); }}>Custom Duration</button>
    </div>
    {custom && <div className="amount-fields"><label>Duration<input className="form-input" aria-label="Custom duration" type="number" min="1" value={amount} onChange={event => { setAmount(event.target.value); onChange(Math.round(Number(event.target.value) * unit)); }} /></label><label>Unit<select className="form-input" aria-label="Duration unit" value={unit} onChange={event => { const next = Number(event.target.value); setUnit(next); onChange(Math.round(Number(amount) * next)); }}><option value={60000}>Minutes</option><option value={3600000}>Hours</option><option value={DAY_MS}>Days</option></select></label></div>}
    <p className="choice-note">{funded ? "Everyone starts together when registration closes." : "Your timer starts when you start your game."}</p>
  </section>;
}
function durationText(ms: number) { return ms % DAY_MS === 0 ? `${ms / DAY_MS} day${ms === DAY_MS ? "" : "s"}` : ms % 3600000 === 0 ? `${ms / 3600000} hours` : ms % 60000 === 0 ? `${ms / 60000} minutes` : `${Math.floor(ms / 60000)}m ${Math.round(ms % 60000 / 1000)}s`; }
function TesterFunds({ busy, note, faucet, onRequest }: { busy: boolean; note: string | null; faucet: boolean; onRequest: () => void }) {
  return <section className="stack" aria-label="Get test funds">
    <h2>Get test funds</h2>
    <p className="choice-note">SOL covers fees; TEST covers your stake. Both have no cash value. One request per day.</p>
    <p className="choice-note">Need SOL? Try <a href="https://faucet.solana.com" target="_blank" rel="noreferrer">faucet.solana.com</a>.</p>
    {!faucet && <p className="banner">TEST minting is not enabled on this server yet. A SOL request still runs.</p>}
    <button type="button" className="secondary" disabled={busy} onClick={onRequest}>Get test funds</button>
    {note && <p role="status">{note}</p>}
  </section>;
}
function escrowNotice(room: CompetitionView, now: number) {
  const funded = room.funded!;
  if (funded.chainStatus === "paid") return "Winner payout is complete.";
  if (funded.chainStatus === "awarded") return "Result finalized. The winner can claim the escrow prize.";
  if (funded.chainStatus === "refunding") return "Refunds are available. Each entrant can reclaim their own stake.";
  if (now < funded.startsAt) return `Registration closes and competition starts in ${elapsedLabel(funded.startsAt - now)}.`;
  if (funded.chainStatus === "pending") return "Registration closed without a creator deposit. No stakes were taken.";
  if (funded.chainTime < funded.startsAt) return "Confirming the registration cutoff on-chain. The shared grid will unlock shortly.";
  if (room.participants < 2) return "No opponent joined. The creator can reclaim their stake.";
  if (now < room.endsAt) return `Competition closes in ${elapsedLabel(room.endsAt - now)}.`;
  if (funded.chainTime >= funded.refundAt) return "Settlement timed out. Each entrant can reclaim their stake.";
  return "Competition closed. Settlement runs automatically. You can also finalize the result now.";
}
function RoomFacts({ room }: { room: CompetitionSummary }) {
  return <dl className="room-facts">
    <div><dt>Game mode</dt><dd>Sudoku · {room.level}</dd></div><div><dt>Token</dt><dd>{room.token?.symbol ?? "None · free entry"}</dd></div>
    <div><dt>Stake per player</dt><dd>{room.token ? `${room.stake} ${room.token.symbol}` : "0"}</dd></div><div><dt>{room.funded ? "Prize pool" : "Approx. USD"}</dt><dd>{room.funded ? `${tokenUnitsLabel((BigInt(room.funded.stakeUnits) * BigInt(room.participants)).toString(), room.funded.decimals)} TEST` : usdLabel(room.stake * (room.token?.priceUsd ?? 0))}</dd></div>
    <div><dt>{room.funded ? "Play window" : "Competition period"}</dt><dd>{durationText(room.funded ? room.endsAt - room.funded.startsAt : room.durationMs)}</dd></div><div><dt>Participants</dt><dd>{room.participants} · {room.funded ? "confirmed deposits" : "open entry"}</dd></div>
    <div><dt>Status</dt><dd>{room.funded ? room.funded.chainStatus === "pending" ? "Awaiting creator deposit" : room.funded.chainStatus === "paid" ? "Winner paid" : room.funded.chainStatus === "refunding" ? "Refunds available" : room.funded.chainStatus === "awarded" ? "Winner payout available" : Date.now() < room.funded.startsAt ? "Registration open" : room.status === "active" ? "Competition running" : "Awaiting settlement" : room.status === "active" ? "Active" : "Ended"}</dd></div><div><dt>Best completion</dt><dd>{room.bestMs === null ? "No finishes yet" : elapsedLabel(room.bestMs)}</dd></div>
  </dl>;
}
export function Competitions({ onHome, onLegacy }: { onHome: () => void; onLegacy: () => void }) {
  const wallet = useWalletSession();
  const [tab, setTab] = useState<"browse" | "create">("browse");
  const [mode, setMode] = useState<"free" | "tokens">("free");
  const [level, setLevel] = useState<Level>("medium");
  const [roomName, setRoomName] = useState("");
  const [period, setPeriod] = useState(DAY_MS);
  const [token, setToken] = useState<MarketToken | null>(null);
  const [stake, setStake] = useState("1");
  const [rooms, setRooms] = useState<CompetitionSummary[]>([]);
  const [code, setCode] = useState("");
  const [roomCode, setRoomCode] = useState<string | null>(() => roomCodeFromUrl(location.href) ?? localStorage.getItem("sudoku.competition"));
  const [room, setRoom] = useState<CompetitionView | null>(null);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState(0);
  const [settings, setSettings] = useState(false);
  const [gate, setGate] = useState<{ id: string; target: number; value: number; ok: boolean } | null>(null);
  const [gateOpen, setGateOpen] = useState(false);
  const [extend, setExtend] = useState(false);
  const [extra, setExtra] = useState(DAY_MS);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [showEnded, setShowEnded] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [session, setSession] = useState<Session | null>(() => sessionFor(wallet.address));
  const locked = useRef(false);
  const latestRoom = useRef<CompetitionView | null>(null); latestRoom.current = room;
  const lastChainSync = useRef(0);
  const [fundingConfig, setFundingConfig] = useState<(FundedConfig & { cluster: "devnet" | "localnet"; testerFaucet?: boolean; paused?: boolean }) | null>(null);
  const [fundingReason, setFundingReason] = useState("Checking competition availability…");
  const [fundNote, setFundNote] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ code: string; signature: string; cluster: string } | null>(() => {
    try { return JSON.parse(localStorage.getItem("sudoku.competitionReceipt") ?? "null"); } catch { return null; }
  });
  useEffect(() => {
    let stopped = false;
    void api<FundedConfig & { enabled: boolean; paused?: boolean; cluster: "devnet" | "localnet"; testerFaucet?: boolean; reason?: string }>("/api/competitions/config").then(result => {
      if (stopped) return;
      if (result.enabled) setFundingConfig(result); else setFundingReason(result.reason ?? "Token competitions are unavailable.");
    }).catch(err => { if (!stopped) setFundingReason(err instanceof Error ? err.message : "Token competitions are unavailable."); });
    return () => { stopped = true; };
  }, []);
  const changeStake = useCallback((next: MarketToken | null, amount: string) => { setToken(next); setStake(amount); }, []);
  useEffect(() => { setSession(sessionFor(wallet.address)); setPlaying(false); setRoom(current => current ? { ...current, you: null } : current); }, [wallet.address]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(timer); }, []);
  useEffect(() => {
    let stop = false;
    async function pull() {
      try {
        const result = await api<{ rooms: CompetitionSummary[] }>("/api/competitions");
        if (!stop) { setRooms(result.rooms); setListError(null); }
      } catch (err) { if (!stop) setListError(err instanceof Error ? err.message : "Room list unavailable."); } finally { if (!stop) setListLoading(false); }
    }
    void pull();
    const timer = setInterval(() => void pull(), 5000);
    return () => { stop = true; clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (!roomCode) return;
    setPollError(null);
    let stop = false;
    async function pull() {
      if (locked.current) return;
      try {
        const sync = latestRoom.current?.funded && session && session.expires > Date.now() && Date.now() - lastChainSync.current > 10000;
        if (sync) lastChainSync.current = Date.now();
        const next = await api<CompetitionView>(sync ? "/api/competitions/sync" : "/api/competitions/state", { code: roomCode, ...(session && session.expires > Date.now() ? { actor: session.actor } : {}) });
        if (!stop && !locked.current) {
          setRoom(current => current?.code === next.code && (current.you?.sequence ?? 0) > (next.you?.sequence ?? 0) ? current : next);
          setPollError(null);
        }
      } catch (err) { if (!stop && !locked.current) setPollError(err instanceof Error ? err.message : "Room unavailable."); }
    }
    void pull();
    const timer = setInterval(() => void pull(), 2000);
    return () => { stop = true; clearInterval(timer); };
  }, [roomCode, session]);
  async function action(label: string, run: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(label); setError(null);
    try { await run(); } catch (err) { setError(err instanceof Error ? err.message : "Action failed. Try again."); } finally { locked.current = false; setBusy(null); }
  }
  async function identity(): Promise<Session | null> {
    const address = connectedAddress() ?? await wallet.requestWallet();
    if (!address) return null;
    const cached = sessionFor(address);
    if (cached) { setSession(cached); return cached; }
    setBusy("Verify your wallet identity");
    const proof = await api<{ id: string; message: string }>("/api/competitions/proof", { wallet: address });
    try {
      const signature = await signPlayMessage(new TextEncoder().encode(proof.message));
      if (!signature) throw new Error("Choose a wallet that supports message signing.");
      if (connectedAddress() !== address) throw new Error("Your wallet changed. Try again with the current account.");
      const next = await api<Session>("/api/competitions/authorize", { id: proof.id, signature: bs58.encode(signature) });
      localStorage.setItem("sudoku.competitionSession", JSON.stringify(next));
      setSession(next);
      return next;
    } catch (error) {
      const text = error instanceof Error ? error.message : "";
      if (/session timeout/i.test(text)) {
        throw new Error("Wallet signing timed out. Approve or cancel in Seed Vault, then try Join again.");
      }
      throw error;
    }
  }
  async function requestTesterFunds() {
    await action("Requesting test funds", async () => {
      const auth = await identity();
      if (!auth) return;
      const result = await api<{ solSignature: string | null; testSignature: string | null; note: string | null }>("/api/competitions/faucet", { actor: auth.actor });
      const parts = [
        result.solSignature ? "Devnet SOL airdrop submitted." : null,
        result.testSignature ? "20 TEST submitted to this wallet." : null,
        result.note,
      ].filter((part): part is string => Boolean(part));
      setFundNote(parts.join(" ") || "Test funds requested.");
    });
  }
  function visit(next: CompetitionView) {
    setRoom(next); setRoomCode(next.code); setPlaying(false); setGateOpen(false); setGate(null); setSelected(0);
    localStorage.setItem("sudoku.competition", next.code);
    history.replaceState({ ...history.state, sudoku: "competitions" }, "", roomUrl(location.href, next.code));
  }
  function browse() { setRoomCode(null); setRoom(null); setPlaying(false); setTab("browse"); setError(null); localStorage.removeItem("sudoku.competition"); history.replaceState(history.state, "", roomUrl(location.href, null)); }
  async function prepareCreate() {
    await action("Preparing room", async () => {
      if (mode === "tokens" && !fundingConfig) throw new Error(fundingReason);
      if (mode === "tokens") { if (token?.mint !== fundingConfig!.mint) throw new Error("Choose TEST to create a room. Other tokens are for exploring amounts."); stakeBaseUnits(stake, fundingConfig!.decimals); }
      if (!Number.isInteger(period) || period < 60000 || period > 365 * DAY_MS) throw new Error("Choose a duration between 1 minute and 365 days.");
      const auth = await identity(); if (!auth) return;
      const result = await api<{ id: string; target: number }>("/api/competitions/check", { actor: auth.actor });
      setGate({ ...result, value: 0, ok: false }); setGateOpen(true);
    });
  }
  async function verifyGate() {
    if (!gate || !session) return;
    await action("Checking slider", async () => {
      const result = await api<{ ok: boolean }>("/api/competitions/check/verify", { actor: session.actor, id: gate.id, value: gate.value });
      setGate(current => current ? { ...current, ok: result.ok } : current);
      if (!result.ok) throw new Error("Move the solid dot onto the outlined dot and check again.");
    });
  }
  async function confirmCreate() {
    if (!gate?.ok || !session) return;
    await action("Creating room", async () => {
      const next = await api<CompetitionView>("/api/competitions/create", { actor: session.actor, gateId: gate.id, mode, level, durationMs: period, name: roomName, token, stake,
        ...(mode === "tokens" && fundingConfig ? { mint: fundingConfig.mint, stakeUnits: stakeBaseUnits(stake, fundingConfig.decimals) } : {}) });
      visit(next);
    });
  }
  async function join(codeToJoin: string) {
    await action("Joining competition", async () => {
      const auth = await identity(); if (!auth) return;
      const target = await api<CompetitionView>("/api/competitions/state", { code: codeToJoin, actor: auth.actor });
      if (target.funded) {
        visit(target);
        if (!target.you) await escrowAction(target, auth, "deposit");
      } else visit(await api<CompetitionView>("/api/competitions/join", { code: codeToJoin, actor: auth.actor }));
    });
  }
  function savePending(list: PendingEscrow[]) {
    if (writePending(localStorage, list) === "unavailable") throw new Error(storageFailureMessage());
  }
  async function submitSaved(target: CompetitionView, auth: Session, item: PendingEscrow) {
    try {
      const sent = await api<{ signature: string }>("/api/competitions/submit", { code: target.code, actor: auth.actor, action: item.action, transaction: item.serialized });
      if (sent.signature !== item.signature) throw new Error("Submit response does not match the stored transaction.");
      const next = rememberPending(readPending(localStorage), { ...item, signature: sent.signature || item.signature, status: "broadcast" });
      savePending(next);
      return sent.signature || item.signature;
    } catch (error) {
      const next = rememberPending(readPending(localStorage), { ...item, status: "unknown", note: "The response was lost. This is not a failure." });
      savePending(next);
      if (error instanceof Error && /paused|does not match|Unrelated|different/.test(error.message)) throw error;
      throw new Error(recoveryMessage(item, "unknown"));
    }
  }
  async function escrowAction(target: CompetitionView, auth: Session, kind: "deposit" | "extend" | "claim") {
    const existing = blockSecondApproval(readPending(localStorage), target.code, auth.wallet);
    if (existing.blocked) throw new Error(existing.message);
    if (existing.resume) {
      const observed = await checkPending(target, auth, existing.resume);
      if (observed === "confirmed") return;
      if (observed === "failed" || observed === "expired") throw new Error(recoveryMessage(existing.resume, observed));
      if (existing.resume.action !== kind) throw new Error(recoveryMessage(existing.resume, observed));
    }
    let serialized = existing.resume?.serialized;
    let signature = existing.resume?.signature;
    let cluster = existing.resume?.cluster ?? "devnet";
    let expiresAtBlockHeight = existing.resume?.expiresAtBlockHeight ?? 0;
    if (!existing.resume) {
      const prepared = await api<PreparedCompetitionTransaction>("/api/competitions/transaction", { code: target.code, actor: auth.actor, action: kind, ...(kind === "extend" ? { durationMs: extra } : {}) });
      if (!target.funded || prepared.wallet !== auth.wallet || prepared.mint !== target.funded.mint || prepared.stakeUnits !== target.funded.stakeUnits
        || prepared.action !== kind || !["devnet", "localnet"].includes(prepared.cluster)) throw new Error("Transaction preview does not match this competition.");
      setPlayChain(prepared.cluster);
      cluster = prepared.cluster;
      expiresAtBlockHeight = prepared.expiresAtBlockHeight;
      setBusy(kind === "deposit" ? `Approve ${target.stake} TEST deposit in your wallet` : `Approve ${kind} in your wallet`);
      let signed: Uint8Array | null;
      try { signed = await signPlayTransaction(Uint8Array.from(atob(prepared.transaction), character => character.charCodeAt(0))); }
      catch (error) {
        if (error instanceof Error && /declined/i.test(error.message)) throw new Error("Wallet approval was cancelled. Nothing was submitted.");
        if (error instanceof Error && /session timeout/i.test(error.message)) throw new Error("Wallet signing timed out or was cancelled. Nothing new was submitted by Soldoku. Retry when ready.");
        throw error;
      }
      if (!signed) throw new Error("Choose a wallet that supports transaction signing.");
      if (connectedAddress() !== auth.wallet) throw new Error("Your wallet changed before submission. Reconnect the original account. Nothing new was submitted.");
      const identity = signedTransactionIdentity(signed);
      serialized = identity.serialized;
      signature = identity.signature;
      savePending(rememberPending(readPending(localStorage), { code: target.code, wallet: auth.wallet, action: kind, signature, serialized, cluster, expiresAtBlockHeight: prepared.expiresAtBlockHeight, status: "prepared" }));
    }
    if (!serialized || !signature) throw new Error(recoveryMessage({ action: kind, signature: signature ?? "unknown" }, "unknown"));
    setBusy("Resubmitting the signed transaction. A timeout is not a failure.");
    const sentSignature = await submitSaved(target, auth, { code: target.code, wallet: auth.wallet, action: kind, signature, serialized, cluster, expiresAtBlockHeight, status: "broadcast" });
    const nextReceipt = { code: target.code, signature: sentSignature, cluster };
    setReceipt(nextReceipt); localStorage.setItem("sudoku.competitionReceipt", JSON.stringify(nextReceipt));
    setBusy("Transaction submitted · waiting for finalized escrow confirmation");
    const until = Date.now() + 90000;
    while (Date.now() < until) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      let latest: CompetitionView;
      try { latest = await api<CompetitionView>("/api/competitions/sync", { code: target.code, actor: auth.actor }); }
      catch (error) {
        if (error instanceof Error && error.message === "Deposits are still being finalized. Refresh this room.") continue;
        throw error;
      }
      setRoom(latest);
      if (kind === "deposit" && latest.you || kind === "extend" && latest.funded!.startsAt > target.funded!.startsAt || kind === "claim" && latest.you?.claimed) {
        savePending(rememberPending(readPending(localStorage), { code: target.code, wallet: auth.wallet, action: kind, signature: sentSignature, serialized, cluster, expiresAtBlockHeight, status: "confirmed" }));
        return;
      }
    }
    savePending(rememberPending(readPending(localStorage), { code: target.code, wallet: auth.wallet, action: kind, signature: sentSignature, serialized, cluster, expiresAtBlockHeight, status: "unknown" }));
    throw new Error(recoveryMessage({ action: kind, signature: sentSignature }, "unknown"));
  }
  async function checkPending(target: CompetitionView, auth: Session, item: PendingEscrow): Promise<SettlementObservation> {
    if (item.wallet !== auth.wallet || item.code !== target.code || item.cluster !== fundingConfig?.cluster) throw new Error("Reconnect the original wallet and network to check this receipt.");
    const result = await api<{ signature: string; observation: SettlementObservation }>("/api/competitions/recover", { code: target.code, actor: auth.actor, action: item.action, transaction: item.serialized });
    if (result.signature !== item.signature || !["confirmed", "failed", "expired", "pending", "unknown"].includes(result.observation)) throw new Error("Recovery response does not match the stored transaction.");
    const status = result.observation === "pending" ? "broadcast" : result.observation;
    savePending(rememberPending(readPending(localStorage), { ...item, status, note: recoveryMessage(item, result.observation) }));
    if (result.observation === "confirmed") setRoom(await api<CompetitionView>("/api/competitions/sync", { code: target.code, actor: auth.actor }));
    return result.observation;
  }
  async function claim() {
    if (!room) return;
    await action("Preparing claim", async () => { const auth = await identity(); if (auth) await escrowAction(room, auth, "claim"); });
  }
  async function settle() {
    if (!room) return;
    await action("Settling competition", async () => {
      const auth = await identity(); if (!auth) return;
      const result = await api<{ signature: string | null }>("/api/competitions/settle", { code: room.code, actor: auth.actor });
      if (result.signature) {
        const nextReceipt = { code: room.code, signature: result.signature, cluster: fundingConfig?.cluster ?? "devnet" };
        setReceipt(nextReceipt); localStorage.setItem("sudoku.competitionReceipt", JSON.stringify(nextReceipt));
      }
      setRoom(await api<CompetitionView>("/api/competitions/sync", { code: room.code, actor: auth.actor }));
    });
  }
  async function start() {
    if (!room) return;
    await action("Starting your attempt", async () => {
      const auth = await identity(); if (!auth) return;
      const next = await api<CompetitionView>("/api/competitions/start", { code: room.code, actor: auth.actor });
      setRoom(next); setPlaying(true);
    });
  }
  const values = room?.you?.board;
  const givens = room?.you?.givens;
  const active = room && now < room.endsAt;
  const pendingReceipt = room && readPending(localStorage).find(item => item.code === room.code && item.wallet === wallet.address && ["prepared", "broadcast", "unknown"].includes(item.status));
  const canJoin = active && (!room?.funded || now < room.funded.startsAt && ["pending", "open"].includes(room.funded.chainStatus));
  const canStart = active && (!room?.funded || now >= room.funded.startsAt && room.funded.chainTime >= room.funded.startsAt && room.funded.chainStatus === "open" && room.participants >= 2 && !room.you?.claimed);
  const canClaim = room?.funded && room.you && !room.you.claimed && (room.funded.chainStatus === "refunding"
    || room.funded.chainStatus === "awarded" && room.funded.winner === wallet.address
    || room.funded.chainStatus === "open" && (room.funded.chainTime >= room.funded.refundAt || room.participants === 1 && room.funded.chainTime >= room.funded.startsAt));
  async function move(digit: number) {
    if (!room || !session || !values || !givens || givens[selected] || values[selected] === digit || !active || room.you?.completedMs !== null) return;
    await action("Saving move", async () => {
      const nextValues = [...values]; nextValues[selected] = digit;
      setRoom(await api<CompetitionView>("/api/competitions/move", { actor: session.actor, code: room.code, values: nextValues, sequence: room.you!.sequence + 1 }));
    });
  }
  useEffect(() => {
    if (!playing) return;
    const key = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && (event.target.closest("input,select,textarea,[role=dialog]") || settings || gateOpen || extend)) return;
      if (/^[1-9]$/.test(event.key)) { event.preventDefault(); void move(Number(event.key)); }
      else if (event.key === "Backspace" || event.key === "Delete") { event.preventDefault(); void move(0); }
      else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) { event.preventDefault(); const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -9, ArrowDown: 9 }[event.key]!; setSelected(index => Math.min(80, Math.max(0, index + delta))); }
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  });
  const wonCompetition = Boolean(wallet.address && room?.you?.completedMs != null && (room.funded
    ? room.funded.winner === wallet.address && ["awarded", "paid"].includes(room.funded.chainStatus)
    : now >= room.endsAt && room.you.rank === 1));
  const celebrationKey = wallet.address && room?.you?.completedMs != null
    ? `competition-${wonCompetition ? "win" : "finish"}:${room.code}:${wallet.address}` : null;
  return <main className={`app competition-page ${playing ? "game" : "home"}`}>
    <WinCelebration eventKey={celebrationKey} message={wonCompetition ? "You won!" : "Grid complete!"} />
    <Brand />
    <header className="home-top"><button className="text" onClick={onHome}>Home</button><button className="icon-btn" onClick={() => setSettings(true)}>Settings</button></header>
    <p className="eyebrow">One grid. Your fastest finish.</p><h1>{room ? room.name : "Compete"}</h1>
    {room && <><p className="choice-note" data-room-code={room.code}>Room code: <strong>{room.code}</strong></p><button className="secondary back-rooms" onClick={browse}>← Back to Rooms</button></>}
    {!roomCode && <>
      <p className="lede">Same Sudoku. One attempt per wallet. Fastest correct finish wins.</p>
      <div className="tools" role="group" aria-label="Competition navigation"><button className={tab === "browse" ? "on" : ""} aria-pressed={tab === "browse"} onClick={() => setTab("browse")}>Browse rooms</button><button className={tab === "create" ? "on" : ""} aria-pressed={tab === "create"} onClick={() => setTab("create")}>Create competition</button></div>
      {tab === "create" ? <section className="stack creation-form">
        <label>Room name<input className="form-input" aria-label="Room name" maxLength={60} value={roomName} onChange={event => setRoomName(event.target.value)} placeholder="e.g. Weekend Sudoku Sprint" /></label>
        <h2>1. Choose the mode</h2><div className="tools" role="group" aria-label="Entry mode"><button className={mode === "free" ? "on" : ""} aria-pressed={mode === "free"} onClick={() => setMode("free")}>Free competition</button><button className={mode === "tokens" ? "on" : ""} aria-pressed={mode === "tokens"} onClick={() => setMode("tokens")}>For tokens</button></div>
        <p className="choice-note">One attempt per wallet. Connecting is free.</p>
        <h3>Difficulty</h3><div className="tools" role="group" aria-label="Difficulty">{LEVELS.map(item => <button key={item} aria-pressed={item === level} className={item === level ? "on" : ""} onClick={() => setLevel(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>
        <h2>2. Set the stake</h2>{mode === "tokens" ? <>
          <TokenStake onChange={changeStake} supportedMint={fundingConfig?.mint} />
          <p className="choice-note">Devnet only · TEST deposits. Other tokens are amount previews.</p>
          <p className="choice-note" role="status">Card funding unavailable. Competition entry still requires a wallet-signed TEST deposit.</p>
          {fundingConfig?.paused && <p className="choice-note" role="status">New funded rooms are paused. Claims, refunds, and settlement still work. Free competitions remain available.</p>}
          {import.meta.env.DEV && new URLSearchParams(window.location.search).has("fiatSandbox") && (
            <AddFunds stakeAtomic={stakeBaseUnits(stake, fundingConfig?.decimals ?? 6)} wallet={wallet.address} roomCode={roomCode || "sandbox"} />
          )}
          {!fundingConfig && <p className="choice-note" role="status">{fundingReason}</p>}
          {fundingConfig && <details><summary>Rules & test funds</summary><p>Everyone starts together and has {durationText(fundingConfig.playMs)} to finish. The unique fastest finish wins the pool. Ties or no finishes refund everyone. Refunds unlock after {durationText(fundingConfig.graceMs)} if settlement fails.</p><TesterFunds busy={Boolean(busy)} note={fundNote} faucet={Boolean(fundingConfig.testerFaucet)} onRequest={() => void requestTesterFunds()} /></details>}
        </> : <p className="quote-total">Free entry · no deposit</p>}
        <h2>3. Set the {mode === "tokens" && fundingConfig ? "registration" : "competition"} period</h2><Duration value={period} onChange={setPeriod} funded={mode === "tokens" && Boolean(fundingConfig)} />
        <p className="choice-note">Ends approximately {Number.isFinite(period) ? new Date(now + period + (mode === "tokens" && fundingConfig ? fundingConfig.playMs + 30000 : 0)).toLocaleString() : "—"}. The creator can extend it only before another player joins.</p>
        {mode === "tokens" && !fundingConfig ? <button className="primary" disabled={Boolean(busy)} onClick={() => { setMode("free"); setError(null); }}>Switch to free competition</button> : <button className="primary" disabled={Boolean(busy) || (mode === "tokens" && (Boolean(fundingConfig?.paused) || !token || token.mint !== fundingConfig?.mint || !stake))} onClick={() => void prepareCreate()}>{mode === "tokens" && fundingConfig?.paused ? "Funded rooms paused" : "Create room"}</button>}
        {mode === "tokens" && fundingConfig && token && token.mint !== fundingConfig.mint && <p className="choice-note" role="status">{token.symbol === "SOL" ? "SOL covers network fees. This escrow accepts TEST stakes only." : `${token.symbol} is preview only. This escrow accepts TEST stakes only.`} Choose TEST in the token picker to create a room.</p>}
      </section> : <section className="stack">
        {fundingConfig && <details><summary>Need test funds?</summary><TesterFunds busy={Boolean(busy)} note={fundNote} faucet={Boolean(fundingConfig.testerFaucet)} onRequest={() => void requestTesterFunds()} /></details>}
        <h2>Competition rooms</h2><label className="check-label"><input type="checkbox" checked={showEnded} onChange={event => setShowEnded(event.target.checked)} /> Include ended competitions</label>
        <label htmlFor="competition-code">Have a room code?</label><div className="room-code-row"><input id="competition-code" className="form-input" placeholder="Room code" value={code} onChange={event => setCode(event.target.value.toUpperCase())} maxLength={8} /><button className="secondary" disabled={Boolean(busy) || code.length !== 8} onClick={() => void action("Opening room", async () => visit(await api<CompetitionView>("/api/competitions/state", { code, ...(session ? { actor: session.actor } : {}) })))}>Find room</button></div>
        {listLoading && <p role="status">Loading competitions…</p>}{listError && <p role="alert" className="alert">{listError}</p>}
        {!listLoading && !listError && !rooms.some(item => showEnded || item.endsAt > now) && <div className="empty-room"><h3>No active competitions yet</h3><p>Create the first room and share its code.</p><button className="secondary" onClick={() => setTab("create")}>Create competition</button></div>}
        {rooms.filter(item => showEnded || item.endsAt > now).map(item => <article className="room-card" key={item.code}><div className="quote-line"><h3>{item.name}</h3><span className="chip">{now < item.endsAt ? "Active" : "Ended"}</span></div><p className="choice-note">Room code: {item.code}</p><RoomFacts room={{ ...item, status: now < item.endsAt ? "active" : "ended" }} /><p className="choice-note">Ends {new Date(item.endsAt).toLocaleString()}</p><div className="tools"><button disabled={Boolean(busy)} onClick={() => void action("Opening room", async () => visit(await api<CompetitionView>("/api/competitions/state", { code: item.code, ...(session ? { actor: session.actor } : {}) })))}>View room</button><button disabled={Boolean(busy) || now >= item.endsAt || Boolean(item.funded && (now >= item.funded.startsAt || item.funded.chainStatus !== "open"))} onClick={() => void join(item.code)}>Join room</button></div></article>)}
      </section>}
    </>}
    {roomCode && !room && <p role="status">Loading room…</p>}
    {room && <>
      {playing && values && givens && active && room.you?.completedMs === null ? <>
        <div className="quote-line"><strong>Your time {elapsedLabel(now - (room.you.startedAt ?? now))}</strong><button className="text" onClick={() => setPlaying(false)}>Room & leaderboard</button></div><p className="choice-note">Your timer keeps running if you leave. Finish before {new Date(room.endsAt).toLocaleString()}.</p>
        <div className="board" role="grid" aria-label="Competition Sudoku">{values.map((value, index) => <button role="gridcell" type="button" key={index} className={`cell ${givens[index] ? "given" : "entry"} ${index === selected ? "selected" : ""} ${index % 9 === 2 || index % 9 === 5 ? "thick-r" : ""} ${Math.floor(index / 9) === 2 || Math.floor(index / 9) === 5 ? "thick-b" : ""}`} aria-label={cellLabel(index, value, givens[index] !== 0)} aria-selected={index === selected} onClick={() => setSelected(index)}>{value || ""}</button>)}</div>
        <div className="pad">{Array.from({ length: 9 }, (_, index) => <button key={index} disabled={Boolean(busy) || Boolean(givens[selected])} onClick={() => void move(index + 1)}>{index + 1}</button>)}</div><button className="secondary" disabled={Boolean(busy) || Boolean(givens[selected])} onClick={() => void move(0)}>Erase</button>
      </> : <>
        <RoomFacts room={{ ...room, status: active ? "active" : "ended" }} /><p className="choice-note">Ends {new Date(room.endsAt).toLocaleString()}. No fixed player limit.</p>
        {room.you?.completedMs != null && <><p className="banner">Finished in {elapsedLabel(room.you.completedMs)} · rank {room.you.rank}{active ? " so far. Rankings can change until the room closes." : ". Competition ended."}</p><p className="choice-note">Share this room’s code to invite others, or use Back to Rooms for another competition.</p></>}
        {!active && <p className="banner">Competition ended. {room.bestMs === null ? "No player completed the grid in time." : room.funded ? "The unique fastest verified completion wins. Exact fastest ties refund all entrants." : "The fastest verified completion is the winning time. Equal times share first place."}</p>}
        {room.funded && <section className="stack" aria-label="Escrow competition status"><p className="choice-note">{fundingConfig?.cluster === "localnet" ? "Local validator" : "Devnet"} · TEST entry</p>{fundingConfig && <details><summary>Need test funds?</summary><TesterFunds busy={Boolean(busy)} note={fundNote} faucet={Boolean(fundingConfig.testerFaucet)} onRequest={() => void requestTesterFunds()} /></details>}<p role="status">{escrowNotice(room, now)}</p><p className="choice-note">Fastest unique finish wins the pool. Ties or no finishes refund everyone.</p>
          {room.you && <p className="banner">{room.you.claimed ? "Your claim is complete." : "Your stake is confirmed in escrow."}</p>}
          {room.participants === 1 && now >= room.funded.startsAt && <p className="banner">No opponent joined. The creator can claim a full stake refund.</p>}
          {room.funded.winner && <p>Winner wallet: <span className="token-mint">{room.funded.winner}</span></p>}
          {!active && room.you && room.funded.chainTime >= room.endsAt && room.funded.chainStatus === "open" && room.funded.chainTime < room.funded.refundAt && <button className="primary" disabled={Boolean(busy)} onClick={() => void settle()}>Finalize result</button>}
          {canClaim && <button className="primary" disabled={Boolean(busy)} onClick={() => void claim()}>{room.funded.chainStatus === "awarded" ? "Claim winner payout" : "Claim stake refund"}</button>}
          {receipt?.code === room.code && <p className="choice-note">{receipt.cluster === "devnet" ? <a href={`https://explorer.solana.com/tx/${encodeURIComponent(receipt.signature)}?cluster=devnet`} target="_blank" rel="noreferrer">View transaction</a> : "Local validator transaction submitted."}</p>}
        </section>}
        {pendingReceipt && <button className="secondary" disabled={Boolean(busy)} onClick={() => void action("Checking the saved transaction", async () => {
          const auth = await identity(); if (!auth) return;
          const observed = await checkPending(room, auth, pendingReceipt);
          throw new Error(observed === "expired" || observed === "failed" ? "The earlier transaction did not land. Its receipt is kept. You can retry if registration is still open; otherwise use a new room." : recoveryMessage(pendingReceipt, observed));
        })}>Check pending transaction</button>}
        {canJoin && !room.you && <><p className="choice-note">Join verifies your wallet with a message signature (no deposit for free rooms). Your timer starts only when you press Start challenge.</p><button className="primary" disabled={Boolean(busy)} onClick={() => void join(room.code)}>{room.funded ? `Deposit ${room.stake} TEST to join` : "Join room"}</button></>}
        {room.funded && !room.you && <button className="secondary" disabled={Boolean(busy)} onClick={() => void action("Checking your escrow entry", async () => {
          const auth = await identity(); if (!auth) return;
          const recovered = await api<CompetitionView>("/api/competitions/sync", { code: room.code, actor: auth.actor });
          setRoom(recovered);
          if (!recovered.you) throw new Error("This wallet has no confirmed deposit in this competition.");
        })}>Check my deposited entry</button>}
        {canStart && room.you && room.you.completedMs === null && <><p className="banner">{room.funded ? "One attempt only. Everyone's clock started when registration closed; leaving or reconnecting never resets it." : room.you.startedAt === null ? "One attempt only. Your timer starts when you press Start challenge." : "Your attempt is in progress. Your timer has continued running."}</p><button className="primary" disabled={Boolean(busy)} onClick={() => void start()}>{room.you.startedAt === null ? "Start challenge" : "Continue challenge"}</button></>}
        {room.you?.canExtend && active && <button className="secondary" onClick={() => setExtend(true)}>Extend room duration</button>}
        {room.you?.owner && room.participants > 1 && <p className="choice-note">Duration locked · another player has joined.</p>}
        <h2>{active ? "Leaderboard" : "Final leaderboard"}</h2>{!room.leaderboard.length ? <p className="choice-note">No completed attempts yet. The fastest correct finish will appear here.</p> : <ol className="leaderboard">{room.leaderboard.map((entry, index) => <li key={entry.wallet ?? index} aria-current={entry.you ? "true" : undefined}><span>#{entry.rank} · {entry.name}{entry.you ? " · You" : ""}</span><strong>{elapsedLabel(entry.completedMs)}</strong></li>)}</ol>}
        <p className="choice-note">Share this room code: <strong>{room.code}</strong>. Finish times are checked by the server. The same grid allows one attempt per wallet.</p>
        <p className="choice-note"><a href={roomUrl(location.href, room.code)}>Shareable room link</a></p><button className="secondary" onClick={() => void action("Copying room link", async () => { await navigator.clipboard.writeText(roomUrl(location.href, room.code)); })}>Copy room link</button>
      </>}
      <button className="secondary back-rooms" onClick={browse}>← Back to Rooms</button>
    </>}
    {busy && <p className="choice-note" role="status">{busy}…</p>}{error && <p className="alert" role="alert">{error}</p>}{!error && !busy && roomCode && pollError && <p className="choice-note" role="status">{pollError}</p>}
    {!playing && <button className="text" onClick={onLegacy}>Previous two-player races & refunds</button>}
    {settings && <SettingsSheet onClose={() => setSettings(false)} onHome={onHome} />}
    {gateOpen && gate && <DialogFrame id="create-check-title" onClose={() => { setGateOpen(false); setError(null); }}><h2 id="create-check-title">Quick check before creating</h2><p>Slide the solid dot onto the outlined dot, then verify.</p><div className="competition-slider"><span className="slider-target" style={{ "--target": gate.target } as CSSProperties} aria-hidden="true" /><input aria-label="Slide dot to target" type="range" min="0" max="100" step="1" value={Math.round(gate.value * 100)} onChange={event => setGate({ ...gate, value: Number(event.target.value) / 100, ok: false })} /></div><button className="secondary" disabled={Boolean(busy)} onClick={() => void verifyGate()}>{gate.ok ? "Check passed ✓" : "Verify position"}</button>{gate.ok && <button className="primary" disabled={Boolean(busy)} onClick={() => void confirmCreate()}>Confirm create room</button>}{error && <p className="alert" role="alert">{error}</p>}<button className="text" onClick={() => { setGateOpen(false); setError(null); }}>Cancel</button></DialogFrame>}
    {extend && room && <DialogFrame id="extend-title" onClose={() => setExtend(false)}><h2 id="extend-title">Extend room duration</h2><p>Available only while you are the room’s only participant. The server checks again when you confirm.</p><Duration value={extra} onChange={setExtra} funded={Boolean(room.funded)} /><p>New deadline: {new Date(room.endsAt + extra).toLocaleString()}</p><button className="primary" disabled={Boolean(busy)} onClick={() => void action("Extending room", async () => { const auth = await identity(); if (!auth) return; if (room.funded) await escrowAction(room, auth, "extend"); else setRoom(await api<CompetitionView>("/api/competitions/extend", { code: room.code, actor: auth.actor, durationMs: extra })); setExtend(false); })}>Confirm extension</button>{error && <p className="alert" role="alert">{error}</p>}<button className="text" onClick={() => setExtend(false)}>Cancel</button></DialogFrame>}
  </main>;
}
