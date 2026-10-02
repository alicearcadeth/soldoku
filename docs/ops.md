# Sudoku operations

Devnet only. Do not point these steps at Mainnet.

## See match state

```
npx wrangler d1 execute sudoku-matches --remote --command "SELECT json_extract(value, '$.code') AS code, json_extract(value, '$.chain') AS chain, json_extract(value, '$.staked') AS staked, json_extract(value, '$.players[0].deposited') AS a, json_extract(value, '$.players[1].deposited') AS b FROM matches, json_each(json_extract(body, '$.rooms'))"
```

Chain bytes for a room:

```
GET /api/rooms/funds?code=CODE
```

Escrow status 2 is settled. Status 3 is cancelled. A null status means no escrow account.

## Unknown deposit

1. Keep the original signature. The browser stores it in `sudoku.pending`. A refund in flight is `sudoku.pendingRefund`.
2. Reload, or press Check deposit / Check refund. That posts the same signed transaction.
3. If the vault already holds the stake, the worker accepts the original signature and does not submit another transfer.
4. If the signature status is unknown and the vault is short, wait and check the same signature. An RPC timeout or HTTP 429 is not a failed payment.
5. Ask for a new signature only after the original signature is expired and the vault is still short.
6. If escrow status is already 3, a refund retry does not send another cancel. Status 2 means settlement already happened. Do not send another settle.
7. Status 0 cannot be cancelled until `joinDeadline`. Status 1 cannot be cancelled until `settleDeadline`. The program rejects an early cancel. That is the rule, not a failed payment.

## Stuck room

Compare D1 `deposited` and `chain` with `/api/rooms/funds`. A funded account with `deposited: false` means the transaction landed while the browser was away. Recheck the saved signature. Do not create a room or a deposit to replace it.

## RPC outage

Alchemy Devnet is the only configured endpoint. `SOLANA_RPC_BACKUP` is unset. The Worker secret list has `SOLANA_RPC` and does not have a backup name. Repeated HTTP 429 or timeouts from the primary, with the same signature still unknown, means wait. Do not switch the app to `api.devnet.solana.com` or a free endpoint that rate-limits immediately. A backup requires the owner to create a separate Devnet URL and key, then set `SOLANA_RPC_BACKUP` through the existing secret script. The failover code already checks Devnet genesis, skips an endpoint after a 429, and resubmits the same request body.

Classic and free Practice do not submit chain transactions. They stay available when the site and D1 are up, even if the RPC is down. Staked deposit, settlement, and refund stop until an accepted Devnet endpoint answers.

## Deposit binding

A deposit is recorded only when the match account names this app's authority, the configured mint, the agreed stake, and the seated player. A transaction that swaps the authority is not treated as a deposit for the room.

The worker partial-signs every new open with the public match authority `AixXFtny6qq792Pzt8G7ytLbM1eKRXZGSAx91EqBRo7s`. New public rooms store program `937BAWXVCW58oEKkA1FijkSXXtdgGEytUyPRV2Roge22` and that program requires the authority signature. A room with no `programId`, including UGWU and XVBJ, stays on `HUkhJi8p1XXuErpEXkgpfQjwdapigXLECRoQSu3indyS`. The hosted app refuses a new deposit on an unfunded legacy room. It does not rewrite the room or submit a V2 instruction for it. A funded legacy room still settles and refunds on the legacy program. Players can cancel after the join or settle deadline if the match authority never settles. Cancel does not require the authority key.

Do not roll the public Worker back to version `a3cd73b4-ffe9-4ad2-8772-b41b6ac0b09b` while any V2 room can still be funded. That bundle rejects the V2 program id. The current dual-program Worker can read both. Removing `SUDOKU_ESCROW_V2` stops new V2 rooms; do that only after `getAccount` shows every V2 vault at 0. Do not delete the `matches` row and do not change a room's `programId`.

Startup rejects Mainnet, a Mainnet RPC host, the Mainnet USDC mint, and a Devnet program id other than the legacy program or Escrow V2. Cluster mismatch errors do not include the RPC URL.

## Settlement and refund

Settlement sends one transaction, then stores that signature on the room and in `settle_signatures`. If the escrow account is not status 2 yet, the room stays pending and the screen says the vault payment is not confirmed. The next poll reads the escrow account and checks the same signature. Status 2 marks the room settled and updates a history row that was saved as `pending`. A later poll does not send another settlement. An RPC timeout is not a failed payment. A refunded room does not later become a draw just because the match clock expired.

Refund goes through the cancel instruction. If the account is already cancelled, the player sees that the refund was already confirmed.

## Lobby size

New rooms stop when 24 matches are still waiting. The player sees "The lobby is full. Try again in a few minutes." A listed Practice room drops off after 20 minutes. An unjoined private room, and an unfunded staked room whose `openedAt` is set and whose chain is still `pending`, drop after two hours. A room with a deposit, a missing `openedAt`, or a settled or refunded chain stays. A finished Practice room drops three hours after it started. A finished staked room stays.

## Problem notes

About this beta posts a short note to `feedback_notes`. The row is `at` and `note` only. No wallet, puzzle, or IP address is stored. The worker keeps the newest 200 notes.

```
npx wrangler d1 execute sudoku-matches --remote --command "SELECT id, at, note FROM feedback_notes ORDER BY id DESC LIMIT 20"
```

There is no public page that lists these notes.

## What not to do

Do not delete the `matches` row. Do not add a public signing or fault-injection route. `SOLANA_RPC_BACKUP` stays unset until a second Devnet endpoint stays under its rate limit.
