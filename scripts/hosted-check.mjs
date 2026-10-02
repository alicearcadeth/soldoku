const base = "https://sudoku.jamesbitarcade.workers.dev";

const home = await fetch(base);
const html = await home.text();
if (!html.includes("Sudoku")) throw new Error("homepage missing");

const chainRes = await fetch(`${base}/api/chain`);
const chainText = await chainRes.text();
if (/\/v2\/|api[_-]?key|g\.alchemy\.com\/.+/i.test(chainText)) {
  throw new Error("chain response includes a credential");
}
const chain = JSON.parse(chainText);
if (chain.localnet !== false || chain.cluster !== "devnet" || chain.host !== "solana-devnet.g.alchemy.com") {
  throw new Error(`unexpected chain ${JSON.stringify({ cluster: chain.cluster, host: chain.host, localnet: chain.localnet })}`);
}

const captcha = await (await fetch(`${base}/api/captcha`, { method: "POST", body: "{}" })).json();
const checked = await (await fetch(`${base}/api/captcha/check`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ id: captcha.id, value: captcha.target }),
})).json();
if (!checked.ok) throw new Error("captcha was not accepted");
const created = await (await fetch(`${base}/api/rooms`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ level: "easy", captchaId: captcha.id }),
})).json();
if (!created.code) throw new Error(created.error ?? "room was not created");

const again = await (await fetch(`${base}/api/rooms/state?code=${created.code}&playerId=${created.playerId}`)).json();
if (again.code !== created.code) throw new Error("room did not persist");

console.log(JSON.stringify({
  home: home.status,
  cluster: chain.cluster,
  host: chain.host,
  localnet: chain.localnet,
  programId: chain.programId,
  room: created.code,
}));
