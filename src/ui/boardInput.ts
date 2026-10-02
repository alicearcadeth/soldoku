export type BoardCommand =
  | { type: "digit"; digit: number }
  | { type: "erase" }
  | { type: "notes" }
  | { type: "undo" }
  | { type: "move"; key: string };

type KeyLike = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  target?: EventTarget | null;
};

function targetTag(target: EventTarget | null | undefined): string | undefined {
  if (target && "tagName" in target && typeof target.tagName === "string") return target.tagName;
  return undefined;
}

export function boardCommand(event: KeyLike): BoardCommand | null {
  const tag = targetTag(event.target);
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return null;
  if (event.altKey || event.metaKey && event.key !== "z" && event.key !== "Z") return null;
  if (event.ctrlKey && event.key !== "z" && event.key !== "Z") return null;
  if (event.key >= "1" && event.key <= "9") return { type: "digit", digit: Number(event.key) };
  if (event.key === "Backspace" || event.key === "Delete") return { type: "erase" };
  if (event.key === "n" || event.key === "N") return { type: "notes" };
  if ((event.key === "z" || event.key === "Z") && (event.metaKey || event.ctrlKey)) return { type: "undo" };
  if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown") {
    return { type: "move", key: event.key };
  }
  return null;
}

export function moveSelection(index: number, key: string): number {
  const row = Math.floor(index / 9);
  const col = index % 9;
  if (key === "ArrowLeft") return row * 9 + ((col + 8) % 9);
  if (key === "ArrowRight") return row * 9 + ((col + 1) % 9);
  if (key === "ArrowUp") return ((row + 8) % 9) * 9 + col;
  return ((row + 1) % 9) * 9 + col;
}

export function cellLabel(index: number, value: number, given: boolean, notes = 0, conflict = false): string {
  const row = Math.floor(index / 9) + 1;
  const col = (index % 9) + 1;
  const place = `Row ${row} column ${col}`;
  const mark = conflict ? ", conflict" : "";
  if (value) return `${place}, ${given ? "given" : "entered"} ${value}${mark}`;
  if (!notes) return `${place}, empty`;
  const digits: string[] = [];
  for (let digit = 1; digit <= 9; digit += 1) if (notes & (1 << digit)) digits.push(String(digit));
  return `${place}, notes ${digits.join(" ")}`;
}

const OFFLINE = "You are offline. That action was not saved.";
const UNSAVED = "That action was not saved. Try again.";
const ROOM_REFRESH = "The room could not be refreshed. Try again.";
const WALLET_CONNECTION = "The wallet did not respond. Try again.";
const WALLET_AUTH = "The wallet did not finish authorization. Try again.";
/** The adapter does not say whether a closed session was a security block. Do not tell the player to retry. */
export const WALLET_SESSION_INCOMPLETE = "The wallet did not complete this request. Check your wallet for a warning before you continue. If it reported a security risk, stop and contact support.";

export function playerFacingError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : fallback;
  if (/failed to fetch|networkerror|load failed/i.test(message)) return OFFLINE;
  if (/D1_ERROR|network connection lost/i.test(message)) return UNSAVED;
  if (/authorization request failed|failed to authenticate/i.test(message)) return WALLET_AUTH;
  if (/failed to connect to the wallet websocket|secure context/i.test(message)) return WALLET_CONNECTION;
  if (/session timeout|session dropped|association/i.test(message)) return WALLET_SESSION_INCOMPLETE;
  return message || fallback;
}

/** Keeps a failed action on screen. A failed room refresh is replaced by the next successful load. */
export function roomStatusError(current: string | null, failure: string): string {
  if (current && current !== ROOM_REFRESH && current !== OFFLINE) return current;
  if (failure === UNSAVED || /D1_ERROR|network connection lost/i.test(failure)) return ROOM_REFRESH;
  return failure || ROOM_REFRESH;
}

export function roomStatusRecovered(current: string | null): string | null {
  if (current === ROOM_REFRESH || current === OFFLINE) return null;
  return current;
}
