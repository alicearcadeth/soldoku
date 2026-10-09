/** Ends a wallet request that never settles after the page is on screen again. The Seeker WebView stays focused under the wallet sheet and only receives the shell's synthetic blur. */
export function walletCall<T>(pending: Promise<T>, graceMs = 8000, capMs = 25000, sheetCapMs = 600_000): Promise<T> {
  if (typeof document === "undefined" || typeof window === "undefined") return pending;
  return new Promise((resolve, reject) => {
    let settled = false;
    let sawHidden = false;
    let sheetUp = false;
    let returnedAt = 0;
    let mark = Date.now();
    const started = mark;
    const onBlur = () => {
      sheetUp = true;
      returnedAt = 0;
    };
    /** Focus alone is unreliable on Seeker after Seed Vault; clear the sheet flag when the page is shown again. */
    const onReturned = () => {
      sheetUp = false;
      check();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") sheetUp = false;
      check();
    };
    const stop = () => {
      settled = true;
      window.clearInterval(watch);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onReturned);
      window.removeEventListener("pageshow", onReturned);
    };
    const fail = () => {
      if (settled) return;
      stop();
      reject(new Error("session timeout"));
    };
    const check = () => {
      if (settled) return;
      const now = Date.now();
      const covered = sheetUp || document.visibilityState === "hidden" || document.hasFocus() === false;
      if (now - mark > 1500 || covered) sawHidden = true;
      mark = now;
      if (covered) {
        returnedAt = 0;
        if (now - started >= sheetCapMs) fail();
        return;
      }
      if (!sawHidden) {
        if (now - started >= capMs) fail();
        return;
      }
      if (!returnedAt) returnedAt = now;
      if (now - returnedAt >= graceMs) fail();
    };
    const watch = window.setInterval(check, 250);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onReturned);
    window.addEventListener("pageshow", onReturned);
    pending.then(
      (value) => {
        if (settled) return;
        stop();
        resolve(value);
      },
      (error) => {
        if (settled) return;
        stop();
        reject(error);
      },
    );
  });
}
