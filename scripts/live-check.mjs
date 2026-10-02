const origin = "https://sudoku.jamesbitarcade.workers.dev";
const html = await fetch(origin).then((response) => response.text());
const src = html.match(/assets\/index-[^"']+/)?.[0] ?? "";
const balances = await fetch(`${origin}/api/balances?wallet=11111111111111111111111111111111`).then((response) => response.json());
console.log(JSON.stringify({ src, cluster: balances.cluster ?? null, mint: balances.mint ?? null, error: balances.error ?? null }));
