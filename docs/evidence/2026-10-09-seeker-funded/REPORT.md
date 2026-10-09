# Physical funded attempt — blocked, funds recovered

Hosted source remained `0b3055bebe3d700c7c77fc869214261ab05d8817`. No program or timing changes. The owner authorized bounded physical Devnet testing. Funding was temporarily opened for controlled test deposits and restored to paused after each attempt. Mainnet/card execution were never enabled in Soldoku.

## Observations

1. Phone wallet `E3DQ…DpJn` initially had 5 Devnet SOL and no TEST account. A real competition message approval allowed the faucet to supply 20 TEST; balance was checked on finalized Devnet.
2. First rooms: `8BF91AC5` (winner plan), `A7056F8B` (refund plan). The controlled opponent deposited 1 TEST into each. The phone's first attempt surfaced a local MWA websocket failure after the handoff stalled. A fresh attempt led the owner to report Seed Vault's explicit Mainnet-versus-Devnet warning. This explains that retry's refusal; it does not prove the preceding websocket failure had the same cause.
3. Owner switched Seed Vault to Devnet. The first rooms' solo stakes were refunded after registration closed. Both vaults ended at zero and the opponent returned to 34 TEST. See mainnet-attempt-cleanup.json.
4. Fresh rooms: `6D7076B2`, `DA19BD20`, 5-minute registration plus 30-minute play. The opponent deposited 1 TEST in each. On the winner room, Seed Vault reached biometric approval, the owner approved, and the app returned. It then displayed `Unrelated instructions cannot be relayed by the competition API.` See relay-error.png/xml.
5. The relay validation rejected the signed transaction before broadcast. The observed phone balance stayed at 20 TEST and both rooms retained only one participant. The offending program is not identifiable from the old generic error. Do not assume it is Compute Budget, Memo, or harmless, and do not relax the allowlist without evidence.
6. Pause restored. Both fresh rooms' solo opponent deposits refunded with finalized successful signatures. Vaults are zero and opponent balance restored to 34 TEST. Duplicate refund preparation was rejected for both, balance delta zero. See chain-state.json.

## Verdict

- Physical message approval and Devnet test funding: passed.
- Physical transaction request, approval, and return on the Devnet retry: observed.
- Physical escrow deposit: failed at relay validation, no phone deposit observed.
- Physical funded gameplay, scheduled settlement, winner claim, refund, and duplicate-payment protection: not completed. CLI solo cleanup is not physical claim evidence.
- No outstanding TEST from these four test rooms. Rent remains in program accounts; no close instruction was introduced.
- No app/cache/wallet storage was cleared or APK reinstalled. The phone's failed signed pending receipt was left intact; it must expire/reconcile before another approval.

## Prepared diagnostic change (not deployed)

`assertRelayedCompetitionTransaction` now includes the public rejected program ID in its existing rejection message. No signed bytes, signatures, private keys, or session tokens are added. Validation and financial behavior are unchanged. A regression assertion failed before the change and passed afterward. Full suite: 306 passed / 6 skipped; TypeScript and build passed. Client JS/CSS hashes are unchanged.

Next: deploy this exact reviewed diagnostic revision only with owner authorization, identify the real extra instruction from a controlled attempt, then implement narrowly justified compatibility handling if safe. Do not treat the diagnostic change as a fix or an end-to-end pass.

Also observed: the funded join notice incorrectly says the timer starts when Start is pressed. Funded rooms use the shared start time. This copy defect is recorded but was not changed in the live release during testing.

Authentication sessions used by the CLI helper remain in gitignored output, not evidence/GitHub. The helper uses an existing Devnet-only test key and verifies the Devnet genesis hash before transactions.
