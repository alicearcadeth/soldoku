/** Inert Mainnet shell. Financial paths stay closed. Health checks are read-only. */

const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
const FINANCIAL = ["/api/rooms", "/api/funding", "/api/faucet", "/api/deposit", "/api/settle", "/api/refund"];

type Env = { SOLANA_RPC_MAINNET?: string };

function closed(status = 200): Response {
  return Response.json({
    enabled: false,
    cluster: "mainnet-beta",
    funding: "off",
    deposits: "off",
    signable: false,
    reason: "Production funding is not armed.",
  }, { status });
}

export default {
  async fetch(request: Request, env: Env = {}): Promise<Response> {
    const url = new URL(request.url);
    const financial = FINANCIAL.some((path) => url.pathname === path || url.pathname.startsWith(`${path}/`));
    if (financial || request.method !== "GET") return closed(403);
    if (url.pathname === "/api/health") {
      return Response.json({
        enabled: false,
        cluster: "mainnet-beta",
        funding: "off",
        deposits: "off",
        signable: false,
        rpc: await readOnlyCluster(env.SOLANA_RPC_MAINNET),
      });
    }
    return closed();
  },
};

async function readOnlyCluster(endpoint: string | undefined): Promise<string> {
  if (!endpoint) return "not-configured";
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getGenesisHash" }),
    });
    const body = await response.json() as { result?: string };
    if (body.result === MAINNET_GENESIS) return "mainnet-beta";
    return body.result ? "wrong-cluster" : "unreachable";
  } catch {
    return "unreachable";
  }
}
