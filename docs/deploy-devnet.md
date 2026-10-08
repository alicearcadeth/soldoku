# Devnet deploy notes

Prepared, not authorized. Do not deploy until the owner approves this reconstructed release.

## Target

- Existing `soldoku.com` Worker, config `wrangler.soldoku.jsonc`
- Existing `competition_state` row
- Program `6uuszYMoZ2bBX8oVccpYPUgdhW6CSvASziN2m8LpJxYs` stays as deployed. Do not upgrade it.
- No new required variable. Set `SUDOKU_COMPETITION_PAUSED=1` only to stop new funded rooms and deposits.

## Before

From a clean checkout of the reconstructed commit:

```
npm ci
npm test
npm run build
npx wrangler deploy --config wrangler.soldoku.jsonc
```

## After

Confirm `/api/release`, the new JavaScript hash, the corrected help text, the document script policy, and one fresh Devnet settlement plus one claim. Watch the cron until that settlement is finalized rather than merely broadcast.

## Rollback

Do not roll back to `ee6e0d0` after this code writes `settlementAlso`. That build can hide a signature that may already have been broadcast. Do not restore an older database over newer financial rows.

If the new build misbehaves, pause new deposits with `SUDOKU_COMPETITION_PAUSED=1` and ship a build that still understands `settlement` and `settlementAlso`. Claims, refunds, and settlement recovery stay available during the pause.

## App-independent recovery

Without the site, from this checkout:

```
node --experimental-strip-types scripts/recover-escrow.mjs --dry-run=true --room-id=<id> --wallet=<entrant> --refund=true
```

A missing TEST account exits 3 until `--create-ata=true` is passed. The fee payer creates the account. The destination stays the entrant's own account. `--send=true` requires `SUDOKU_RECOVERY_KEY_FILE` and is not part of an unattended deploy.
