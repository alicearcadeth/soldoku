# Mainnet path

Public real-value staking stays off. The current public app is https://soldoku.com/, Worker `soldoku`, on Devnet. Funded competitions use program `6uuszYMoZ2bBX8oVccpYPUgdhW6CSvASziN2m8LpJxYs` and TEST mint `BtdrgokAvXQE4yj3zS48c4ktnMSy3TGoRkHCWD5fV8U4`. This file reviews the older two-player Devnet programs. It is not the current competition release. See [CURRENT_RELEASE.md](CURRENT_RELEASE.md).

## What the Devnet program actually does

Two Devnet programs are live. New public staked rooms use `937BAWXVCW58oEKkA1FijkSXXtdgGEytUyPRV2Roge22`. Rooms opened before that cutover stay on `HUkhJi8p1XXuErpEXkgpfQjwdapigXLECRoQSu3indyS`. The match account is a PDA from the match id. The vault is the match account's associated token account. The mint is whatever the open instruction writes. Neither program hardcodes the Devnet test mint, and neither accepts native SOL.

V2 open stores the authority and requires that account to sign. The public worker returns that open transaction unsigned. The seated wallet signs first, and only then does the worker add the `AixXFtny6qq792Pzt8G7ytLbM1eKRXZGSAx91EqBRo7s` signature to the same message. The legacy program still stores whatever authority pubkey is on the instruction, and that account does not have to sign. The hosted app no longer builds a new legacy open. A custom client can still call the legacy program directly. The worker refuses to mark a deposit confirmed unless the account owner, stored authority, mint, stake, and seated player match the room. Neither check pulls tokens back out of a vault whose authority was already swapped. Localnet reproduced that swap on the old bytecode. The V2 bytecode rejected an unsigned substitution, and a player could still reclaim a waiting stake after the join deadline.

Settlement pays the winner `stake * 2`, or returns each stake on a draw. A second settle of a settled account returns success and does not transfer again. Cancel is rejected until the join deadline (still waiting) or the settle deadline (in progress), and it is rejected after settlement. A repeated cancel does not transfer again. If the match authority is unavailable, players can still cancel once the relevant deadline has passed and receive their stake back. Before that deadline the tokens stay in the vault.

The worker, not the program, decides the winner. The authority key lives in the Worker secret `SUDOKU_AUTHORITY_KEY`. Anyone who can use that key can settle an active match to either player. The legacy program's upgrade authority is the Devnet player wallet `JCVsKd4TMg1fvEs7rjf5YgLYbJfNC8Dwb4x1PchFkGM7`. Escrow V2's upgrade authority is `6fTc4rVYFz6NtHDZXeGQqTTQTiCe41Fsrz8ypxqMt8dX`. Neither is a Mainnet identity. A Mainnet deployment needs a new upgrade key and a new match authority. `assertProductionDraft` in `src/solana/productionGate.ts` rejects the live Worker name, the live D1 id, both Devnet program ids, the Devnet mint, and those Devnet keys. `scripts/production-preflight.mjs` runs that gate against live Mainnet account reads. `assertProductionEnabled` also requires the program account, USDC's 6 decimals, the Mainnet genesis, and the approval phrase. Neither path deploys or arms production. There is no platform fee. Players pay the open, join, and cancel transaction fees. The authority pays the settle fee. Rent for the match account and its vault is paid by the player who opens the room. Cancel and settle return the room tokens. They do not return that rent, and they do not refund the network fee. The new Close instruction, tested only on Localnet, returns both rent balances to player A after the vault is empty and the match is settled or cancelled. The live Devnet programs do not have that instruction, so a completed Devnet refund still leaves the rent in the match account.

New Devnet rooms store 1, 2, or 5 test tokens (6 decimals). Escrow V2 already reads that amount from the open instruction, so the public program was not upgraded. Older rooms with no stored amount still settle at 1 token. These choices are Devnet test limits, not Mainnet policy. Completed and funded Devnet rooms stay in the current D1 database.

## Environment boundary

