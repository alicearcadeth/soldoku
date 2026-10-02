import { describe, expect, it } from "vitest";
import { CLUSTER_GENESIS, clusterOf, createFailoverFetch, resetAcceptedEndpoints, verifyEndpoints } from "./rpc";

describe("rpc failover", () => {
  it("names the published clusters and treats anything else as localnet", () => {
    expect(clusterOf(CLUSTER_GENESIS.devnet)).toBe("devnet");
    expect(clusterOf(CLUSTER_GENESIS["mainnet-beta"])).toBe("mainnet-beta");
    expect(clusterOf("local-validator-hash")).toBe("localnet");
  });

  it("reads from the backup after a 429 and does not replay a lost send", async () => {
    const bodies: string[] = [];
    const fetcher = createFailoverFetch("http://primary", "http://backup", () => 0);
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      bodies.push(`${url}:${String(init?.body)}`);
      if (String(url).includes("primary")) {
        return new Response("slow down", { status: 429, headers: { "retry-after": "2" } });
      }
      return new Response(JSON.stringify({ jsonrpc: "2.0", result: "ok" }), { status: 200 });
    }) as typeof fetch;
    try {
      const read = await fetcher("http://primary", { body: "{\"method\":\"getLatestBlockhash\"}" });
      expect(read.status).toBe(200);
      resetAcceptedEndpoints();
      const send = await fetcher("http://primary", { body: "{\"method\":\"sendTransaction\"}" });
      expect(send.status).toBe(429);
      expect(bodies).toEqual([
        "http://primary:{\"method\":\"getLatestBlockhash\"}",
        "http://backup:{\"method\":\"getLatestBlockhash\"}",
        "http://primary:{\"method\":\"sendTransaction\"}",
      ]);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("does not call the backup for a normal transaction error", async () => {
    let calls = 0;
    const fetcher = createFailoverFetch("http://primary", "http://backup", () => 100_000);
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response("bad tx", { status: 200 });
    }) as typeof fetch;
    try {
      await fetcher("http://primary", { body: "same" });
      expect(calls).toBe(1);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("fails over when the primary is unreachable", async () => {
    const fetcher = createFailoverFetch("http://down", "http://backup", () => 100_000);
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      if (String(url).includes("down")) throw new Error("connect refused");
      return new Response("ok", { status: 200 });
    }) as typeof fetch;
    try {
      const response = await fetcher("http://down", { body: "same" });
      expect(response.status).toBe(200);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("does not send a transaction to a backup on another cluster", async () => {
    resetAcceptedEndpoints();
    const calls: string[] = [];
    const fetcher = createFailoverFetch("http://primary", "http://backup", () => 0, "devnet");
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      const body = String(init?.body ?? "");
      calls.push(`${url}:${body.includes("getGenesisHash") ? "genesis" : "tx"}`);
      if (body.includes("getGenesisHash")) {
        const result = String(url).includes("backup") ? CLUSTER_GENESIS["mainnet-beta"] : CLUSTER_GENESIS.devnet;
        return new Response(JSON.stringify({ result }), { status: 200 });
      }
      if (String(url).includes("primary")) return new Response("slow", { status: 429, headers: { "retry-after": "2" } });
      return new Response(JSON.stringify({ result: "broadcast" }), { status: 200 });
    }) as typeof fetch;
    try {
      const response = await fetcher("http://primary", { body: JSON.stringify({ method: "sendTransaction" }) });
      expect(response.status).toBe(429);
      expect(calls.some((item) => item.startsWith("http://backup:") && item.endsWith(":tx"))).toBe(false);
      const read = await fetcher("http://primary", { body: JSON.stringify({ method: "getBalance" }) });
      expect(read.status).toBe(503);
      expect(calls.some((item) => item.startsWith("http://backup:") && item.endsWith(":tx"))).toBe(false);
    } finally {
      globalThis.fetch = original;
      resetAcceptedEndpoints();
    }
  });

  it("rejects an endpoint on the wrong cluster and keeps one on the expected cluster", async () => {
    const fetcher = (async (url: string) => {
      const result = String(url).includes("wrong") ? CLUSTER_GENESIS["mainnet-beta"] : CLUSTER_GENESIS.devnet;
      return new Response(JSON.stringify({ result }), { status: 200 });
    }) as typeof fetch;
    const accepted = await verifyEndpoints("http://wrong", "http://devnet", "devnet", fetcher);
    expect(accepted).toEqual(["http://devnet"]);
    await expect(verifyEndpoints("http://wrong", undefined, "devnet", fetcher)).rejects.toThrow(/mainnet-beta/);
  });
});
