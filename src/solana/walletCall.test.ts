import { afterEach, describe, expect, it, vi } from "vitest";
import { walletCall } from "./walletCall";

describe("wallet call", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("rejects after the page is visible again and the wallet never replies", async () => {
    vi.useFakeTimers();
    let visible = "visible";
    const listeners = new Set<() => void>();
    vi.stubGlobal("document", {
      get visibilityState() {
        return visible;
      },
      hasFocus: () => true,
      addEventListener: (_name: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_name: string, listener: () => void) => listeners.delete(listener),
    });
    vi.stubGlobal("window", {
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    const pending = walletCall(new Promise(() => undefined), 8000, 90000);
    const settled = pending.then(
      () => "resolved",
      (error: Error) => error.message,
    );
    visible = "hidden";
    listeners.forEach((listener) => listener());
    visible = "visible";
    listeners.forEach((listener) => listener());
    await vi.advanceTimersByTimeAsync(8000);
    await expect(settled).resolves.toBe("session timeout");
  });

  it("clears a stuck Seeker sheet flag on pageshow so grace timeout can run", async () => {
    vi.useFakeTimers();
    const windowListeners = new Map<string, Set<() => void>>();
    vi.stubGlobal("document", {
      visibilityState: "visible",
      hasFocus: () => true,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    vi.stubGlobal("window", {
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      addEventListener: (name: string, listener: () => void) => {
        const set = windowListeners.get(name) ?? new Set();
        set.add(listener);
        windowListeners.set(name, set);
      },
      removeEventListener: (name: string, listener: () => void) => {
        windowListeners.get(name)?.delete(listener);
      },
    });
    const pending = walletCall(new Promise(() => undefined), 8000, 90_000, 600_000);
    const settled = pending.then(
      () => "resolved",
      (error: Error) => error.message,
    );
    windowListeners.get("blur")?.forEach((listener) => listener());
    await vi.advanceTimersByTimeAsync(30_000);
    let status = "pending";
    void settled.then((value) => { status = value; });
    await vi.advanceTimersByTimeAsync(0);
    expect(status).toBe("pending");
    windowListeners.get("pageshow")?.forEach((listener) => listener());
    await vi.advanceTimersByTimeAsync(8000);
    await expect(settled).resolves.toBe("session timeout");
  });

  it("starts grace on pageshow even when hasFocus stays false after Seed Vault", async () => {
    vi.useFakeTimers();
    const windowListeners = new Map<string, Set<() => void>>();
    vi.stubGlobal("document", {
      visibilityState: "visible",
      hasFocus: () => false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    vi.stubGlobal("window", {
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      addEventListener: (name: string, listener: () => void) => {
        const set = windowListeners.get(name) ?? new Set();
        set.add(listener);
        windowListeners.set(name, set);
      },
      removeEventListener: (name: string, listener: () => void) => {
        windowListeners.get(name)?.delete(listener);
      },
    });
    const pending = walletCall(new Promise(() => undefined), 8000, 90_000, 600_000);
    const settled = pending.then(
      () => "resolved",
      (error: Error) => error.message,
    );
    windowListeners.get("blur")?.forEach((listener) => listener());
    await vi.advanceTimersByTimeAsync(5_000);
    windowListeners.get("pageshow")?.forEach((listener) => listener());
    await vi.advanceTimersByTimeAsync(8000);
    await expect(settled).resolves.toBe("session timeout");
  });

  it("rejects after the wallet sheet releases focus and never replies", async () => {
    vi.useFakeTimers();
    let focused = true;
    vi.stubGlobal("document", {
      visibilityState: "visible",
      hasFocus: () => focused,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    vi.stubGlobal("window", {
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    const pending = walletCall(new Promise(() => undefined), 8000, 25000);
    const settled = pending.then(
      () => "resolved",
      (error: Error) => error.message,
    );
    focused = false;
    await vi.advanceTimersByTimeAsync(250);
    focused = true;
    await vi.advanceTimersByTimeAsync(250);
    await vi.advanceTimersByTimeAsync(8000);
    await expect(settled).resolves.toBe("session timeout");
  });

  it("keeps a signature that arrives before the grace period", async () => {
    vi.useFakeTimers();
    let visible = "hidden";
    const listeners = new Set<() => void>();
    vi.stubGlobal("document", {
      get visibilityState() {
        return visible;
      },
      hasFocus: () => true,
      addEventListener: (_name: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_name: string, listener: () => void) => listeners.delete(listener),
    });
    vi.stubGlobal("window", {
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    let finish: (value: string) => void = () => undefined;
    const pending = walletCall(new Promise<string>((resolve) => {
      finish = resolve;
    }), 8000, 90000);
    visible = "visible";
    listeners.forEach((listener) => listener());
    await vi.advanceTimersByTimeAsync(1000);
    finish("signed");
    await expect(pending).resolves.toBe("signed");
  });

  it("does not time out a wallet that stays on this page", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("document", {
      visibilityState: "visible",
      hasFocus: () => true,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    vi.stubGlobal("window", {
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    const pending = walletCall(new Promise(() => undefined), 8000, 90000);
    const settled = pending.then(
      () => "resolved",
      () => "rejected",
    );
    await vi.advanceTimersByTimeAsync(12000);
    let status = "pending";
    void settled.then((value) => {
      status = value;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(status).toBe("pending");
  });

  it("keeps waiting while the wallet sheet covers the page past the foreground cap", async () => {
    vi.useFakeTimers();
    let visible = "hidden";
    vi.stubGlobal("document", {
      get visibilityState() {
        return visible;
      },
      hasFocus: () => true,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    vi.stubGlobal("window", {
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    let finish: (value: string) => void = () => undefined;
    const pending = walletCall(new Promise<string>((resolve) => {
      finish = resolve;
    }), 8000, 25000);
    const settled = pending.then(
      () => "resolved",
      () => "rejected",
    );
    await vi.advanceTimersByTimeAsync(60000);
    let status = "pending";
    void settled.then((value) => {
      status = value;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(status).toBe("pending");
    visible = "visible";
    await vi.advanceTimersByTimeAsync(250);
    finish("approved");
    await expect(pending).resolves.toBe("approved");
  });

  it("rejects after grace when a long wallet sheet returns no reply", async () => {
    vi.useFakeTimers();
    let visible = "hidden";
    const listeners = new Set<() => void>();
    vi.stubGlobal("document", {
      get visibilityState() {
        return visible;
      },
      hasFocus: () => true,
      addEventListener: (_name: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_name: string, listener: () => void) => listeners.delete(listener),
    });
    vi.stubGlobal("window", {
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    const pending = walletCall(new Promise(() => undefined), 8000, 25000);
    const settled = pending.then(
      () => "resolved",
      (error: Error) => error.message,
    );
    await vi.advanceTimersByTimeAsync(60000);
    visible = "visible";
    listeners.forEach((listener) => listener());
    await vi.advanceTimersByTimeAsync(8000);
    await expect(settled).resolves.toBe("session timeout");
  });

  it("keeps a late approval after the shell blur that the Seeker WebView actually sends", async () => {
    vi.useFakeTimers();
    const listeners = new Map<string, Set<() => void>>();
    const add = (name: string, listener: () => void) => {
      const set = listeners.get(name) ?? new Set();
      set.add(listener);
      listeners.set(name, set);
    };
    const remove = (name: string, listener: () => void) => listeners.get(name)?.delete(listener);
    vi.stubGlobal("document", {
      visibilityState: "visible",
      hasFocus: () => true,
      addEventListener: add,
      removeEventListener: remove,
    });
    vi.stubGlobal("window", {
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      addEventListener: add,
      removeEventListener: remove,
    });
    let finish: (value: string) => void = () => undefined;
    const pending = walletCall(new Promise<string>((resolve) => {
      finish = resolve;
    }), 8000, 25000);
    listeners.get("blur")?.forEach((listener) => listener());
    await vi.advanceTimersByTimeAsync(120000);
    finish("approved");
    await expect(pending).resolves.toBe("approved");
  });

  it("starts the grace period when the page regains focus after the wallet sheet", async () => {
    vi.useFakeTimers();
    const listeners = new Map<string, Set<() => void>>();
    const add = (name: string, listener: () => void) => {
      const set = listeners.get(name) ?? new Set();
      set.add(listener);
      listeners.set(name, set);
    };
    vi.stubGlobal("document", {
      visibilityState: "visible",
      hasFocus: () => true,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    vi.stubGlobal("window", {
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      addEventListener: add,
      removeEventListener: () => undefined,
    });
    const pending = walletCall(new Promise(() => undefined), 8000, 25000);
    const settled = pending.then(
      () => "resolved",
      (error: Error) => error.message,
    );
    listeners.get("blur")?.forEach((listener) => listener());
    await vi.advanceTimersByTimeAsync(60000);
    listeners.get("focus")?.forEach((listener) => listener());
    await vi.advanceTimersByTimeAsync(8000);
    await expect(settled).resolves.toBe("session timeout");
  });

  it("rejects after the page was frozen and the wallet never replies", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    vi.stubGlobal("document", {
      visibilityState: "visible",
      hasFocus: () => true,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    vi.stubGlobal("window", {
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    const pending = walletCall(new Promise(() => undefined), 8000, 90000);
    const settled = pending.then(
      () => "resolved",
      (error: Error) => error.message,
    );
    vi.setSystemTime(new Date("2026-01-01T00:00:05Z"));
    await vi.advanceTimersByTimeAsync(250);
    await vi.advanceTimersByTimeAsync(8000);
    await expect(settled).resolves.toBe("session timeout");
  });

  it("passes an explicit wallet rejection through after a long sheet", async () => {
    vi.useFakeTimers();
    const listeners = new Map<string, Set<() => void>>();
    const add = (name: string, listener: () => void) => {
      const set = listeners.get(name) ?? new Set();
      set.add(listener);
      listeners.set(name, set);
    };
    vi.stubGlobal("document", {
      visibilityState: "visible",
      hasFocus: () => true,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    vi.stubGlobal("window", {
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      addEventListener: add,
      removeEventListener: () => undefined,
    });
    let rejectPending: (error: Error) => void = () => undefined;
    const pending = walletCall(new Promise((_resolve, reject) => {
      rejectPending = reject;
    }), 8000, 25000, 600_000);
    listeners.get("blur")?.forEach((listener) => listener());
    await vi.advanceTimersByTimeAsync(60_000);
    rejectPending(new Error("User declined"));
    await expect(pending).rejects.toThrow("User declined");
  });

  it("ignores a late result after the request recovered and lets the next request succeed", async () => {
    vi.useFakeTimers();
    const listeners = new Map<string, Set<() => void>>();
    const add = (name: string, listener: () => void) => {
      const set = listeners.get(name) ?? new Set();
      set.add(listener);
      listeners.set(name, set);
    };
    vi.stubGlobal("document", {
      visibilityState: "visible",
      hasFocus: () => true,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    vi.stubGlobal("window", {
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      addEventListener: add,
      removeEventListener: () => undefined,
    });
    let finishFirst: (value: string) => void = () => undefined;
    const first = walletCall(new Promise<string>((resolve) => {
      finishFirst = resolve;
    }), 8000, 25000, 90_000);
    const firstSettled = first.then(
      () => "resolved",
      (error: Error) => error.message,
    );
    listeners.get("blur")?.forEach((listener) => listener());
    await vi.advanceTimersByTimeAsync(90_000);
    await expect(firstSettled).resolves.toBe("session timeout");
    finishFirst("stale");
    await expect(first).rejects.toThrow("session timeout");
    let finishSecond: (value: string) => void = () => undefined;
    const second = walletCall(new Promise<string>((resolve) => {
      finishSecond = resolve;
    }), 8000, 25000, 90_000);
    finishSecond("fresh");
    await expect(second).resolves.toBe("fresh");
  });

  it("ends a wallet sheet that never returns and never replies", async () => {
    vi.useFakeTimers();
    const listeners = new Map<string, Set<() => void>>();
    const add = (name: string, listener: () => void) => {
      const set = listeners.get(name) ?? new Set();
      set.add(listener);
      listeners.set(name, set);
    };
    vi.stubGlobal("document", {
      visibilityState: "visible",
      hasFocus: () => true,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    vi.stubGlobal("window", {
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      addEventListener: add,
      removeEventListener: () => undefined,
    });
    const pending = walletCall(new Promise(() => undefined), 8000, 25000, 90_000);
    const settled = pending.then(
      () => "resolved",
      (error: Error) => error.message,
    );
    listeners.get("blur")?.forEach((listener) => listener());
    await vi.advanceTimersByTimeAsync(89_000);
    let status = "pending";
    void settled.then((value) => {
      status = value;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(status).toBe("pending");
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(settled).resolves.toBe("session timeout");
  });
});

// A visible WebView can miss focus/pageshow when returning from a native wallet.
describe("wallet call interaction recovery", () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  it("releases a stale sheet wait after actual page interaction without focus events", async () => {
    vi.useFakeTimers();
    const listeners = new Map<string, Set<() => void>>();
    const add = (name: string, listener: () => void) => {
      const set = listeners.get(name) ?? new Set(); set.add(listener); listeners.set(name, set);
    };
    vi.stubGlobal("document", { visibilityState: "visible", hasFocus: () => false,
      addEventListener: () => undefined, removeEventListener: () => undefined });
    vi.stubGlobal("window", { setTimeout, clearTimeout, setInterval, clearInterval,
      addEventListener: add, removeEventListener: (name: string, listener: () => void) => listeners.get(name)?.delete(listener) });
    const result = walletCall(new Promise(() => undefined), 8000, 25000, 600000).catch((error: Error) => error.message);
    listeners.get("blur")?.forEach(listener => listener());
    await vi.advanceTimersByTimeAsync(60000);
    listeners.get("pointerdown")?.forEach(listener => listener());
    await vi.advanceTimersByTimeAsync(8000);
    const snapshot = await Promise.race([result, Promise.resolve("still waiting")]);
    expect(snapshot).toBe("session timeout");
    expect(listeners.get("pointerdown")?.size).toBe(0);
  });
});
