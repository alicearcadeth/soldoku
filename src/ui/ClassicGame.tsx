import { WinCelebration } from "./WinCelebration";
import { Brand } from "./Brand";
import { useEffect, useMemo, useRef, useState } from "react";
import { generatePuzzle } from "../engine/generate";
import { playerHint, type Hint } from "../engine/grade";
import { boardCommand, cellLabel, moveSelection } from "./boardInput";
import { publishClassicFinish } from "./classicLink";
import { nextClassicSave, parseClassicSave } from "./classicSave";
import { setMusicHeld } from "./audio";
import { feel, prefs } from "./feel";
import { advanceClassicElapsed, nextClassicMark } from "./classicClock";
import { classicSheetState } from "./classicSheet";
import { DialogFrame } from "./dialogFocus";
import { SettingsSheet } from "./SettingsSheet";
import { peerConflicts } from "../engine/grid";
import type { Level, Puzzle } from "../engine/types";

type Props = { level: Level; fresh?: boolean; resume?: boolean; onExit: () => void };

type History = { values: number[]; notes: number[]; deduced: number[]; mistakes: number };

export function ClassicGame({ level, fresh = false, resume = false, onExit }: Props) {
  const [nonce, setNonce] = useState(0);
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<number[]>([]);
  const [notes, setNotes] = useState<number[]>([]);
  const [deduced, setDeduced] = useState<number[]>(() => Array(81).fill(0));
  const [history, setHistory] = useState<History[]>([]);
  const [selected, setSelected] = useState(0);
  const [notesMode, setNotesMode] = useState(false);
  const [mistakes, setMistakes] = useState(0);
  const [won, setWon] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [hint, setHint] = useState<Hint | null>(null);
  const [hintLevel, setHintLevel] = useState(0);
  const [hintCount, setHintCount] = useState(0);
  const [revealCount, setRevealCount] = useState(0);
  const [techniques, setTechniques] = useState<string[]>([]);
  const [coach, setCoach] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const elapsedRef = useRef(0);
  const revisionRef = useRef(0);

  useEffect(() => {
    const saved = parseClassicSave(localStorage.getItem("sudoku.classic"));
    if (saved && !fresh && nonce === 0 && saved.level === level) {
      const puzzle = saved.puzzle as Puzzle;
      revisionRef.current = saved.revision;
      setPuzzle(puzzle);
      setValues(saved.values);
      setNotes(saved.notes);
      setDeduced(saved.deduced);
      setMistakes(saved.mistakes);
      setSelected(saved.selected);
      elapsedRef.current = saved.elapsed;
      setElapsed(saved.elapsed);
      setPaused(saved.paused === true && !resume);
      setWon(saved.values.every((value, index) => value === puzzle.solution[index]));
      return;
    }
    let cancel = false;
    setPuzzle(null);
    setError(null);
    setWon(false);
    setPaused(false);
    elapsedRef.current = 0;
    setElapsed(0);
    const id = window.setTimeout(() => {
      try {
        const next = generatePuzzle(level);
        if (cancel) return;
        setPuzzle(next);
        setValues(next.givens.slice());
        setNotes(Array(81).fill(0));
        setDeduced(Array(81).fill(0));
        setHistory([]);
        setMistakes(0);
        setNotesMode(false);
        setHint(null);
        setHintLevel(0);
        setHintCount(0);
        setRevealCount(0);
        sendPlay({ event: "start", level });
        setTechniques([]);
        setCoach(null);
        setSelected(Math.max(0, next.givens.findIndex((cell) => cell === 0)));
      } catch (err) {
        if (!cancel) setError(err instanceof Error ? err.message : "Could not build a puzzle");
      }
    }, 16);
    return () => {
      cancel = true;
      window.clearTimeout(id);
    };
  }, [level, nonce, fresh, resume]);

  useEffect(() => {
    if (!puzzle) return;
    const stored = parseClassicSave(localStorage.getItem("sudoku.classic"));
    const decision = nextClassicSave(stored, { level, puzzle, values, notes, deduced, mistakes, elapsed, selected, paused }, revisionRef.current);
    if (decision.action === "adopt") {
      const next = decision.save;
      const adopted = next.puzzle as Puzzle;
      revisionRef.current = next.revision;
      setPuzzle(adopted);
      setValues(next.values);
      setNotes(next.notes);
      setDeduced(next.deduced);
      setMistakes(next.mistakes);
      setSelected(next.selected);
      elapsedRef.current = next.elapsed;
      setElapsed(next.elapsed);
      setPaused(next.paused === true);
      setWon(next.values.every((value, index) => value === adopted.solution[index]));
      return;
    }
    revisionRef.current = decision.save.revision;
    localStorage.setItem("sudoku.classic", JSON.stringify(decision.save));
  }, [level, puzzle, values, notes, deduced, mistakes, elapsed, selected, paused]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== "sudoku.classic") return;
      const saved = parseClassicSave(event.newValue);
      if (!saved || saved.level !== level || saved.revision <= revisionRef.current) return;
      const adopted = saved.puzzle as Puzzle;
      revisionRef.current = saved.revision;
      setPuzzle(adopted);
      setValues(saved.values);
      setNotes(saved.notes);
      setDeduced(saved.deduced);
      setMistakes(saved.mistakes);
      setSelected(saved.selected);
      elapsedRef.current = saved.elapsed;
      setElapsed(saved.elapsed);
      setPaused(saved.paused === true);
      setWon(saved.values.every((value, index) => value === adopted.solution[index]));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [level]);

  useEffect(() => {
    if (!puzzle || won || paused) return;
    let mark = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const playing = document.visibilityState === "visible" && document.hasFocus();
      elapsedRef.current = advanceClassicElapsed(elapsedRef.current, mark, now, playing);
      mark = nextClassicMark(mark, now);
      setElapsed(elapsedRef.current);
    }, 200);
    return () => window.clearInterval(id);
  }, [puzzle, won, paused]);

  useEffect(() => {
    const onPop = () => {
      const next = classicSheetState((window.history.state as { sheet?: string } | null)?.sheet);
      setSettingsOpen(next.settings);
      setPaused(next.paused);
      if (!next.paused) setMusicHeld(false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    const pauseForLeave = () => {
      setMusicHeld(true);
      const sheet = (window.history.state as { sheet?: string } | null)?.sheet;
      if (sheet !== "pause" && sheet !== "settings") {
        window.history.pushState({ sudoku: `classic:${level}`, sheet: "pause" }, "");
      }
      setPaused(true);
    };
    const onHide = () => {
      if (document.hidden) pauseForLeave();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", pauseForLeave);
    window.addEventListener("blur", pauseForLeave);
    window.addEventListener("sudoku-shell-hide", pauseForLeave);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", pauseForLeave);
      window.removeEventListener("blur", pauseForLeave);
      window.removeEventListener("sudoku-shell-hide", pauseForLeave);
    };
  }, [level]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!puzzle || won || paused) return;
      const command = boardCommand(event);
      if (!command) return;
      if (command.type === "digit") {
        event.preventDefault();
        enterDigit(command.digit);
      } else if (command.type === "erase") {
        erase();
      } else if (command.type === "notes") {
        setNotesMode((on) => !on);
      } else if (command.type === "undo") {
        event.preventDefault();
        undo();
      } else {
        event.preventDefault();
        setSelected((index) => moveSelection(index, command.key));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const conflicts = useMemo(() => peerConflicts(values), [values]);
  const counts = useMemo(() => {
    const tally = Array(10).fill(0);
    for (const value of values) if (value) tally[value]++;
    return tally;
  }, [values]);

  function snapshot() {
    setHistory((stack) => [...stack.slice(-199), { values: values.slice(), notes: notes.slice(), deduced: deduced.slice(), mistakes }]);
  }

  function enterDigit(digit: number) {
    if (!puzzle || won || paused || counts[digit] >= 9) return;
    const given = puzzle.givens[selected] !== 0;
    if (given) return;
    snapshot();
    if (notesMode) {
      if (values[selected]) setDeduced(Array(81).fill(0));
      setValues((current) => {
        const next = current.slice();
        next[selected] = 0;
        return next;
      });
      setNotes((current) => {
        const next = current.slice();
        next[selected] = next[selected] ^ (1 << digit);
        return next;
      });
      return;
    }
    const nextValues = values.slice();
    nextValues[selected] = digit;
    const nextNotes = notes.slice();
    nextNotes[selected] = 0;
    if (digit) {
      const bit = ~(1 << digit);
      for (const peer of peersOf(selected)) nextNotes[peer] &= bit;
    }
    setValues(nextValues);
    setNotes(nextNotes);
    setDeduced((current) => {
      const next = digit === puzzle.solution[selected] ? current.slice() : Array(81).fill(0);
      next[selected] = 0;
      return next;
    });
    const correct = digit === puzzle.solution[selected];
    if (!correct) setMistakes((count) => count + 1);
    const solved = nextValues.every((value, index) => value === puzzle.solution[index]);
    feel(solved ? "done" : correct ? "tap" : "wrong");
    if (solved) {
      setWon(true);
      rememberBest(level, elapsedRef.current);
      rememberJournal({ level, elapsed: elapsedRef.current, mistakes, hints: hintCount, techniques });
      void publishClassicFinish();
      sendPlay({
        event: "finish",
        level,
        hints: hintCount,
        reveals: revealCount,
        mistakes,
        seconds: Math.floor(elapsedRef.current / 1000),
      });
    }
  }

  function erase() {
    if (!puzzle || puzzle.givens[selected]) return;
    snapshot();
    setValues((current) => {
      const next = current.slice();
      next[selected] = 0;
      return next;
    });
    setNotes((current) => {
      const next = current.slice();
      next[selected] = 0;
      return next;
    });
    setDeduced(Array(81).fill(0));
  }

  function undo() {
    setHistory((stack) => {
      const previous = stack[stack.length - 1];
      if (!previous) return stack;
      setValues(previous.values);
      setNotes(previous.notes);
      setDeduced(previous.deduced ?? Array(81).fill(0));
      setMistakes(previous.mistakes);
      setWon(false);
      return stack.slice(0, -1);
    });
  }

  function requestExit() {
    onExit();
  }

  function pauseGame() {
    setMusicHeld(true);
    window.history.pushState({ sudoku: `classic:${level}`, sheet: "pause" }, "");
    setPaused(true);
  }

  function openSettings() {
    if ((window.history.state as { sheet?: string } | null)?.sheet !== "settings") {
      window.history.pushState({ sudoku: `classic:${level}`, sheet: "settings" }, "");
    }
    setSettingsOpen(true);
  }

  function closeSettings() {
    if ((window.history.state as { sheet?: string } | null)?.sheet === "settings") window.history.back();
    else setSettingsOpen(false);
  }

  function resumeGame() {
    setMusicHeld(false);
    if ((window.history.state as { sheet?: string } | null)?.sheet === "pause") window.history.back();
    else setPaused(false);
  }

  function leavePaused() {
    setMusicHeld(false);
    setPaused(false);
    if ((window.history.state as { sheet?: string } | null)?.sheet === "pause") {
      window.history.replaceState({ sudoku: `classic:${level}` }, "");
    }
    onExit();
  }

  function beginNewPuzzle() {
    setConfirmNew(false);
    setMusicHeld(false);
    if ((window.history.state as { sheet?: string } | null)?.sheet === "pause") window.history.back();
    setPaused(false);
    setNonce((n) => n + 1);
  }

  function askHint() {
    if (!puzzle) return;
    if (hint && hintLevel === 1 && hint.digit) {
      setHintLevel(2);
      setRevealCount((count) => count + 1);
      sendPlay({ event: "hint", stage: 2 });
      return;
    }
    const next = playerHint(values, puzzle.solution, deduced);
    if (hint && next.digit == null && next.technique === hint.technique && sameCells(next.cells, hint.cells) && next.cleared === hint.cleared) {
      setHint(next);
      setHintLevel(1);
      return;
    }
    setHint(next);
    setHintLevel(1);
    if (next.cuts.length) {
      setDeduced((current) => {
        const applied = current.slice();
        next.cells.forEach((cell, index) => { applied[cell] |= next.cuts[index] ?? 0; });
        return applied;
      });
      setNotes((current) => current.map((mask, index) => {
        const cut = next.cells.indexOf(index);
        return cut < 0 ? mask : mask & ~(next.cuts[cut] ?? 0);
      }));
    }
    if (next.technique === "check" || next.technique === "none") return;
    feel("hint");
    setHintCount((count) => count + 1);
    setTechniques((current) => current.includes(next.technique) ? current : [...current, next.technique]);
    sendPlay({ event: "hint", stage: 1 });
  }

  async function askCoach() {
    const summary = `${title(level)} in ${formatTime(elapsedRef.current)}. ${mistakes} mistakes. ${hintCount} hints.`;
    setCoach(summary);
    try {
      const response = await fetch("/api/coach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "summary", level, mistakes, hints: hintCount, elapsed: Math.floor(elapsedRef.current / 1000), techniques }),
      });
      const data = await response.json();
      if (typeof data.text === "string") setCoach(data.text);
    } catch {
      setCoach(summary);
    }
  }

  if (error) {
    return (
      <main className="app">
        <Brand />
        <p>{error}</p>
        <button className="primary" onClick={() => setNonce((n) => n + 1)}>
          Try again
        </button>
        <button className="text" onClick={onExit}>Home</button>
      </main>
    );
  }

  if (!puzzle) {
    return (
      <main className="app"><Brand />
        <p className="lede">Setting the grid…</p>
        <button className="text" onClick={onExit}>Home</button>
      </main>
    );
  }

  const selectedValue = values[selected];

  return (
    <main className="app game"><Brand /><WinCelebration eventKey={won && puzzle ? `classic:${puzzle.givens.join("")}` : null} message="Sudoku solved!" feedback={false} />
      <div className={paused ? "concealed" : undefined} inert={paused || won}>
      <header className="bar">
        <button className="text" onClick={requestExit}>
          Home
        </button>
        <div className="bar-mid">
          <strong>{title(level)}</strong>
          <span>{formatTime(elapsed)}</span>
        </div>
        <button className="text" onClick={pauseGame}>
          Pause
        </button>
      </header>
      <p className="status">Mistakes {mistakes}</p>
      <div className="board-wrap">
        <div className="board" role="grid" aria-label="Sudoku">
          {values.map((value, index) => {
            const given = puzzle.givens[index] !== 0;
            const classes = [
              "cell",
              given ? "given" : "entry",
              index === selected ? "selected" : "",
              hint && (hintLevel > 1 && hint.index != null ? hint.index === index : hint.cells.includes(index)) ? "hint" : "",
              prefs().highlights && sameHouse(index, selected) ? "peer" : "",
              prefs().highlights && selectedValue && value === selectedValue ? "match" : "",
              conflicts[index] ? "conflict" : "",
              index % 9 === 2 || index % 9 === 5 ? "thick-r" : "",
              Math.floor(index / 9) === 2 || Math.floor(index / 9) === 5 ? "thick-b" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <button
                key={index}
                type="button"
                role="gridcell"
                className={classes}
                aria-label={cellLabel(index, value, given, notes[index], conflicts[index])}
                aria-selected={index === selected}
                onClick={() => setSelected(index)}
              >
                {value ? (
                  value
                ) : (
                  <span className="notes">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
                      <i key={digit}>{notes[index] & (1 << digit) ? digit : ""}</i>
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="tools">
        <button type="button" onClick={undo} disabled={history.length === 0}>
          Undo
        </button>
        <button type="button" onClick={erase}>
          Erase
        </button>
        <button type="button" className={notesMode ? "on" : ""} aria-pressed={notesMode} onClick={() => { localStorage.setItem("sudoku.notes.hint", "1"); setNotesMode((on) => !on); }}>
          {notesMode ? "Notes on" : "Notes"}
        </button>
        <button type="button" onClick={askHint}>Hint</button>
      </div>
      {hint && !won && hintLevel > 0 && (
        <p className="choice-note">
          {hintLevel > 1 && hint.digit && !hint.text.includes(`digit is ${hint.digit}`) ? `${hint.text} The digit is ${hint.digit}.` : hint.text}
        </p>
      )}
      {!notesMode && !localStorage.getItem("sudoku.notes.hint") && (
        <p className="choice-note">Notes lets you pencil in a candidate without filling the cell.</p>
      )}
      <div className="pad">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
          <button key={digit} type="button" disabled={counts[digit] >= 9} onClick={() => enterDigit(digit)}>
            {digit}
            <small>{9 - counts[digit]}</small>
          </button>
        ))}
      </div>
      </div>
      {paused && !won && (
        <DialogFrame id="pause-title" onClose={resumeGame}>
            <h2 id="pause-title">Paused</h2>
            <p>Game paused</p>
            <p>{formatTime(elapsed)}</p>
            <p className="choice-note">The clock counts only while you are playing.</p>
            <button className="primary" type="button" onClick={resumeGame}>
              Resume
            </button>
            <button className="secondary" type="button" onClick={() => setConfirmNew(true)}>
              New game
            </button>
            <button className="text" type="button" onClick={openSettings}>
              Settings
            </button>
            <button className="text" type="button" onClick={leavePaused}>
              Home
            </button>
        </DialogFrame>
      )}
      {confirmNew && (
        <DialogFrame id="new-puzzle-title" onClose={() => setConfirmNew(false)}>
            <h2 id="new-puzzle-title">Replace this game?</h2>
            <p>This unfinished game will be replaced. Finished games stay in your history.</p>
            <button className="primary" type="button" onClick={beginNewPuzzle}>Start new game</button>
            <button className="text" type="button" onClick={() => { setConfirmNew(false); resumeGame(); }}>Return to game</button>
        </DialogFrame>
      )}
      {settingsOpen && <SettingsSheet onClose={closeSettings} onHome={requestExit} />}
      {won && (
        <DialogFrame id="solved-title" onClose={() => { localStorage.removeItem("sudoku.classic"); onExit(); }}>
            <h2 id="solved-title">Solved</h2>
            <p>{formatTime(elapsed)}</p>
            <p className="choice-note">{bestLine(level, elapsed)}</p>
            <p>{coach ?? `${mistakes} mistakes. ${hintCount} hints.`}</p>
            <button className="secondary" type="button" onClick={() => void askCoach()}>Coach</button>
            <button className="primary" onClick={() => setNonce((n) => n + 1)}>
              New game
            </button>
            <button className="text" onClick={() => { localStorage.removeItem("sudoku.classic"); onExit(); }}>
              Home
            </button>
        </DialogFrame>
      )}
    </main>
  );
}

function peersOf(index: number): number[] {
  const row = Math.floor(index / 9);
  const col = index % 9;
  const boxR = Math.floor(row / 3) * 3;
  const boxC = Math.floor(col / 3) * 3;
  const peers = new Set<number>();
  for (let i = 0; i < 9; i++) {
    peers.add(row * 9 + i);
    peers.add(i * 9 + col);
  }
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) peers.add((boxR + r) * 9 + boxC + c);
  }
  peers.delete(index);
  return [...peers];
}

function sameHouse(index: number, selected: number): boolean {
  return (
    Math.floor(index / 9) === Math.floor(selected / 9) ||
    index % 9 === selected % 9 ||
    (Math.floor(Math.floor(index / 9) / 3) === Math.floor(Math.floor(selected / 9) / 3) &&
      Math.floor((index % 9) / 3) === Math.floor((selected % 9) / 3))
  );
}


function title(level: Level): string {
  return level[0].toUpperCase() + level.slice(1);
}

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function sameCells(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((cell, index) => cell === right[index]);
}

function sendPlay(body: object) {
  void fetch("/api/play", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, audience: "player" }),
  }).catch(() => undefined);
}

function rememberJournal(entry: { level: Level; elapsed: number; mistakes: number; hints: number; techniques: string[] }) {
  let prior: unknown[] = [];
  try {
    prior = JSON.parse(localStorage.getItem("sudoku.journal") ?? "[]") as unknown[];
  } catch {
    prior = [];
  }
  localStorage.setItem("sudoku.journal", JSON.stringify([...prior, entry].slice(-20)));
}

function bestKey(level: Level): string {
  return `sudoku.best.${level}`;
}

function rememberBest(level: Level, ms: number) {
  const previous = Number(localStorage.getItem(bestKey(level)));
  if (!previous || ms < previous) localStorage.setItem(bestKey(level), String(ms));
}

function bestLine(level: Level, ms: number): string {
  const previous = Number(localStorage.getItem(bestKey(level)));
  if (!previous || ms <= previous) return "Best time on this phone";
  return `Best ${formatTime(previous)}`;
}
