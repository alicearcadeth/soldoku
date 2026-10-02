import { createServer } from "node:http";
import { writeFileSync } from "node:fs";

const port = Number(process.env.MOCK_PORT ?? "8901");
const mode = process.env.MOCK_MODE ?? "429";
const genesis = process.env.MOCK_GENESIS ?? "2Q6BKLaXbJqkH61fHgdnqVpFhvzop3QnAMYufAfbuvB5";
const counts = { genesis: 0, limited: 0 };
const logPath = process.env.MOCK_LOG ?? "output/rpc-mock.json";

const server = createServer((req, res) => {
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const body = Buffer.concat(chunks).toString("utf8");
    const method = body.includes("getGenesisHash") ? "getGenesisHash" : "other";
    if (method === "getGenesisHash") counts.genesis += 1;
    else counts.limited += 1;
    writeFileSync(logPath, JSON.stringify({ mode, ...counts }));
    if (mode === "429" && method !== "getGenesisHash") {
      res.writeHead(429, { "content-type": "application/json", "retry-after": "2" });
      res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32005, message: "rate limited" } }));
      return;
    }
    if (mode === "wrong" && method === "getGenesisHash") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d" }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result: genesis }));
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`mock ${mode} on ${port}`);
});
