const site = "https://sudoku.jamesbitarcade.workers.dev";
const html = await (await fetch(site)).text();
const bundle = html.match(/assets\/index-[^"']+/)?.[0] ?? null;
const chain = await (await fetch(`${site}/api/chain`)).json();
const wallet = "6qtMCHsqEwxpYqqrdQWbDdJFFYzpKs8o5mmW1Zd9Bju2";
const balances = await (await fetch(`${site}/api/balances?wallet=${wallet}`)).json();
const rooms = [];
for (const code of ["CG5M", "TDFS", "2QUW", "EFMG"]) {
  const body = await (await fetch(`${site}/api/rooms/funds?code=${code}`)).json();
  rooms.push({
    code,
    status: body.status ?? null,
    outcome: body.outcome ?? null,
    chain: body.chain ?? null,
    error: body.error ?? null,
  });
}
const same = await fetch(`${site}/api/quote`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    inputMint: "J7STDEHGniYdSjuY4HKZMoSdr1KckYiGNdfnmsrYiLw7",
    outputMint: "J7STDEHGniYdSjuY4HKZMoSdr1KckYiGNdfnmsrYiLw7",
    amount: "1000000",
    stake: "1000000",
  }),
});
console.log(JSON.stringify({
  bundle,
  cluster: chain.cluster ?? null,
  programId: chain.programId ?? chain.escrowProgramId ?? null,
  chainKeys: Object.keys(chain),
  sol: balances.sol ?? null,
  token: balances.token ?? null,
  rooms,
  quoteStatus: same.status,
  quote: await same.json(),
}));
