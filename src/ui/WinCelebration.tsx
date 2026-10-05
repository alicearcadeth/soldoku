import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { feel } from "./feel";
import { FireworksCanvas } from "./FireworksCanvas";
import { FIREWORK_CELEBRATION_MS } from "./fireworks";

/** A short, non-blocking payoff. Remember results so polling/reloads cannot replay it. */
export function WinCelebration({ eventKey, message = "You won!", feedback = true }: {
  eventKey: string | null; message?: string; feedback?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!eventKey) return;
    const key = `sudoku.celebrated.${eventKey}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch { /* Storage restrictions should not prevent a celebration. */ }
    setVisible(true);
    if (feedback) feel("done");
  }, [eventKey, feedback]);
  useEffect(() => {
    if (!visible) return;
    const timer = window.setTimeout(() => setVisible(false), FIREWORK_CELEBRATION_MS);
    return () => window.clearTimeout(timer);
  }, [visible]);
  if (!visible) return null;
  return createPortal(<div className="win-celebration" aria-hidden="true" data-testid="win-celebration">
    <div className="win-sky" />
    <FireworksCanvas />
    <div className="win-finale-halo" />
    <div className="win-badge"><span>✦</span><small>VICTORY</small><strong>{message}</strong><em>SHEEEESH. You did that.</em></div>
  </div>, document.body);
}
