const code = process.argv[2];
if (!code) throw new Error("room code missing");
const response = await fetch(`https://sudoku.jamesbitarcade.workers.dev/api/rooms/funds?code=${encodeURIComponent(code)}`);
const body = await response.json();
const { vault, status, outcome, programId, stake, deposited, chain, signature } = body;
console.log(JSON.stringify({ status: response.status, vault, accountStatus: status, outcome, programId, stake, deposited, chain, signature: signature ?? null, error: body.error ?? null }));
