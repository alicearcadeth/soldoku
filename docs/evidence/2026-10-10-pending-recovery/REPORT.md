# Pending transaction recovery correction

Live remains `88a40f8`. New funded rooms/deposits remain paused. The correction is local until its exact release is authorized and deployed.

## Reproduction

`node scripts/browser-escrow-recovery.mjs` drove the real Competitions UI through a declined approval, signed claim, and lost submit response. Before the fix its new assertion failed: `Lost-response recovery erased the prepared transaction expiry height.` The browser path replaced the prepared height with zero, and never reconciled the receipt before resubmission. A separate closed-room check did not exist.

## Change

Preserve prepared expiry metadata through submit, timeout, and confirmation. Add authenticated `/api/competitions/recover` and a Check pending transaction button, available even when registration is closed or funded entry paused. Recovery is read-only: it derives signature/blockhash from fully signed bytes, checks the session wallet, competition program, room and action, and verifies the configured test network. It never broadcasts or admits an entrant.

Only finalized success/failure is terminal. Processed/confirmed observations, including nonfinal errors, remain pending. An absent signature is unknown while its signed blockhash is valid. Expiry requires an invalid blockhash plus a second history lookup to handle confirmation racing the expiry check. RPC failures retain the receipt and block replacement. Numeric height from local storage is not trusted to prove expiry, so old height-zero receipts can recover without storage clearing.

Confirmed receipts refresh finalized room state. Failed/expired receipts remain stored as terminal; a separate user action may request a fresh signature if the action is still allowed. Closed registration still prohibits deposit retry. Existing unknown/pending receipts reuse exactly the same bytes. A submit response with a different signature is rejected and retained as unresolved. Wallet-signing timeout/cancel copy now says nothing new was submitted by Soldoku.

Read-only observation scope checking deliberately does not reuse current registration timestamps to reject old signed transactions after a legitimate extension. Existing submit instruction, amount, destination, wallet, and room checks are unchanged.

## Validation

Browser red → green: lost-response metadata, same-byte refresh resend, wallet-switch block, declined request stores nothing, old height-zero receipt in a closed room, pending/RPC-failure retention, finalized/failed/expired reconciliation, no signature/broadcast during checking, and exactly one fresh signature after explicit expiry retry. These use a browser test wallet and mocked API; they are not new physical or live payment evidence.

Unit coverage uses genuinely signed transaction fixtures and mocked RPC: invalid wallet/room/action, valid versus invalid blockhash, nonfinal errors, finalized failure, confirmation racing expiry, and RPC errors. Funded request coverage checks authenticated paused recovery without financial state mutation or broadcast.

Full suite: 316 passed, 6 opt-in integrations skipped. Chromium harness passed. Production build passed during preparation; a clean committed release build is recorded separately.

## Outstanding physical state

`110FBE65`: zero confirmed entrants, no deposited TEST, old local pending signature `5AfxV1HswTx97cZNxjsd1RSnZrJBJQgAMKzyydLizbHrWHM6hC9y4NCM7sHFVDXahCG4oiHRzPDWRLvzPeUSfFGB` absent from chain history at last read. Its device receipt has not been cleared. Post-deploy recovery of that actual receipt remains required.

`DAABEC94`: 1 TEST remains after its signed one-day extension. Solo refund unlocks 10 October 2026 at 23:04:06 Asia/Bangkok. A one-time thread follow-up is scheduled for 23:05 to verify it and request the owner's physical approval. Refund is not yet performed and cannot be signed on the owner's behalf.

No Mainnet/card execution, program upgrade, database restore, cache clearing, or wallet data clearing.
