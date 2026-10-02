import { Brand } from "./Brand";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Keypair, Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { peerConflicts } from "../engine/grid";
import { connectPlayWallet, connectedChains, disconnectPlayWallet, listPlayWallets, onPlayAccount, reconnectPlayWallet, setPlayChain, walletAddressBeforeConnect, walletChanged, walletClusterWarning, type PlayWallet } from "../solana/browserWallet";
import { connectMobileWallet, mobileWalletAvailable, signMessageWithMobileWallet, signWithMobileWallet } from "../solana/mwa";
import { depositClick, historyStamp, refundOpen } from "../solana/recover";
import { stakeChoices } from "../solana/stake";
import { STAGING_ESCROW_PROGRAM_ID } from "../solana/program";
import { AddFunds } from "./AddFunds";
import { boardCommand, cellLabel, moveSelection, playerFacingError, roomStatusError, roomStatusRecovered } from "./boardInput";
import { DEPOSIT_HOLD_NOTE, NEW_DEPOSITS_HELD } from "./depositHold";
import { depositActionLabel, shortAddress, walletBalanceCopy, walletStatusDetail } from "./copy";
import { boardFromPoll } from "./classicSave";
import { DialogFrame } from "./dialogFocus";
import { feel, prefs, valueFromPointer } from "./feel";
import { LEVELS, type Level } from "../engine/types";
import type { PublicRoom } from "../match/rooms";
import { emptyBook, noteResult, type RecordBook } from "./record";

type Props = { onExit: () => void; initialMode?: "practice" | "staked" };

type Gate = { id: string; target: number; value: number; ok: boolean; error: string | null };

