import { describe, expect, it } from "vitest";
import worker from "./productionWorker";

describe("production worker", () => {
  it("refuses room, deposit, settlement, refund, and swap routes", async () => {
    for (const path of ["/api/rooms", "/api/rooms/prepare", "/api/funding/session", "/api/funding/quote", "/api/settle", "/api/refund"]) {
      const response = await worker.fetch(new Request(`https://sudoku-mainnet.example${path}`, { method: "POST", body: "{}" }));
      expect(response.status).toBe(403);
      const body = await response.json() as { funding: string; signable: boolean; deposits: string };
      expect(body).toMatchObject({ funding: "off", deposits: "off", signable: false });
    }
  });

  it("reports an unconfigured RPC without enabling funding", async () => {
    const response = await worker.fetch(new Request("https://sudoku-mainnet.example/api/health"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ funding: "off", signable: false, rpc: "not-configured" });
  });
});