| | Devnet, live now | Mainnet, not created |
|---|---|---|
| Worker | Older two-player shell `sudoku` on jamesbitarcade. The current public Worker is `soldoku` at https://soldoku.com/ | A new Worker and a new D1 database |
| Cluster check | Devnet genesis `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG` | Mainnet genesis `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d` |
| Program | V2 `937BAWX...` for new rooms. Legacy `HUkhJi8...` for old rooms | A new deployment. Do not reuse either Devnet program id |
| Mint | The Devnet test mint in the Worker secret | An allowlisted SPL mint, recommended USDC |
| Authority | The current Devnet key | A new key, stored apart from the Devnet key |
| RPC | `SOLANA_RPC`. Backup is unset | Primary `api.mainnet-beta.solana.com`. Backup host `solana-rpc.publicnode.com`, checked for Mainnet genesis. Replace it with a dedicated provider before real-value use |
| Web wallet chains | `solana:devnet` and `solana:localnet` only | Add `solana:mainnet` only in that environment |

`SOLANA_CLUSTER=mainnet-beta` is rejected at startup. A Devnet process also rejects a Mainnet RPC host, the Mainnet USDC mint `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`, and any program id other than the legacy program or Escrow V2. Localnet must use a loopback RPC. Do not copy the Devnet key, the Devnet mint, or the Devnet D1 database into a production Worker.

## Program migration

The legacy program was not upgraded. `open` on `HUkhJi8p1XXuErpEXkgpfQjwdapigXLECRoQSu3indyS` still does not require the authority signature. Its upgrade authority is still the Devnet player wallet `JCVsKd4TMg1fvEs7rjf5YgLYbJfNC8Dwb4x1PchFkGM7`. Do not upgrade that program and do not use a player wallet as a Mainnet upgrade authority.

The signed-authority binary is deployed as `937BAWXVCW58oEKkA1FijkSXXtdgGEytUyPRV2Roge22`. The upgrade authority is `6fTc4rVYFz6NtHDZXeGQqTTQTiCe41Fsrz8ypxqMt8dX`, which is not a player wallet. Public Devnet room creation now uses this program. Staging remains a separate Worker and D1. The room inventory and rollback rule are in `docs/escrow-v2.md`.

The rebuilt program file `programs/match-escrow/target/deploy/match_escrow.so` has SHA-256 `5a701b7fb50fe8e4065e7c707ce5413dfda0b3866d08c826ec28f8e1f3221b72` and is 25,552 bytes. That bytecode does not contain a program id. It adds instruction 4, Close, which is not in either deployed Devnet program. Do not upgrade the public V2 or legacy program with this file. The keypair beside the artifact is still the legacy Devnet program and must not deploy production. `scripts/production-deploy.mjs` dry-runs only the dedicated keypair `4GqmVjmNLwfJ8UrtGTV9C2RZAqNqRiaGGmCsKRX7EKMH` from `config/production.json`. It refuses the artifact keypair, both Devnet program ids, and `--execute`. It is not deployed. `scripts/mainnet-deploy-cost.mjs` estimates that first deployment at about 0.180 SOL from the 25,552-byte artifact, program-account rent, and a 20-signature fee allowance. That is an estimate, not a paid deployment. The unauthorized command is `solana program deploy programs/match-escrow/target/deploy/match_escrow.so --program-id <dedicated production keypair> --upgrade-authority <production upgrade keypair>` against a Mainnet RPC. A public backup RPC is not a dedicated provider; replace `solana-rpc.publicnode.com` before any real-value use. Failover checks genesis before it sends a transaction to a backup.

Do not transfer escrow balances from one program to the other. On 26 Sep 2026 the legacy vaults were empty, and the public V2 rooms opened for the cutover were settled or refunded back to zero. An in-place upgrade of the legacy program remains a separate decision and is not the path in use. Mainnet still needs its own program, upgrade authority, match authority, worker, and D1.

## DFlow and the first asset set

DFlow's current trading API uses `GET /order` on `https://quote-api.dflow.net`. Production calls send `x-api-key`. The developer host `https://dev-quote-api.dflow.net` does not need a key. A quote needs `inputMint`, `outputMint`, and `amount`. `slippageBps` sets the worst price. The response field `otherAmountThreshold` is the minimum output after fees. When `userPublicKey` is set, the response includes a transaction and `lastValidBlockHeight`. That transaction expires with its blockhash. Omit the public key when only a price is needed.

