import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { feel } from "./feel";

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
    const timer = window.setTimeout(() => setVisible(false), 2800);
    return () => window.clearTimeout(timer);
  }, [visible]);
  if (!visible) return null;
  return createPortal(<div className="win-celebration" aria-hidden="true" data-testid="win-celebration">
    <div className="win-burst">
      <div className="win-ring" />
      {Array.from({ length: 28 }, (_, index) => {
        const angle = index * Math.PI * 2 / 28;
        const distance = 110 + index % 4 * 24;
        return <i key={index} style={{ "--x": `${Math.cos(angle) * distance}px`, "--y": `${Math.sin(angle) * distance}px`,
          "--turn": `${index * 47}deg`, "--color": ["#14f195", "#9945ff", "#00c2ff", "#ffd166"][index % 4] } as CSSProperties} />;
      })}
      <div className="win-badge"><span>✦</span><strong>{message}</strong><small>Nicely played.</small></div>
    </div>
  </div>, document.body);
}