export function Compete({ onExit, initialMode = "practice" }: Props) {
  const [gate, setGate] = useState<Gate | null>(null);
  const [gateError, setGateError] = useState<string | null>(null);
  const [gateAttempt, setGateAttempt] = useState(0);
  const [level, setLevel] = useState<Level>("medium");
  const [codeInput, setCodeInput] = useState("");
  const [seat, setSeat] = useState<{ code: string; playerId: string } | null>(() => {
    const saved = localStorage.getItem("sudoku.seat");
    return saved ? (JSON.parse(saved) as { code: string; playerId: string }) : null;
  });
  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [values, setValues] = useState<number[] | null>(null);
  const movesInFlight = useRef(0);
  const actionLock = useRef(false);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [mode, setMode] = useState<"practice" | "staked">(initialMode);
  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);
  const [shortClock, setShortClock] = useState(false);
  const [localnet, setLocalnet] = useState(false);
  const [staging, setStaging] = useState(false);
  const [mwa, setMwa] = useState(false);
  const [wallet, setWallet] = useState<string | null>(null);
  useEffect(() => {
    setMwa(mobileWalletAvailable());
  }, []);
  const walletRef = useRef<string | null>(null);
  const [funded, setFunded] = useState(() => localStorage.getItem("sudoku.player") !== null);
  const [chainNote, setChainNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [openRooms, setOpenRooms] = useState<{ code: string; level: string; waitingSec: number }[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [historyNote, setHistoryNote] = useState<string | null>(null);
  const [historyRows, setHistoryRows] = useState<{ code: string; mode: string; level: string; outcome: string; chain?: string | null }[]>([]);
  const [profile, setProfile] = useState<{ practice: { wins: number; losses: number; draws: number }; competitive: { wins: number; losses: number; draws: number }; classicCompleted: number } | null>(null);
  const [stake, setStake] = useState("1000000");
  const [cluster, setCluster] = useState("devnet");
  const [chainReady, setChainReady] = useState(false);
  const [walletWarning, setWalletWarning] = useState<string | null>(null);
  const [balances, setBalances] = useState<{ sol: number; token: string } | null>(null);
  const [walletChoices, setWalletChoices] = useState<PlayWallet[]>([]);
  const [classicLink, setClassicLink] = useState<string | null>(() => localStorage.getItem("sudoku.classicWallet"));
  const [funds, setFunds] = useState<{ status: number | null; joinDeadline: number | null; settleDeadline: number | null } | null>(null);

  useEffect(() => {
    void get("/api/chain").then((data: { localnet?: boolean; staging?: boolean; cluster?: string }) => {
      const isLocal = data.localnet === true;
      setLocalnet(isLocal);
      setStaging(data.staging === true);
      if (data.cluster) {
        setCluster(data.cluster);
        setPlayChain(data.cluster);
      }
      setChainReady(true);
      if ((isLocal || data.staging === true) && localStorage.getItem("sudoku.player")) setWallet(playerKey().publicKey.toBase58());
    }).catch(() => setLocalnet(false));
  }, []);

  useEffect(() => {
    let stop = false;
    void post("/api/captcha").then((data: { id: string; target: number }) => {
      if (stop) return;
      setGateError(null);
      setGate({ id: data.id, target: data.target, value: 0, ok: false, error: null });
    }).catch((err) => {
      if (!stop) setGateError(err instanceof Error ? err.message : "Compete could not be opened. Try again.");
    });
    return () => {
      stop = true;
    };
  }, [gateAttempt]);

  useEffect(() => {
    if (!seat) return;
    const saved = localStorage.getItem("sudoku.pending");
    if (!saved) return;
    const pending = JSON.parse(saved) as { code: string; playerId: string; tx: string };
    if (pending.code !== seat.code || pending.playerId !== seat.playerId) return;
    setBusy("Checking the submitted transaction");
    void post("/api/rooms/deposit", pending)
      .then((next) => {
        localStorage.removeItem("sudoku.pending");
        setRoom(next);
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : "The deposit was not confirmed";
        if (/expired|deadline/i.test(message)) localStorage.removeItem("sudoku.pending");
        setError(message);
      })
      .finally(() => setBusy(null));
  }, [seat]);

  useEffect(() => {
    if (!seat) return;
    let stop = false;
    const pull = async () => {
      try {
        const next = await get(`/api/rooms/state?code=${seat.code}&playerId=${seat.playerId}`);
        if (stop) return;
        setRoom(next);
        setValues((current) => boardFromPoll(current, next.board ?? next.givens, movesInFlight.current));
        setError(roomStatusRecovered);
      } catch (err) {
        if (!stop) setError((current) => roomStatusError(current, err instanceof Error ? err.message : "Room unavailable"));
      }
    };
    void pull();
    const id = window.setInterval(() => void pull(), 1000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [seat]);

  useEffect(() => {
    if (seat || mode !== "practice") return;
    let stop = false;
    const pull = async () => {
      try {
        const data = await get("/api/rooms/open");
        if (!stop) setOpenRooms(data.rooms ?? []);
      } catch {
        if (!stop) setOpenRooms([]);
      }
    };
    void pull();
    const id = window.setInterval(() => void pull(), 5000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [seat, mode]);

  useEffect(() => {
    if (!seat || !room?.staked) return;
    let stop = false;
    const pull = async () => {
      try {
        const next = await get(`/api/rooms/funds?code=${seat.code}`);
        if (!stop) setFunds(next);
      } catch {
        if (!stop) setFunds(null);
      }
    };
    void pull();
    const id = window.setInterval(() => void pull(), 5000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [seat, room?.staked, room?.chain]);

  useEffect(() => {
    if (!chainReady || localnet) return;
    void reconnectPlayWallet().then((address) => {
      if (!address) return;
      if (walletChanged(walletAddressBeforeConnect(), address)) {
        setDisplayName("");
        setProfile(null);
        setHistoryRows([]);
        setHistoryNote(null);
        localStorage.removeItem("sudoku.seat");
        localStorage.removeItem("sudoku.pending");
        setSeat(null);
        setRoom(null);
        setValues(null);
        setFunds(null);
        setError("The wallet account changed. The previous account keeps its profile and match.");
      }
      walletRef.current = address;
      setWallet(address);
      setWalletWarning(walletClusterWarning(connectedChains(), cluster));
    });
  }, [chainReady, localnet, cluster]);

  useEffect(() => {
    return onPlayAccount((address) => {
      const previous = walletRef.current;
      if (walletChanged(previous, address)) {
        setDisplayName("");
        setProfile(null);
        setHistoryRows([]);
        setHistoryNote(null);
        localStorage.removeItem("sudoku.seat");
        localStorage.removeItem("sudoku.pending");
        setSeat(null);
        setRoom(null);
        setValues(null);
        setFunds(null);
        setError("The wallet account changed. The previous account keeps its profile and match.");
      }
      walletRef.current = address;
      setWallet(address);
      setBalances(null);
      setWalletWarning(walletClusterWarning(connectedChains(), cluster));
    });
  }, [cluster]);

  useEffect(() => {
    if (!wallet || localnet) return;
    void get(`/api/balances?wallet=${encodeURIComponent(wallet)}`).then((data: { sol?: number; token?: string }) => {
      setBalances({ sol: data.sol ?? 0, token: data.token ?? "0" });
    }).catch(() => setBalances(null));
  }, [wallet, localnet]);

  useEffect(() => {
    if (!wallet) return;
    void get(`/api/profile?wallet=${encodeURIComponent(wallet)}`).then((data: { name?: string | null }) => {
      setDisplayName(data.name ?? "");
    }).catch(() => setDisplayName(""));
  }, [wallet]);

  useEffect(() => {
    if (!room?.verdict || !wallet || !seat) return;
    const seenKey = `sudoku.history.${seat.code}`;
    const stamp = historyStamp(room.staked, room.chain);
    if (localStorage.getItem(seenKey) === stamp) return;
    let stop = false;
    void (async () => {
      try {
        const at = Date.now();
        const message = new TextEncoder().encode(`sudoku-history:${wallet}:${seat.code}:${Math.floor(at / 1000)}`);
        const mobile = localnet ? null : await signMessageWithMobileWallet(message);
        if (!localnet && !mobile) return;
        const signature = mobile ? bs58.encode(mobile) : bs58.encode(nacl.sign.detached(message, playerKey().secretKey));
        const saved = await post("/api/history", { wallet, code: seat.code, signature, at });
        if (stop) return;
        localStorage.setItem(seenKey, stamp);
        const recent = Array.isArray(saved.recent) ? saved.recent : [];
        const wins = recent.filter((item: { outcome: string }) => item.outcome === "win").length;
        setHistoryRows(recent);
        setHistoryNote(`Saved for this wallet. ${wins} won in the last ${recent.length}.`);
      } catch {
        // The match result remains if the wallet record cannot be signed.
      }
    })();
    return () => {
      stop = true;
    };
  }, [room?.verdict, room?.chain, room?.staked, wallet, seat, localnet]);

  useEffect(() => {
    if (!room?.verdict || !seat) return;
    const seenKey = `sudoku.recorded.${seat.code}`;
    if (localStorage.getItem(seenKey)) return;
    localStorage.setItem(seenKey, "1");
    const book = readBook();
    const outcome = room.verdict.outcome === "draw" ? "draw" : room.youWon ? "win" : "loss";
    localStorage.setItem("sudoku.stats", JSON.stringify(noteResult(book, room.staked ? "staked" : "practice", outcome)));
  }, [room, seat]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  const conflicts = useMemo(() => (values ? peerConflicts(values) : []), [values]);

  function takeAction(): boolean {
    if (actionLock.current) return false;
    actionLock.current = true;
    return true;
  }

  function dropAction() {
    actionLock.current = false;
  }

  async function slideEnd(value: number) {
    if (!gate || gate.ok) return;
    const result = await post("/api/captcha/check", { id: gate.id, value });
    if (result.ok) setGate({ ...gate, ok: true, error: null });
    else {
      const fresh = await post("/api/captcha");
      setGate({ id: fresh.id, target: fresh.target, value: 0, ok: false, error: "Slide the knob onto the notch" });
    }
  }

  async function host() {
    if (mode === "staked" && NEW_DEPOSITS_HELD) {
      setError(DEPOSIT_HOLD_NOTE);
      return;
    }
    if (mode === "staked" && !gate?.ok) return;
    if (!takeAction()) return;
    setError(null);
    setBusy("Opening the room");
    try {
      const next = await post("/api/rooms", {
        level,
        captchaId: mode === "staked" ? gate?.id : "",
        practice: mode === "practice",
        wallet: mode === "staked" ? wallet : undefined,
        stake: mode === "staked" ? stake : undefined,
        short: mode === "staked" && shortClock,
      });
      const nextSeat = { code: next.code, playerId: next.playerId };
      localStorage.setItem("sudoku.seat", JSON.stringify(nextSeat));
      setSeat(nextSeat);
      setRoom(next);
      setValues(next.givens.slice());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open a room");
    } finally {
      dropAction();
      setBusy(null);
    }
  }

  async function quick() {
    if (mode !== "practice" || !takeAction()) return;
    setError(null);
    setBusy("Opening the room");
    try {
      const next = await post("/api/rooms/quick", { level, captchaId: "" });
      const nextSeat = { code: next.code, playerId: next.playerId };
      localStorage.setItem("sudoku.seat", JSON.stringify(nextSeat));
      setSeat(nextSeat);
      setRoom(next);
      setValues(next.givens.slice());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not find a game");
    } finally {
      dropAction();
      setBusy(null);
    }
  }

  async function loadHistory() {
    if (!wallet || !takeAction()) return;
    setBusy("Waiting for your approval");
    setError(null);
    try {
      const at = Date.now();
      const message = new TextEncoder().encode(`sudoku-history:${wallet}:${Math.floor(at / 1000)}`);
      const mobile = localnet ? null : await signMessageWithMobileWallet(message);
      if (!localnet && !mobile) throw new Error("Connect a wallet. No supported wallet was found.");
      const signature = mobile ? bs58.encode(mobile) : bs58.encode(nacl.sign.detached(message, playerKey().secretKey));
      const saved = await post("/api/history", { wallet, signature, at });
      setHistoryRows(Array.isArray(saved.recent) ? saved.recent : []);
      if (saved.practice && saved.competitive) {
        setProfile({ practice: saved.practice, competitive: saved.competitive, classicCompleted: saved.classicCompleted ?? 0 });
        localStorage.setItem("sudoku.classicSent", String(saved.classicCompleted ?? 0));
      }
    } catch (err) {
      setError(playerFacingError(err, "History was not available"));
    } finally {
      dropAction();
      setBusy(null);
    }
  }

  async function saveName() {
    if (!wallet || !displayName.trim() || !takeAction()) return;
    setBusy("Waiting for your approval");
    setError(null);
    try {
      const at = Date.now();
      const name = displayName.trim().replace(/\s+/g, " ");
      const message = new TextEncoder().encode(`sudoku-name:${wallet}:${name}:${Math.floor(at / 1000)}`);
      const mobile = localnet ? null : await signMessageWithMobileWallet(message);
      if (!localnet && !mobile) throw new Error("Connect a wallet. No supported wallet was found.");
      const signature = mobile ? bs58.encode(mobile) : bs58.encode(nacl.sign.detached(message, playerKey().secretKey));
      const saved = await post("/api/profile", { wallet, name, signature, at });
      setDisplayName(saved.name);
    } catch (err) {
      setError(playerFacingError(err, "Name was not saved"));
    } finally {
      dropAction();
      setBusy(null);
    }
  }

  function leavePractice() {
    if (room?.staked) return;
    localStorage.removeItem("sudoku.seat");
    setSeat(null);
    setRoom(null);
    setValues(null);
    setFunds(null);
    setError(null);
  }

  async function join(code = codeInput.trim()) {
    if (mode === "staked" && NEW_DEPOSITS_HELD) {
      setError(DEPOSIT_HOLD_NOTE);
      return;
    }
    if (mode === "staked" && !gate?.ok) return;
    if (!takeAction()) return;
    setError(null);
    setBusy("Opening the room");
    try {
      const next = await post("/api/rooms/join", { code, captchaId: mode === "staked" ? gate?.id : "", wallet: mode === "staked" ? wallet : undefined });
      const nextSeat = { code: next.code, playerId: next.playerId };
      localStorage.setItem("sudoku.seat", JSON.stringify(nextSeat));
      setSeat(nextSeat);
      setRoom(next);
      setValues(next.givens.slice());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join");
    } finally {
      dropAction();
      setBusy(null);
    }
  }

  async function fund() {
    if (!takeAction()) return;
    setBusy("Requesting test tokens");
    setError(null);
    try {
      const key = playerKey();
      setWallet(key.publicKey.toBase58());
      await post("/api/faucet", { pubkey: key.publicKey.toBase58() });
      setFunded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test tokens were not issued");
    } finally {
      dropAction();
      setBusy(null);
    }
  }

  async function signPrepared(tx: Transaction): Promise<string> {
    const wallets = listPlayWallets();
    const mobileSigned = wallets.length > 0 ? await signWithMobileWallet(tx.serialize({ requireAllSignatures: false })) : null;
    if (wallets.length > 0 && !mobileSigned) throw new Error("The wallet did not approve the transaction.");
    if (mobileSigned) return toBase64(mobileSigned);
    if (localnet || staging) return signLocally(tx);
    throw new Error("This wallet cannot sign the transaction. Choose one that supports signing, or switch it to Devnet.");
  }

  async function deposit() {
    if (!seat) return;
    const saved = readPending("sudoku.pending", seat);
    if (NEW_DEPOSITS_HELD && !saved) {
      setError(DEPOSIT_HOLD_NOTE);
      return;
    }
    if (!takeAction()) return;
    setError(null);
    if (depositClick(Boolean(saved), error) === "recheck" && saved) {
      setBusy("Checking the submitted transaction");
      try {
        const next = await post("/api/rooms/deposit", saved);
        localStorage.removeItem("sudoku.pending");
        setRoom(next);
      } catch (err) {
        const message = playerFacingError(err, "Deposit was not confirmed");
        if (/expired|deadline/i.test(message)) localStorage.removeItem("sudoku.pending");
        setError(message);
      } finally {
        dropAction();
        setBusy(null);
      }
      return;
    }
    setBusy("Waiting for your approval");
    try {
      const prepared = await post("/api/rooms/prepare", seat);
      const tx = Transaction.from(fromBase64(prepared.tx));
      const raw = await signPrepared(tx);
      setBusy("Transaction submitted");
      localStorage.setItem("sudoku.pending", JSON.stringify({ ...seat, tx: raw }));
      const next = await post("/api/rooms/deposit", { ...seat, tx: raw });
      localStorage.removeItem("sudoku.pending");
      setRoom(next);
    } catch (err) {
      const message = playerFacingError(err, "Deposit was not confirmed");
      if (/expired|deadline/i.test(message)) localStorage.removeItem("sudoku.pending");
      setError(message);
    } finally {
      dropAction();
      setBusy(null);
    }
  }

  async function connect(name?: string) {
    if (!takeAction()) return;
    setBusy("Connecting wallet");
    setError(null);
    try {
      const found = listPlayWallets();
      setWalletChoices(found);
      const picked = name ?? (found.length === 1 ? found[0]?.name : null);
      if (!picked && found.length > 1) return;
      const address = picked ? await connectPlayWallet(picked) : await connectMobileWallet();
      if (!address) throw new Error("Connect a wallet. No supported wallet was found. A Seeker uses the mobile wallet. A desktop browser needs a Wallet Standard wallet.");
      if (walletChanged(walletRef.current, address)) {
        setDisplayName("");
        setProfile(null);
        setHistoryRows([]);
        setHistoryNote(null);
        localStorage.removeItem("sudoku.seat");
        localStorage.removeItem("sudoku.pending");
        setSeat(null);
        setRoom(null);
        setValues(null);
        setFunds(null);
        setError("The wallet account changed. The previous account keeps its profile and match.");
      }
      walletRef.current = address;
      setWallet(address);
      setWalletWarning(walletClusterWarning(connectedChains(), cluster));
      setWalletChoices([]);
    } catch (err) {
      setError(playerFacingError(err, "Wallet connection failed"));
    } finally {
      dropAction();
      setBusy(null);
    }
  }

  async function disconnect() {
    const staked = room?.staked === true;
    await disconnectPlayWallet();
    walletRef.current = null;
    setWallet(null);
    setBalances(null);
    setProfile(null);
    setDisplayName("");
    setHistoryRows([]);
    setHistoryNote(null);
    setWalletWarning(null);
    if (staked) {
      localStorage.removeItem("sudoku.seat");
      localStorage.removeItem("sudoku.pending");
      setSeat(null);
      setRoom(null);
      setValues(null);
      setFunds(null);
    }
  }

  async function resume() {
    if (!takeAction()) return;
    setBusy("Checking wallet");
    setError(null);
    try {
      const pubkey = wallet ?? (localnet ? playerKey().publicKey.toBase58() : null);
      if (!pubkey) throw new Error("Connect a wallet. No supported wallet was found.");
      const code = codeInput.trim().toUpperCase();
      const message = new TextEncoder().encode(`sudoku-seat:${code}:${pubkey}`);
      const mobile = localnet ? null : await signMessageWithMobileWallet(message);
      if (!localnet && !mobile) throw new Error("Connect a wallet. No supported wallet was found.");
      const signature = mobile ? bs58.encode(mobile) : bs58.encode(nacl.sign.detached(message, playerKey().secretKey));
      const next = await post("/api/rooms/claim", { code, wallet: pubkey, signature });
      const nextSeat = { code: next.code, playerId: next.playerId };
      localStorage.setItem("sudoku.seat", JSON.stringify(nextSeat));
      setSeat(nextSeat);
      setRoom(next);
      setValues((next.board ?? next.givens).slice());
    } catch (err) {
      setError(playerFacingError(err, "Could not resume"));
    } finally {
      dropAction();
      setBusy(null);
    }
  }

  async function refund() {
    if (!seat || !takeAction()) return;
    setError(null);
    setChainNote(null);
    const saved = readPending("sudoku.pendingRefund", seat);
    if (depositClick(Boolean(saved), error) === "recheck" && saved) {
      setBusy("Checking the submitted transaction");
      try {
        const next = await post("/api/rooms/refund", saved);
        localStorage.removeItem("sudoku.pendingRefund");
        setRoom(next);
        setChainNote(next.paid ? "Refund confirmed on-chain." : "This refund was already confirmed on-chain.");
      } catch (err) {
        const message = playerFacingError(err, "Refund was not confirmed");
        if (message.includes("expired")) localStorage.removeItem("sudoku.pendingRefund");
        setError(message);
      } finally {
        dropAction();
        setBusy(null);
      }
      return;
    }
    setBusy("Waiting for your approval");
    try {
      const prepared = await post("/api/rooms/prepare-refund", seat);
      const tx = Transaction.from(fromBase64(prepared.tx));
      const raw = await signPrepared(tx);
      setBusy("Transaction submitted");
      const body = { ...seat, tx: raw };
      localStorage.setItem("sudoku.pendingRefund", JSON.stringify(body));
      const next = await post("/api/rooms/refund", body);
      localStorage.removeItem("sudoku.pendingRefund");
      setRoom(next);
      setChainNote(next.paid ? "Refund confirmed on-chain." : "This refund was already confirmed on-chain.");
    } catch (err) {
      const message = playerFacingError(err, "Refund was not confirmed");
      if (message.includes("expired")) localStorage.removeItem("sudoku.pendingRefund");
      setError(message);
    } finally {
      dropAction();
      setBusy(null);
    }
  }

  async function closeMatch() {
    if (!seat || !takeAction()) return;
    setError(null);
    setBusy("Waiting for your approval");
    try {
      const prepared = await post("/api/rooms/prepare-close", seat);
      if (!prepared.tx) throw new Error("The match account is already closed");
      const tx = Transaction.from(fromBase64(prepared.tx));
      const raw = await signPrepared(tx);
      setBusy("Transaction submitted");
      const next = await post("/api/rooms/close", { ...seat, tx: raw });
      setRoom(next);
      setChainNote("Close confirmed. The match account is gone and its rent returned to the opener.");
    } catch (err) {
      setError(playerFacingError(err, "Close was not confirmed"));
    } finally {
      dropAction();
      setBusy(null);
    }
  }

  function enterDigit(digit: number) {
    if (!room || !values || !seat || !room.startedAt || room.verdict) return;
    if (room.givens[selected]) return;
    const next = values.slice();
    next[selected] = digit;
    const previous = values;
    setValues(next);
    feel("tap");
    movesInFlight.current += 1;
    void post("/api/rooms/move", { code: seat.code, playerId: seat.playerId, values: next })
      .then((updated) => {
        setRoom(updated);
        if (Array.isArray(updated.board)) setValues(updated.board.slice());
      })
      .catch((err) => {
        setValues(previous);
        setError(playerFacingError(err, "Move rejected"));
      })
      .finally(() => {
        movesInFlight.current = Math.max(0, movesInFlight.current - 1);
      });
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!room || !values || room.verdict) return;
      const command = boardCommand(event);
      if (!command) return;
      if (command.type === "digit") {
        event.preventDefault();
        enterDigit(command.digit);
      } else if (command.type === "move") {
        event.preventDefault();
        setSelected((index) => moveSelection(index, command.key));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (room && values) {
    const remaining = room.startedAt ? Math.max(0, room.limitMs - (now - room.startedAt)) : room.limitMs;
    return (
      <main className="app game"><Brand />
        <header className="bar">
          <button className="text" type="button" onClick={onExit}>Home</button>
          <div className="bar-mid">
            <strong>{room.code}</strong>
            <span>{room.startedAt ? formatTime(remaining) : "Waiting"}</span>
          </div>
          <span className="chip">{room.opponent?.joined ? `${room.opponent.filled} filled` : "No opponent"}</span>
        </header>
        <p className="status">
          <span className="chip">{roomState(room)}</span>
          {room.staked && <span className="chip">{room.stake ?? "1 test token"} each · pool {poolLabel(room.stake)}</span>}
        </p>
        {!room.startedAt && (
          <p className="lede">
            {room.expired
              ? `Room ${room.code} expired before anyone deposited. It stays on the previous escrow and cannot take a new stake. Create a new room.`
              : room.staked
              ? room.you.deposited
                ? `Share code ${room.code}. Waiting for the other deposit.`
                : `Share code ${room.code}. Deposit ${room.stake ?? "1 test token"} to lock the stake.`
              : room.listed
                ? `Share code ${room.code}, or wait here. Quick match can seat the next player.`
                : `Share code ${room.code}. The clock starts when a second player joins.`}
          </p>
        )}
        {!room.staked && (
          <button className="text" type="button" onClick={leavePractice}>Leave this race</button>
        )}
        {room.staked && !room.expired && !room.you.deposited && room.chain !== "refunded" && NEW_DEPOSITS_HELD && readPending("sudoku.pending", seat) === null && (
          <p className="alert" role="status">{DEPOSIT_HOLD_NOTE}</p>
        )}
        {room.staked && !room.expired && !room.you.deposited && room.chain !== "refunded" && (!NEW_DEPOSITS_HELD || readPending("sudoku.pending", seat) !== null) && (
          <button className="primary" type="button" aria-busy={busy !== null} disabled={busy !== null} onClick={() => void deposit()}>
            {busy ?? depositActionLabel(room.stake, readPending("sudoku.pending", seat) !== null)}
          </button>
        )}
        {room.staked && room.you.deposited && room.chain === "pending" && funds?.status === 0 && !refundOpen(funds.status, funds.joinDeadline, funds.settleDeadline, Math.floor(now / 1000)) && (
          <p className="lede">The other player can still join. A refund opens when that window ends.</p>
        )}
        {room.staked && room.you.deposited && (room.chain === "refunded" || refundOpen(funds?.status ?? null, funds?.joinDeadline ?? null, funds?.settleDeadline ?? null, Math.floor(now / 1000))) && (
          <button className="secondary" type="button" aria-busy={busy !== null} disabled={busy !== null} onClick={() => void refund()}>
            {busy ?? (readPending("sudoku.pendingRefund", seat) ? "Check refund" : room.chain === "refunded" ? "Submit refund again" : "Refund stake · return my test tokens")}
          </button>
        )}
        {room.staked && room.canClose && (localnet || room.programId === STAGING_ESCROW_PROGRAM_ID) && (room.chain === "settled" || room.chain === "refunded" || funds?.status === 2 || funds?.status === 3) && (
          <button className="secondary" type="button" aria-busy={busy !== null} disabled={busy !== null} onClick={() => void closeMatch()}>
            {busy ?? "Close match"}
          </button>
        )}
        {busy && <p className="banner" role="status">{walletStatusDetail(busy) ?? busy}</p>}
        {(chainNote || room.chain === "refunded") && (
          <p className="lede">{room.you.deposited ? (chainNote ?? "Refund confirmed on-chain.") : "This match was refunded on-chain. Deposits are closed."}</p>
        )}
        {error && <p className="alert" role="alert">{error}</p>}
        <div className="board-wrap">
          <div className="board" role="grid" aria-label="Sudoku">
            {values.map((value, index) => (
              <button
                key={index}
                type="button"
                role="gridcell"
                aria-label={cellLabel(index, value, room.givens[index] !== 0, 0, conflicts[index])}
                aria-selected={index === selected}
                className={[
                  "cell",
                  room.givens[index] ? "given" : "entry",
                  index === selected ? "selected" : "",
                  prefs().highlights && sameHouse(index, selected) ? "peer" : "",
                  prefs().highlights && values[selected] && value === values[selected] ? "match" : "",
                  conflicts[index] ? "conflict" : "",
                  index % 9 === 2 || index % 9 === 5 ? "thick-r" : "",
                  Math.floor(index / 9) === 2 || Math.floor(index / 9) === 5 ? "thick-b" : "",
                ].filter(Boolean).join(" ")}
                onClick={() => setSelected(index)}
              >
                {value || ""}
              </button>
            ))}
          </div>
        </div>
        <div className="pad">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
            <button key={digit} type="button" onClick={() => enterDigit(digit)}>{digit}</button>
          ))}
        </div>
        {room.verdict && (
          <DialogFrame id="result-title" onClose={onExit}>
              <h2 id="result-title">{room.verdict.outcome === "draw" ? "Tie" : room.youWon ? "You won" : "You lost"}</h2>
              <p>
                {room.staked
                  ? room.chain === "settled"
                    ? "The vault payment is confirmed on-chain."
                    : room.chain === "refunded"
                      ? "The refund is confirmed on-chain."
                      : "Waiting for the vault payment to confirm."
                  : "Practice match. No tokens moved."}
              </p>
              {historyNote && <p>{historyNote}</p>}
              <button className="primary" onClick={onExit}>Home</button>
          </DialogFrame>
        )}
      </main>
    );
  }

  const selectedStake = Number(stake) / 1_000_000;
  return (
    <main className="app home"><Brand />
      <button className="text" type="button" onClick={onExit}>Home</button>
      <p className="eyebrow">{mode === "practice" ? "Free race" : "Same grid"}</p>
      <h1>{mode === "practice" ? "Practice" : "Compete"}</h1>
      <section className="stack">
        <div className="segment">
          <button type="button" className={mode === "practice" ? "on" : ""} aria-pressed={mode === "practice"} onClick={() => setMode("practice")}>Practice</button>
          <button type="button" className={mode === "staked" ? "on" : ""} aria-pressed={mode === "staked"} onClick={() => setMode("staked")}>For tokens</button>
        </div>
        <p className="lede">
          {mode === "practice"
            ? "Practice races are free. No wallet required. The clock starts when a second player joins, and no tokens move."
            : "Same grid for both players. First correct finish wins. At 0:00, more correct cells wins. A tie is a draw. Each player deposits the same entry, 1, 2, or 5 test tokens. Test tokens have no cash value."}
        </p>
        {mode === "staked" && (
          <p className="choice-note">
            {staging
              ? `This is ${cluster}. After settlement or refund, the opener can close the empty match and receive its rent back.`
              : NEW_DEPOSITS_HELD
                ? `This app is on ${cluster}. The stake is fixed when a room opens. This beta does not convert SOL. New deposits are paused, so Create and Join cannot open a paid room. A refund for a room that already has a deposit still returns those test tokens. It does not return the network fee, and this Devnet program does not return the rent that opened the match.`
                : `This app is on ${cluster}. The stake is fixed when the room opens. This beta does not convert SOL. Deposit the test token for this room. A refund returns those test tokens. It does not return the network fee, and this Devnet program does not return the rent that opened the match. The clock starts only after both deposits confirm.`}
          </p>
        )}
        {mode === "staked" && !localnet && cluster === "devnet" && !staging && <p className="badge">DEVNET · TEST TOKENS · NO CASH VALUE</p>}
        {mode === "staked" && staging && <p className="badge">STAGING · DEVNET · TEST TOKENS · NO CASH VALUE</p>}
        {mode === "staked" && !room && (
          <>
            <p className="choice-note">Entry: {selectedStake} test token{selectedStake === 1 ? "" : "s"} from each player. 1, 2, and 5 are whole tokens. This choice is not a deposit yet, and both players deposit this same amount.</p>
            <div className="tools" role="group" aria-label="Entry amount">
              {stakeChoices().map((choice) => (
                <button key={choice} type="button" className={stake === choice ? "on" : ""} aria-pressed={stake === choice} onClick={() => setStake(choice)}>
                  {Number(choice) / 1_000_000}
                </button>
              ))}
            </div>
          </>
        )}
        {mode === "staked" && (localnet || staging) && !mwa && (
          <button className={wallet ? "secondary" : "primary"} type="button" disabled={busy !== null} onClick={() => void fund()}>
            {busy ?? (funded ? `Test wallet ${wallet ? shortAddress(wallet) : ""} ready` : "Create test wallet")}
          </button>
        )}
        {mode === "staked" && !localnet && (!(staging) || mwa) && !wallet && (
          <button className="primary" type="button" aria-busy={busy !== null} disabled={busy !== null} onClick={() => void connect()}>
            {busy ?? "Connect wallet"}
          </button>
        )}
        {mode === "staked" && !localnet && wallet && (
          <div className="identity">
            <span>Wallet {shortAddress(wallet)} connected</span>
            <button className="text" type="button" onClick={() => void disconnect()}>Disconnect</button>
          </div>
        )}
        {busy && <p className="banner" role="status">{walletStatusDetail(busy) ?? busy}</p>}
        {walletChoices.length > 1 && walletChoices.map((item) => (
          <button key={item.name} className="secondary" type="button" onClick={() => void connect(item.name)}>
            {item.name}{item.canSignTransaction ? "" : " · cannot sign transactions"}
          </button>
        ))}
        {walletWarning && <p className="alert" role="alert">{walletWarning}</p>}
        {mode === "staked" && wallet && balances && (
          <p className="choice-note">{walletBalanceCopy(balances.sol, balances.token)}</p>
        )}
        {mode === "staked" && import.meta.env.DEV && new URLSearchParams(window.location.search).has("fiatSandbox") && (
          <AddFunds stakeAtomic={stake} wallet={wallet} />
        )}
        {mode === "staked" && localnet && (
          <button type="button" className={shortClock ? "on" : ""} aria-pressed={shortClock} onClick={() => setShortClock((value) => !value)}>
            Short clock
          </button>
        )}
        {mode === "staked" && wallet && (
          <button className="text" type="button" disabled={codeInput.length < 4 || busy !== null} onClick={() => void resume()}>
            Resume with this wallet
          </button>
        )}
        <div className="tools">
          {LEVELS.map((item) => (
            <button key={item} type="button" className={item === level ? "on" : ""} aria-pressed={item === level} onClick={() => setLevel(item)}>
              {item}
            </button>
          ))}
        </div>
        {mode === "staked" && NEW_DEPOSITS_HELD && <p className="alert" role="status">{DEPOSIT_HOLD_NOTE}</p>}
        {mode === "staked" && !NEW_DEPOSITS_HELD && (
          <>
            <p className="choice-note">Slide the knob onto the mark. This check is for opening a paid room.</p>
            {gate ? (
              <Slider gate={gate} onChange={(value) => setGate({ ...gate, value })} onRelease={(value) => void slideEnd(value)} />
            ) : (
              <p className="choice-note" role="status">{gateError ?? "Opening the check…"}</p>
            )}
            {gate?.error && <p className="alert" role="alert">{gate.error}</p>}
            {gateError && <button className="text" type="button" onClick={() => { setGateError(null); setGateAttempt((attempt) => attempt + 1); }}>Try the check again</button>}
          </>
        )}
        {mode === "practice" && (
          <button className="primary" type="button" aria-busy={busy !== null} disabled={busy !== null} onClick={() => void quick()}>Quick match</button>
        )}
        {mode === "practice" && openRooms.length > 0 && (
          <div className="stack">
            {openRooms.map((item) => (
              <button key={item.code} className="secondary" type="button" aria-busy={busy !== null} disabled={busy !== null} onClick={() => void join(item.code)}>
                {item.level} · {item.code}
              </button>
            ))}
          </div>
        )}
        <button className={mode === "staked" && wallet ? "primary" : "secondary"} type="button" aria-busy={busy !== null} disabled={busy !== null || (mode === "staked" && (NEW_DEPOSITS_HELD || !gate?.ok || !wallet))} onClick={() => void host()}>Create room</button>
        <input className="code" aria-label="Room code" value={codeInput} placeholder="Room code" onChange={(event) => setCodeInput(event.target.value.toUpperCase())} />
        <button className="secondary" type="button" aria-busy={busy !== null} disabled={busy !== null || codeInput.length < 4 || (mode === "staked" && (NEW_DEPOSITS_HELD || !gate?.ok || !wallet))} onClick={() => void join()}>Join room</button>
        {error && <p className="alert" role="alert">{error}</p>}
        {mode === "staked" && wallet && (
          <input className="code" aria-label="Display name" value={displayName} placeholder="Display name" maxLength={16} onChange={(event) => setDisplayName(event.target.value)} />
        )}
        {mode === "staked" && wallet && (
          <button className="text" type="button" disabled={busy !== null || displayName.trim().length < 2} onClick={() => void saveName()}>
            Save name
          </button>
        )}
        {wallet && (
          <button className="text" type="button" disabled={busy !== null} onClick={() => void loadHistory()}>My matches</button>
        )}
        {profile && (
          <p className="choice-note">
            Classic finished {profile.classicCompleted}. Practice {profile.practice.wins}-{profile.practice.losses}-{profile.practice.draws}. Competitive {profile.competitive.wins}-{profile.competitive.losses}-{profile.competitive.draws}.
          </p>
        )}
        {wallet && classicLink !== wallet && (
          <button className="text" type="button" onClick={() => { localStorage.setItem("sudoku.classicWallet", wallet); setClassicLink(wallet); }}>
            Count future Classic finishes on this wallet
          </button>
        )}
        {wallet && classicLink === wallet && (
          <p className="choice-note">Future Classic finishes on this device can be signed to this wallet. Older guest games stay on the device.</p>
        )}
        {historyRows.length > 0 && (
          <div className="stack">
            <h2>Your record</h2>
            {historyRows.map((item) => (
              <p key={`${item.mode}-${item.code}`} className="choice-note">{item.mode} · {item.level} · {item.code} · {item.outcome}{item.chain ? ` · chain ${item.chain}` : ""}</p>
            ))}
          </div>
        )}
        <button className="text" onClick={onExit}>Back</button>
      </section>
    </main>
  );
}

function poolLabel(stake: string | null): string {
  const each = stake?.match(/\d+/)?.[0] ?? "1";
  return `${Number(each) * 2} test tokens`;
}

function Slider({ gate, onChange, onRelease }: { gate: Gate; onChange: (value: number) => void; onRelease: (value: number) => void }) {
  return (
    <div
      className="slider"
      onPointerDown={(event) => {
        const track = event.currentTarget as HTMLDivElement;
        const move = (point: PointerEvent) => {
          const value = valueFromPointer(point.clientX, track.getBoundingClientRect().left + track.clientLeft, track.clientWidth);
          onChange(value);
          return value;
        };
        let latest = move(event.nativeEvent);
        const drag = (point: PointerEvent) => {
          latest = move(point);
        };
        const up = (point: PointerEvent) => {
          latest = move(point);
          window.removeEventListener("pointermove", drag);
          window.removeEventListener("pointerup", up);
          onRelease(latest);
        };
        window.addEventListener("pointermove", drag);
        window.addEventListener("pointerup", up);
      }}
    >
      <span className="notch" style={{ "--p": gate.target } as CSSProperties} />
      <span className="knob" style={{ "--p": gate.value } as CSSProperties} />
    </div>
  );
}

async function post(path: string, body?: unknown) {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Request failed");
    return data;
  } catch (error) {
    throw new Error(playerFacingError(error, "Request failed"));
  }
}

async function get(path: string) {
  try {
    const response = await fetch(path);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Request failed");
    return data;
  } catch (error) {
    throw new Error(playerFacingError(error, "Request failed"));
  }
}

function signLocally(tx: Transaction): string {
  tx.partialSign(playerKey());
  return toBase64(tx.serialize({ requireAllSignatures: false, verifySignatures: false }));
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function playerKey(): Keypair {
  const saved = localStorage.getItem("sudoku.player");
  if (saved) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(saved) as number[]));
  const created = Keypair.generate();
  localStorage.setItem("sudoku.player", JSON.stringify(Array.from(created.secretKey)));
  return created;
}

function readPending(key: string, seat: { code: string; playerId: string } | null): { code: string; playerId: string; tx: string } | null {
  if (!seat) return null;
  try {
    const pending = JSON.parse(localStorage.getItem(key) ?? "") as { code: string; playerId: string; tx: string };
    if (pending.code === seat.code && pending.playerId === seat.playerId && pending.tx) return pending;
  } catch {
    return null;
  }
  return null;
}

function readBook(): RecordBook {
  try {
    const parsed = JSON.parse(localStorage.getItem("sudoku.stats") ?? "") as RecordBook;
    if (parsed?.practice && parsed?.staked) return parsed;
  } catch {
    // A missing record starts at zero.
  }
  return emptyBook();
}

function roomState(room: PublicRoom): string {
  if (room.chain === "refunded") return "Refunded";
  if (room.verdict && room.chain === "settled") return "Settled";
  if (room.verdict && room.staked) return "Awaiting settlement";
  if (room.verdict) return "Finished";
  if (room.startedAt) return "Playing";
  if (room.staked && room.you.deposited) return "Waiting for your opponent";
  if (room.staked) return "Deposit needed";
  if (!room.opponent?.joined) return "Waiting for your opponent";
  return "Ready";
}

function sameHouse(index: number, selected: number): boolean {
  return (
    Math.floor(index / 9) === Math.floor(selected / 9) ||
    index % 9 === selected % 9 ||
    (Math.floor(Math.floor(index / 9) / 3) === Math.floor(Math.floor(selected / 9) / 3) &&
      Math.floor((index % 9) / 3) === Math.floor((selected % 9) / 3))
  );
}

function formatTime(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
