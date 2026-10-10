import { Brand } from "./ui/Brand";
import { useEffect, useState } from "react";
import { playerFacingError } from "./ui/boardInput";
import { ABOUT_FUNDED_ROOMS, HELP_FUNDED_ROOMS } from "./ui/copy";
import { ClassicGame } from "./ui/ClassicGame";
import { Compete } from "./ui/Compete";
import { Competitions } from "./ui/Competitions";
import { WalletButton, WalletProvider } from "./ui/WalletSession";
import { LEVELS, type Level } from "./engine/types";
import { applyAppearance, prefs } from "./ui/feel";
import { DialogFrame } from "./ui/dialogFocus";
import { emptyBook, recordLine, type RecordBook } from "./ui/record";
import { classicProgress } from "./ui/classicSave";
import { syncMusicFromPage } from "./ui/audio";
import { listenForSavedMusic, SettingsSheet } from "./ui/SettingsSheet";
import { roomCodeFromUrl, roomUrl } from "./competition/roomLink";

type Route =
  | { name: "home" }
  | { name: "levels" }
  | { name: "classic"; level: Level; fresh?: boolean; resume?: boolean }
  | { name: "competitions" }
  | { name: "compete"; mode: "practice" | "staked" };

const BLURB: Record<Level, string> = {
  easy: "Singles only",
  medium: "Pairs and locked candidates",
  hard: "Triples",
  expert: "Needs an X-Wing",
};

export function App() {
  return <WalletProvider><AppContent /></WalletProvider>;
}

