import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Brand } from "./Brand";
import bs58 from "bs58";
import { LEVELS, type Level } from "../engine/types";
import { DAY_MS, elapsedLabel, usdLabel, type CompetitionSummary, type CompetitionView, type MarketToken } from "../competition/types";
import { connectedAddress, signPlayMessage } from "../solana/browserWallet";
import { cellLabel } from "./boardInput";
import { DialogFrame } from "./dialogFocus";
import { SettingsSheet } from "./SettingsSheet";
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
function Duration({ value, onChange }: { value: number; onChange: (ms: number) => void }) {
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
    <p className="choice-note">The room stays open for this period. Your timer starts separately when you start your game.</p>
  </section>;
}
function durationText(ms: number) { return ms % DAY_MS === 0 ? `${ms / DAY_MS} day${ms === DAY_MS ? "" : "s"}` : ms % 3600000 === 0 ? `${ms / 3600000} hours` : `${Math.round(ms / 60000)} minutes`; }
function RoomFacts({ room }: { room: CompetitionSummary }) {
  return <dl className="room-facts">
    <div><dt>Game mode</dt><dd>Sudoku · {room.level}</dd></div><div><dt>Token</dt><dd>{room.token?.symbol ?? "None · free entry"}</dd></div>
    <div><dt>Stake per player</dt><dd>{room.token ? `${room.stake} ${room.token.symbol}` : "0"}</dd></div><div><dt>Approx. USD</dt><dd>{usdLabel(room.stake * (room.token?.priceUsd ?? 0))}</dd></div>
    <div><dt>Competition period</dt><dd>{durationText(room.durationMs)}</dd></div><div><dt>Participants</dt><dd>{room.participants} · open entry</dd></div>
    <div><dt>Status</dt><dd>{room.status === "active" ? "Active" : "Ended"}</dd></div><div><dt>Best completion</dt><dd>{room.bestMs === null ? "No finishes yet" : elapsedLabel(room.bestMs)}</dd></div>
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
  const [roomCode, setRoomCode] = useState<string | null>(() => localStorage.getItem("sudoku.competition"));
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
  const [listError, setListError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [showEnded, setShowEnded] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [session, setSession] = useState<Session | null>(() => sessionFor(wallet.address));
  const locked = useRef(false);
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
    let stop = false;
    async function pull() {
      if (locked.current) return;
      try {
        const next = await api<CompetitionView>("/api/competitions/state", { code: roomCode, ...(session && session.expires > Date.now() ? { actor: session.actor } : {}) });
        if (!stop && !locked.current) setRoom(current => current?.code === next.code && (current.you?.sequence ?? 0) > (next.you?.sequence ?? 0) ? current : next);
      } catch (err) { if (!stop) setError(err instanceof Error ? err.message : "Room unavailable."); }
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
    const signature = await signPlayMessage(new TextEncoder().encode(proof.message));
    if (!signature) throw new Error("Choose a wallet that supports message signing.");
    if (connectedAddress() !== address) throw new Error("Your wallet changed. Try again with the current account.");
    const next = await api<Session>("/api/competitions/authorize", { id: proof.id, signature: bs58.encode(signature) });
    localStorage.setItem("sudoku.competitionSession", JSON.stringify(next));
    setSession(next);
    return next;
  }
  function visit(next: CompetitionView) {
    setRoom(next); setRoomCode(next.code); setPlaying(false); setGateOpen(false); setGate(null); setSelected(0);
    localStorage.setItem("sudoku.competition", next.code);
  }
  function browse() { setRoomCode(null); setRoom(null); setPlaying(false); setTab("browse"); setError(null); localStorage.removeItem("sudoku.competition"); }
  async function prepareCreate() {
    await action("Preparing room", async () => {
      if (mode === "tokens") throw new Error("Paid leaderboard rooms need a new escrow implementation. Choose Free competition to create a room now.");
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
      const next = await api<CompetitionView>("/api/competitions/create", { actor: session.actor, gateId: gate.id, mode, level, durationMs: period, name: roomName, token, stake });
      visit(next);
    });
  }
  async function join(codeToJoin: string) {
    await action("Joining competition", async () => {
      const auth = await identity(); if (!auth) return;
      visit(await api<CompetitionView>("/api/competitions/join", { code: codeToJoin, actor: auth.actor }));
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
  return <main className={`app competition-page ${playing ? "game" : "home"}`}>
    <Brand />
    <header className="home-top"><button className="text" onClick={onHome}>Home</button><button className="icon-btn" onClick={() => setSettings(true)}>Settings</button></header>
    <p className="eyebrow">One grid. Your fastest finish.</p><h1>{room ? room.name : "Compete"}</h1>
    {room && <><p className="choice-note" data-room-code={room.code}>Room code: <strong>{room.code}</strong></p><button className="secondary back-rooms" onClick={browse}>← Back to Rooms</button></>}
    {!roomCode && <>
      <p className="lede">Join a leaderboard challenge. Everyone gets the same Sudoku; one timed attempt per wallet. Fastest correct completion wins when the competition closes.</p>
      <div className="tools" role="group" aria-label="Competition navigation"><button className={tab === "browse" ? "on" : ""} aria-pressed={tab === "browse"} onClick={() => setTab("browse")}>Browse rooms</button><button className={tab === "create" ? "on" : ""} aria-pressed={tab === "create"} onClick={() => setTab("create")}>Create competition</button></div>
      {tab === "create" ? <section className="stack creation-form">
        <label>Room name<input className="form-input" aria-label="Room name" maxLength={60} value={roomName} onChange={event => setRoomName(event.target.value)} placeholder="e.g. Weekend Sudoku Sprint" /></label>
        <h2>1. Choose the mode</h2><div className="tools" role="group" aria-label="Entry mode"><button className={mode === "free" ? "on" : ""} aria-pressed={mode === "free"} onClick={() => setMode("free")}>Free competition</button><button className={mode === "tokens" ? "on" : ""} aria-pressed={mode === "tokens"} onClick={() => setMode("tokens")}>For tokens</button></div>
        <p className="choice-note">A wallet verifies your identity and enforces one attempt. Connecting does not transfer tokens.</p>
        <h3>Difficulty</h3><div className="tools" role="group" aria-label="Difficulty">{LEVELS.map(item => <button key={item} aria-pressed={item === level} className={item === level ? "on" : ""} onClick={() => setLevel(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>
        <h2>2. Set the stake</h2>{mode === "tokens" ? <TokenStake onChange={changeStake} /> : <p className="quote-total">Free entry · $0.00 · no token deposit</p>}
        {mode === "tokens" && <p className="banner" role="status">Paid leaderboard entry needs an escrow that supports multiple participants. The current escrow supports only two-player test-token races. Token prices below are for planning.</p>}
        <h2>3. Set the competition period</h2><Duration value={period} onChange={setPeriod} />
        <p className="choice-note">Ends approximately {Number.isFinite(period) ? new Date(now + period).toLocaleString() : "—"}. The creator can extend it only before another player joins.</p>
        {mode === "tokens" ? <button className="primary" disabled={Boolean(busy)} onClick={() => { setMode("free"); setError(null); }}>Switch to free competition</button> : <button className="primary" disabled={Boolean(busy)} onClick={() => void prepareCreate()}>Create room</button>}
      </section> : <section className="stack">
        <h2>Competition rooms</h2><label className="check-label"><input type="checkbox" checked={showEnded} onChange={event => setShowEnded(event.target.checked)} /> Include ended competitions</label>
        <label htmlFor="competition-code">Have a room code?</label><div className="room-code-row"><input id="competition-code" className="form-input" placeholder="Room code" value={code} onChange={event => setCode(event.target.value.toUpperCase())} maxLength={8} /><button className="secondary" disabled={Boolean(busy) || code.length !== 8} onClick={() => void action("Opening room", async () => visit(await api<CompetitionView>("/api/competitions/state", { code, ...(session ? { actor: session.actor } : {}) })))}>Find room</button></div>
        {listLoading && <p role="status">Loading competitions…</p>}{listError && <p role="alert" className="alert">{listError}</p>}
        {!listLoading && !listError && !rooms.some(item => showEnded || item.endsAt > now) && <div className="empty-room"><h3>No active competitions yet</h3><p>Create the first room and share its code.</p><button className="secondary" onClick={() => setTab("create")}>Create competition</button></div>}
        {rooms.filter(item => showEnded || item.endsAt > now).map(item => <article className="room-card" key={item.code}><div className="quote-line"><h3>{item.name}</h3><span className="chip">{now < item.endsAt ? "Active" : "Ended"}</span></div><p className="choice-note">Room code: {item.code}</p><RoomFacts room={{ ...item, status: now < item.endsAt ? "active" : "ended" }} /><p className="choice-note">Ends {new Date(item.endsAt).toLocaleString()}</p><div className="tools"><button disabled={Boolean(busy)} onClick={() => void action("Opening room", async () => visit(await api<CompetitionView>("/api/competitions/state", { code: item.code, ...(session ? { actor: session.actor } : {}) })))}>View room</button><button disabled={Boolean(busy) || now >= item.endsAt} onClick={() => void join(item.code)}>Join room</button></div></article>)}
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
        {room.you?.completedMs != null && <p className="banner">Finished in {elapsedLabel(room.you.completedMs)} · rank {room.you.rank}{active ? " so far. Rankings can change until the room closes." : ". Competition ended."}</p>}
        {!active && <p className="banner">Competition ended. {room.bestMs === null ? "No player completed the grid in time." : "The fastest verified completion is the winning time. Equal times share first place."}</p>}
        {active && !room.you && <button className="primary" disabled={Boolean(busy)} onClick={() => void join(room.code)}>Join room</button>}
        {active && room.you && room.you.completedMs === null && <><p className="banner">{room.you.startedAt === null ? "One attempt only. Your timer starts when you press Start challenge." : "Your attempt is in progress. Your timer has continued running."}</p><button className="primary" disabled={Boolean(busy)} onClick={() => void start()}>{room.you.startedAt === null ? "Start challenge" : "Continue challenge"}</button></>}
        {room.you?.canExtend && active && <button className="secondary" onClick={() => setExtend(true)}>Extend room duration</button>}
        {room.you?.owner && room.participants > 1 && <p className="choice-note">Duration locked · another player has joined.</p>}
        <h2>{active ? "Leaderboard" : "Final leaderboard"}</h2>{!room.leaderboard.length ? <p className="choice-note">No completed attempts yet. The fastest correct finish will appear here.</p> : <ol className="leaderboard">{room.leaderboard.map((entry, index) => <li key={index}><span>#{entry.rank} · {entry.name}</span><strong>{elapsedLabel(entry.completedMs)}</strong></li>)}</ol>}
        <p className="choice-note">Share this room code: <strong>{room.code}</strong>. Finish times are checked by the server. The same grid allows one attempt per wallet.</p>
      </>}
      <button className="secondary back-rooms" onClick={browse}>← Back to Rooms</button>
    </>}
    {busy && <p className="choice-note" role="status">{busy}…</p>}{error && <p className="alert" role="alert">{error}</p>}
    {!playing && <button className="text" onClick={onLegacy}>Previous two-player races & refunds</button>}
    {settings && <SettingsSheet onClose={() => setSettings(false)} onHome={onHome} />}
    {gateOpen && gate && <DialogFrame id="create-check-title" onClose={() => { setGateOpen(false); setError(null); }}><h2 id="create-check-title">Quick check before creating</h2><p>Slide the solid dot onto the outlined dot, then verify.</p><div className="competition-slider"><span className="slider-target" style={{ "--target": gate.target } as CSSProperties} aria-hidden="true" /><input aria-label="Slide dot to target" type="range" min="0" max="100" step="1" value={Math.round(gate.value * 100)} onChange={event => setGate({ ...gate, value: Number(event.target.value) / 100, ok: false })} /></div><button className="secondary" disabled={Boolean(busy)} onClick={() => void verifyGate()}>{gate.ok ? "Check passed ✓" : "Verify position"}</button>{gate.ok && <button className="primary" disabled={Boolean(busy)} onClick={() => void confirmCreate()}>Confirm create room</button>}{error && <p className="alert" role="alert">{error}</p>}<button className="text" onClick={() => { setGateOpen(false); setError(null); }}>Cancel</button></DialogFrame>}
    {extend && room && <DialogFrame id="extend-title" onClose={() => setExtend(false)}><h2 id="extend-title">Extend room duration</h2><p>Available only while you are the room’s only participant. The server checks again when you confirm.</p><Duration value={extra} onChange={setExtra} /><p>New deadline: {new Date(room.endsAt + extra).toLocaleString()}</p><button className="primary" disabled={Boolean(busy)} onClick={() => void action("Extending room", async () => { const auth = await identity(); if (!auth) return; setRoom(await api<CompetitionView>("/api/competitions/extend", { code: room.code, actor: auth.actor, durationMs: extra })); setExtend(false); })}>Confirm extension</button>{error && <p className="alert" role="alert">{error}</p>}<button className="text" onClick={() => setExtend(false)}>Cancel</button></DialogFrame>}
  </main>;
}