Native SOL and wrapped SOL are explicit. `wrapAndUnwrapSol` defaults to wrapping, and the current order docs say to set it when the input or output mint is the wrapped-SOL mint `So11111111111111111111111111111111111111112`. Native SOL is not an SPL token account, so this escrow cannot hold it. Wrapped SOL can sit in a token account, but closing it and recovering rent makes refunds a second product. USDC is the settlement asset to review first. The Mainnet mint above is the candidate. It is not configured in this Worker, and this sprint did not place a Devnet USDC mint in the app. Both players deposit the same USDC amount. A player who starts with SOL sees the quote, the fee, the minimum USDC, and the refund asset before signing.

`POST /api/quote` checks the allowlist. Unless `DFLOW_QUOTE_URL` is set, it returns that live conversion is off. When the URL is set, the Worker calls `GET /order` without a wallet, so the response has no transaction. The public route still forces execution off, including on Devnet, and it never returns a signable swap. The public Worker does not have that secret. A quote response is not a swap and not a deposit. The funding states in `src/solana/funding.ts` still apply when a quote is used:

- A quote expires before signing. The player must request a new quote. The old one cannot be submitted.
- A swap whose outcome is unknown keeps that signature. A retry checks it. It does not build a second swap.
- A confirmed swap with output below the stake stops. It is not a deposit, and the app does not send another swap on its own.
- A confirmed swap still needs a separate wallet approval for the escrow deposit.
- An unknown deposit keeps the deposit signature. Only a confirmed deposit, with the vault holding the stake, is funded.
- The same settlement asset skips the swap. The deposit is still its own approval.

A failed or expired swap is not a deposit. The Compete screen tells the player to deposit the test token for the room. Do not buy a DFlow plan or create a production key for this app until the owner asks. Sudoku should get its own API key rather than sharing another project's secret. A development quote for 0.01 SOL to USDC succeeded on `dev-quote-api.dflow.net` with no transaction attached, because no wallet was sent.

Suggested first limits, not enabled: one settlement asset, USDC; stake chosen later inside a small range such as 1 to 20 USDC; no platform fee; no second token, subscription, or project token. Operational cost until then is the authority's settle fee, match-account rent paid by the opener, RPC, and hosting.

## Sequence

1. New Worker, D1, RPC, backup RPC, authority, and mint. Leave the Devnet Worker as it is.
2. Owner chooses the asset and the stake range.
3. Deploy a new Mainnet program from the V2 source. Record the upgrade authority and who holds it. Do not upgrade either Devnet program in place.
4. Put the new authority in a secret that is not the Devnet key. Decide who can deploy and who can settle.
5. Verify the deployed bytecode against the reviewed source.
6. Confirm both RPCs against Mainnet genesis. Alert when settlement stays pending.
7. Add the DFlow quote and the signed swap only after the owner has an API key. Keep the swap and the escrow deposit as two transactions.
8. Add `solana:mainnet` to the Web Shell only in that environment, then repeat the Seeker deposit, finish, and reopen test.
9. Publish the competition rules, the dispute path, and the legal review. See `docs/fair-play.md`.
10. Enable deposits for a small allowlisted trial only after the owner accepts the remaining solver risk.

## Real-value checklist

This is an internal list, not an independent audit. Production funding stays off until every line is true and the owner sets the approval phrase outside this repository.

- The escrow program on Mainnet matches a reviewed build, and its upgrade authority is not a player or the match authority.
- Match authority, upgrade authority, Worker, D1, and both RPCs are new and are not the Devnet identities.
- Settlement is the verified USDC mint, 6 decimals, and the stake range is an explicit owner decision.
- Wallet connection, message signing, transaction signing, broadcast, and confirmation stay separate checks.
- A DFlow swap and the escrow deposit stay two approvals. A swap is never shown as a funded room.
- Unknown signatures are retried in place. A failed deposit does not start a second swap.
- External-solver risk, competition rules, a support contact, and legal review are accepted.
- Incident steps in `docs/ops.md` name the on-call person, the backup RPC, and the rollback Worker.

## Owner decisions

- Whether the first settlement asset is USDC, and what the minimum and maximum stake are.
- Whether to upgrade or replace the escrow so the authority must sign open.
- Who holds the Mainnet authority, the upgrade key, and the production Android key.
- Whether to request a DFlow production API key.
- The support contact, the competition rules, and the legal review.
- Explicit approval before any real-value deposit is enabled.