function AppContent() {
  const [settings, setSettings] = useState(false);
  const [about, setAbout] = useState(false);
  const [help, setHelp] = useState(false);
  const [newGame, setNewGame] = useState(false);
  const [confirmLevel, setConfirmLevel] = useState<Level | null>(null);
  const [disclosure, setDisclosure] = useState("DEVNET · SOLDOKU TOKENS · NO CASH VALUE");
  const [route, setRoute] = useState<Route>(() => {
    if (roomCodeFromUrl(location.href)) return { name: "competitions" };
    if (localStorage.getItem("sudoku.seat")) return { name: "compete", mode: "practice" };
    if (localStorage.getItem("sudoku.competition")) return { name: "competitions" };
    const classic = localStorage.getItem("sudoku.classic");
    if (!classic) return { name: "home" };
    try {
      const saved = JSON.parse(classic) as { level?: Level };
      return saved.level ? { name: "classic", level: saved.level } : { name: "home" };
    } catch {
      return { name: "home" };
    }
  });

  useEffect(() => {
    const saved = prefs();
    applyAppearance(saved.font, saved.text);
    listenForSavedMusic(saved.music);
    const onHide = () => syncMusicFromPage();
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  useEffect(() => {
    let stop = false;
    void fetch("/api/chain")
      .then((response) => response.json())
      .then((data: { localnet?: boolean; staging?: boolean; cluster?: string }) => {
        if (stop) return;
        if (data.localnet) setDisclosure("");
        else if (data.staging) setDisclosure("STAGING · DEVNET · SOLDOKU TOKENS · NO CASH VALUE");
        else if (data.cluster === "devnet") setDisclosure("DEVNET · SOLDOKU TOKENS · NO CASH VALUE");
        else setDisclosure("");
      })
      .catch(() => undefined);
    return () => {
      stop = true;
    };
  }, []);

  useEffect(() => {
    const label = route.name === "classic" ? `classic:${route.level}` : route.name === "compete" ? `compete:${route.mode}` : route.name;
    if (!history.state?.sudoku) history.replaceState({ sudoku: label }, "");
    const onPop = (event: PopStateEvent) => {
      const state = event.state as { sudoku?: string; sheet?: string } | null;
      setSettings(state?.sheet === "settings");
      setAbout(state?.sheet === "about");
      setHelp(state?.sheet === "help");
      const next = state?.sudoku ?? "home";
      if (next.startsWith("classic:")) {
        const level = next.slice(8) as Level;
        if (LEVELS.includes(level)) {
          setRoute((current) => (current.name === "classic" && current.level === level ? current : { name: "classic", level }));
        }
        return;
      }
      if (next === "levels") setRoute({ name: "levels" });
      else if (next === "competitions") setRoute({ name: "competitions" });
      else if (next === "compete" || next === "compete:practice") setRoute({ name: "compete", mode: "practice" });
      else if (next === "compete:staked") setRoute({ name: "compete", mode: "staked" });
      else setRoute({ name: "home" });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function open(next: Route) {
    setSettings(false);
    setAbout(false);
    setHelp(false);
    setConfirmLevel(null);
    const label = next.name === "classic" ? `classic:${next.level}` : next.name === "compete" ? `compete:${next.mode}` : next.name;
    history.pushState({ sudoku: label }, "", next.name === "competitions" ? undefined : roomUrl(location.href, null));
    setRoute(next);
  }

  if (route.name === "classic") {
    return (
      <ClassicGame
        level={route.level}
        fresh={route.fresh}
        resume={route.resume}
        onExit={() => open({ name: "home" })}
      />
    );
  }

  if (route.name === "compete") {
    return <Compete initialMode={route.mode} onExit={() => open({ name: "home" })} />;
  }

  if (route.name === "competitions") {
    return <Competitions onHome={() => open({ name: "home" })} onLegacy={() => open({ name: "compete", mode: "staked" })} />;
  }

  const savedLevel = readSavedLevel();

  function closeSettings() {
    if ((history.state as { sheet?: string } | null)?.sheet === "settings") history.back();
    else setSettings(false);
  }

  function startLevel(level: Level) {
    const progress = classicProgress(localStorage.getItem("sudoku.classic"));
    const saved = readSavedLevel();
    const replaces = progress === "unfinished" && (newGame || saved !== level);
    if (replaces) {
      setConfirmLevel(level);
      return;
    }
    open({ name: "classic", level, fresh: newGame || saved !== level });
  }

  return (
    <main className="app home">
      <div className="home-top">
        {route.name === "levels" ? <button className="text" onClick={() => open({ name: "home" })}>Home</button> : <p className="eyebrow">Paper grid</p>}
        <div className="header-actions">
        <button className="icon-btn" type="button" onClick={() => { history.pushState({ sudoku: "home", sheet: "settings" }, ""); setSettings(true); }}>
          Settings
        </button>
        <WalletButton />
        </div>
      </div>
      <Brand hero /><h1 className="sr-only">Soldoku</h1>
      {route.name === "levels" ? (
        <section className="stack">
          <h2>{newGame ? "New game" : "Classic"}</h2>
          <p className="lede">{newGame ? "Choose a difficulty. An unfinished game on this phone is replaced only after you confirm." : "Choose a difficulty. Your game stays on this phone if you leave."}</p>
          {LEVELS.map((level) => (
            <button key={level} className="choice" type="button" onClick={() => startLevel(level)}>
              <span className="choice-title">{label(level)}</span>
              <span className="choice-note">{BLURB[level]}</span>
            </button>
          ))}
          <button className="text" type="button" onClick={() => open({ name: "home" })}>
            Back
          </button>
        </section>
      ) : (
        <section className="modes">
          <p className="lede">Play a solo game, race a friend, or climb the competition leaderboard.</p>
          {disclosure && <p className="badge">{disclosure}</p>}
          {phoneRecord() && <p className="choice-note">{phoneRecord()}</p>}
          {savedLevel && (
            <button className="primary" type="button" onClick={() => open({ name: "classic", level: savedLevel })}>
              Continue game
            </button>
          )}
          {savedLevel && (
            <button className="secondary" type="button" onClick={() => { setNewGame(true); open({ name: "levels" }); }}>
              New game
            </button>
          )}
          <button className="mode" type="button" onClick={() => { setNewGame(false); open({ name: "levels" }); }}>
            <span className="eyebrow">Solo</span>
            <strong>Play classic</strong>
            <span className="choice-note">A quiet game. Pause whenever you want.</span>
          </button>
          <button className="mode" type="button" onClick={() => open({ name: "compete", mode: "practice" })}>
            <span className="eyebrow">Free</span>
            <strong>Practice</strong>
            <span className="choice-note">No wallet required. Same grid, two players.</span>
          </button>
          <button className="mode" type="button" onClick={() => open({ name: "competitions" })}>
            <span className="eyebrow">Leaderboard</span>
            <strong>Compete</strong>
            <span className="choice-note">Free rooms: join with a wallet message, then Start. Fastest correct finish ranks.</span>
          </button>
          <button className="text" type="button" onClick={() => { history.pushState({ sudoku: "home", sheet: "help" }, ""); setHelp(true); }}>How to play</button>
          <button className="text" type="button" onClick={() => { history.pushState({ sudoku: "home", sheet: "about" }, ""); setAbout(true); }}>About this beta</button>
        </section>
      )}
      {settings && <SettingsSheet onClose={closeSettings} onHome={() => open({ name: "home" })} />}
      {confirmLevel && (
        <DialogFrame id="replace-title" onClose={() => { const saved = readSavedLevel(); setNewGame(false); if (saved) open({ name: "classic", level: saved, resume: true }); else setConfirmLevel(null); }}>
            <h2 id="replace-title">Replace this game?</h2>
            <p>The unfinished game on this device will be replaced. Finished games stay in your history.</p>
            <button className="primary" type="button" onClick={() => open({ name: "classic", level: confirmLevel, fresh: true })}>Start new game</button>
            <button className="text" type="button" onClick={() => { const saved = readSavedLevel(); setNewGame(false); if (saved) open({ name: "classic", level: saved, resume: true }); else setConfirmLevel(null); }}>Return to current game</button>
        </DialogFrame>
      )}
      {about && <About onClose={() => { if ((history.state as { sheet?: string } | null)?.sheet === "about") history.back(); else setAbout(false); }} />}
      {help && <HowToPlay onClose={() => { if ((history.state as { sheet?: string } | null)?.sheet === "help") history.back(); else setHelp(false); }} />}
    </main>
  );
}

function phoneRecord(): string | null {
  let classic = 0;
  try {
    const journal = JSON.parse(localStorage.getItem("sudoku.journal") ?? "[]") as unknown[];
    classic = Array.isArray(journal) ? journal.length : 0;
  } catch {
    classic = 0;
  }
  let book: RecordBook = emptyBook();
  try {
    const parsed = JSON.parse(localStorage.getItem("sudoku.stats") ?? "") as RecordBook;
    if (parsed?.practice && parsed?.staked) book = parsed;
  } catch {
    book = emptyBook();
  }
  return recordLine(book, classic);
}

function readSavedLevel(): Level | null {
  try {
    const saved = JSON.parse(localStorage.getItem("sudoku.classic") ?? "") as { level?: Level };
    return saved.level ?? null;
  } catch {
    return null;
  }
}

function HowToPlay({ onClose }: { onClose: () => void }) {
  return (
    <DialogFrame id="help-title" onClose={onClose}>
      <h2 id="help-title">How to play</h2>
      <p>Fill the grid so each row, column, and 3×3 box contains the digits 1–9 once.</p>
      <p>Notes pencils in a candidate. It does not fill the cell.</p>
      <p>A wrong digit counts as a mistake. The game stays playable.</p>
      <p>Practice is a free two-player race (no wallet). Compete is a shared leaderboard: Join proves your wallet with a message, Start begins your one timed attempt, and the fastest correct finish ranks when the room closes.</p>
      <p>{HELP_FUNDED_ROOMS}</p>
      <button className="primary" type="button" onClick={onClose}>Close</button>
    </DialogFrame>
  );
}

function About({ onClose }: { onClose: () => void }) {
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function send() {
    setSending(true);
    setStatus(null);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "The note was not saved");
      setNote("");
      setStatus("Saved. The owner can read it with the game records.");
    } catch (error) {
      setStatus(playerFacingError(error, "The note was not saved"));
    } finally {
      setSending(false);
    }
  }

  return (
    <DialogFrame id="about-title" onClose={onClose}>
        <h2 id="about-title">About this beta</h2>
        <p>Classic is a solo Sudoku game on this device. No wallet.</p>
        <p>{ABOUT_FUNDED_ROOMS}</p>
        <p>Practice is a free race. Create a room and share the code, or use Quick Match. No tokens move. A listed room leaves the public list after 20 minutes if nobody joins. A private code lasts about two hours.</p>
        <p>Previous two-player token races lock the same entry for both players: 1, 2, or 5 Devnet Soldoku tokens. Those tokens have no cash value. A Seeker uses the mobile wallet. A desktop browser can connect a wallet that supports the Wallet Standard. The entry is fixed when the room opens. If the other player never deposits, a refund opens when the join window ends. If a match cannot finish, either player can refund after the settle deadline, and both entries return. There is no conversion on this beta: deposit the Soldoku token for this room. A quote is not a deposit.</p>
        <p className="choice-note">This is a Devnet beta. It is not real-money play, a store release, or a security audit.</p>
        <label htmlFor="beta-note">Report a problem</label>
        <textarea id="beta-note" className="note-box" maxLength={400} value={note} placeholder="What happened?" onChange={(event) => setNote(event.target.value)} />
        <button className="primary" type="button" disabled={sending || note.trim().length < 8} onClick={() => void send()}>
          {sending ? "Sending" : "Send note"}
        </button>
        {status && <p className="choice-note">{status}</p>}
        <button className="text" type="button" onClick={onClose}>Close</button>
    </DialogFrame>
  );
}

function label(level: Level): string {
  return level[0].toUpperCase() + level.slice(1);
}
