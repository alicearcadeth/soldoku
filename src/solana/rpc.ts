/** Genesis hashes published by Solana for the named clusters. */
export const CLUSTER_GENESIS = {
  "mainnet-beta": "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
  devnet: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
  testnet: "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY",
} as const;

export type NamedCluster = keyof typeof CLUSTER_GENESIS | "localnet";

const openUntil = new Map<string, number>();
let acceptedEndpoints: string[] | null = null;

export function clusterOf(genesis: string): NamedCluster {
  for (const [name, hash] of Object.entries(CLUSTER_GENESIS) as [Exclude<NamedCluster, "localnet">, string][]) {
    if (hash === genesis) return name;
  }
  return "localnet";
}

export function endpoints(): { primary: string; backup?: string; expected: NamedCluster } {
  const primary = process.env.SOLANA_RPC ?? "http://127.0.0.1:8899";
  const backup = process.env.SOLANA_RPC_BACKUP || undefined;
  const requested = process.env.SOLANA_CLUSTER;
  if (requested === "mainnet-beta") throw new Error("Mainnet is not enabled");
  const expected: NamedCluster = requested === "devnet" || requested === "testnet" || requested === "localnet"
    ? requested
    : primary.includes("127.0.0.1")
      ? "localnet"
      : "devnet";
  return { primary, backup, expected };
}

export function resetAcceptedEndpoints(): void {
  acceptedEndpoints = null;
  openUntil.clear();
}

const FINANCIAL_SENDS = new Set(["sendTransaction", "sendRawTransaction"]);

function rpcMethod(body: BodyInit | null | undefined): string {
  if (typeof body !== "string") return "";
  try {
    const parsed = JSON.parse(body) as { method?: unknown };
    return typeof parsed.method === "string" ? parsed.method : "";
  } catch {
    return "";
  }
}

export function createFailoverFetch(_primary: string, backup?: string, now = Date.now, expected?: NamedCluster): typeof fetch {
  return async (input, init) => {
    const requested = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const urls = (acceptedEndpoints ?? [requested, backup].filter((item): item is string => Boolean(item)));
    const body = init?.body;
    // A lost send is unknown. Replaying it on another endpoint can land the same transfer twice.
    const candidates = FINANCIAL_SENDS.has(rpcMethod(body)) ? urls.slice(0, 1) : urls;
    let last = new Response("No RPC endpoint is available", { status: 503 });
    for (const url of candidates) {
      if ((openUntil.get(url) ?? 0) > now()) continue;
      if (expected && url !== requested) {
        const same = await sameCluster(url, expected);
        if (!same) {
          last = new Response("The backup RPC is a different cluster", { status: 503 });
          continue;
        }
      }
      const response = await postRpc(url, body, init, now);
      if (response.ok || (response.status < 500 && response.status !== 429)) return response;
      const retryAfter = Number(response.headers.get("retry-after") ?? "15");
      openUntil.set(url, now() + Math.min(60, Math.max(1, retryAfter)) * 1000);
      last = response;
    }
    return last;
  };
}

async function sameCluster(url: string, expected: NamedCluster): Promise<boolean> {
  try {
    await assertCluster(url, expected);
    return true;
  } catch {
    return false;
  }
}

async function postRpc(url: string, body: BodyInit | null | undefined, init: RequestInit | undefined, now: () => number): Promise<Response> {
  if ((openUntil.get(url) ?? 0) > now()) return new Response("circuit open", { status: 429, headers: { "retry-after": "15" } });
  try {
    return await fetch(url, { ...init, method: "POST", body, signal: AbortSignal.timeout(8_000) });
  } catch {
    openUntil.set(url, now() + 15_000);
    return new Response("unreachable", { status: 503 });
  }
}

export async function verifyEndpoints(primary: string, backup: string | undefined, expected: NamedCluster, fetcher: typeof fetch = fetch): Promise<string[]> {
  const accepted: string[] = [];
  let failure = "No RPC endpoint matched the expected cluster";
  for (const url of [primary, backup].filter((item): item is string => Boolean(item))) {
    try {
      await assertCluster(url, expected, fetcher);
      accepted.push(url);
    } catch (error) {
      failure = error instanceof Error ? error.message : failure;
    }
  }
  if (!accepted.length) throw new Error(failure);
  acceptedEndpoints = accepted;
  return accepted;
}

export async function assertCluster(url: string, expected: NamedCluster, fetcher: typeof fetch = fetch): Promise<void> {
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getGenesisHash" }),
      signal: AbortSignal.timeout(4_000),
    });
  } catch {
    throw new Error("The configured RPC did not answer");
  }
  if (!response.ok) throw new Error("The configured RPC did not answer");
  const payload = (await response.json()) as { result?: string };
  if (!payload.result) throw new Error("The configured RPC did not return a genesis hash");
  const actual = clusterOf(payload.result);
  if (actual !== expected) throw new Error(`The configured RPC is ${actual}, not ${expected}`);
}
