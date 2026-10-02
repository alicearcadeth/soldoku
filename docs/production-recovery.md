# Production recovery

This is the operational runbook for the inert Mainnet worker and its empty database. It does not authorize a program deploy, a swap, or real-value funding.

## Database

Production D1 is `sudoku-mainnet`, id `41854498-3ee5-4268-b6ae-5c04c28502ff`, bound only to the `sudoku-mainnet` worker. The public Devnet database is `sudoku-matches` and must not be copied here.

Current production bookmark, read on 2026-09-28 and not restored: `00000003-00000000-000050f4-8f4988e17ac7add1797706ae1b4148c1`.

At that bookmark the remote database had 0 rows in `matches`, `results`, `settle_signatures`, `profiles`, and `play_daily`. Tables present: `_cf_KV`, `coach_usage`, `matches`, `play_daily`, `profiles`, `results`, `settle_signatures`. No Devnet rows were copied. Production was not restored over.

A disposable rehearsal applies `schema.sql` twice to an empty local SQLite file. The second apply adds no tables. That file is not the production database. `wrangler d1 time-travel restore` was not run.

Bookmark after the schema import: `00000002-00000006-000050f4-33fd3b678bd71d6b33e7b828c7b99294`.

Bookmark after the idempotent second import, which wrote zero rows: `00000002-0000000c-000050f4-ed0245d9644e5256e3f1ff0fcc1e42c7`.

Restore with `wrangler d1 time-travel restore sudoku-mainnet --bookmark=<bookmark>` only after checking the target on a disposable copy. Do not restore the empty bookmark over a later database that holds real matches.

Before any later migration:

1. Record `wrangler d1 time-travel info sudoku-mainnet --config wrangler.production.jsonc`.
2. Apply the SQL.
3. Read the table list and row counts. Do not select `matches.body`.

Recovery choices:

- Broken migration: restore the bookmark taken before the migration, then re-apply the known `schema.sql`. Do not edit production rows by hand.
- Accidental update or delete: restore the same bookmark onto a disposable database first. Copy back only after the row counts match the bookmark. Do not restore over production from a Devnet export.
- Failed worker release: deploy the previous inert worker version. The current shell has no financial route, so a rollback does not move tokens.
- Corrupted operational state: stop new paid rooms with `SUDOKU_FUNDING_PAUSED=1`, reconcile the room, and restore D1 only from its own bookmark.

`schema.sql` uses `CREATE TABLE IF NOT EXISTS`. Running it twice does not duplicate tables. It does not delete rows.

## Pause

Set `SUDOKU_FUNDING_PAUSED=1` on the worker that creates rooms. New paid rooms are refused. Practice rooms still open. A room that is already open can still accept moves, and its refund, settlement, and close routes stay available so existing vaults can be returned. Existing vaults are not confiscated. Unset the variable to allow new paid rooms again. This does not require a program upgrade. The production shell also returns 403 for room, deposit, settlement, refund, and funding routes while the owner approval phrase is absent.

## Incidents

- RPC outage: reads may use the backup after its genesis matches Mainnet. A `sendTransaction` is not replayed on the backup. If a signature is unknown, look up that signature. Do not build a second transaction for the same deposit.
- DFlow outage: leave the swap unsent. A confirmed swap stays in the wallet. Deposit the USDC that is already there. Do not quote a replacement while the signature is unknown.
- D1 issue: use the bookmark path above. Do not settle from memory.
- Match authority unavailable: rooms can still reach their deadline and be refunded by a player. Do not deploy a new authority over the old program.
- Upgrade-authority compromise suspicion: stop new paid rooms, do not upgrade the program, and move the authority only after the owner reviews the key. This runbook does not perform that move.
- Swap succeeds and deposit fails: the USDC is in the wallet. Prepare the escrow deposit again from that balance. Do not send another swap.
- Deposit succeeds and the worker response is lost: read the vault balance and the deposit signature. If the vault covers the stake, record the room funded. Do not send the deposit again.
- Settlement unknown: read the saved signature. Send a new settlement only when that signature is absent and the blockhash is dead.
- Need to pause new paid rooms: set `SUDOKU_FUNDING_PAUSED=1`.

## What this runbook does not do

It does not spend Mainnet SOL, broadcast a swap, deploy the program, set `enable-real-value-staking`, or copy Devnet match rows.
