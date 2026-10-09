# Bounded physical Devnet deposit / claim / refund plan

**Status:** Prepared only. **Do not execute** without explicit owner authorization to lift the live funding pause for a test window.

## Preconditions (owner)

1. Authorize temporary pause lift (or a dedicated test env with escrow enabled).  
2. Seeker unlocked; Seed Vault ready for **transaction** approve (not only messages).  
3. Wallet funded with Devnet SOL + TEST; amounts small and documented.  
4. Confirm live program IDs / mint match intended Devnet escrow.  
5. Recorder ready: room code, signatures (explorer links), screenshots **without** seed material.

## Bound

- **One** free-tier-sized stake room, **≤ 2** entrants, short registration + play windows.  
- Stop after one successful refund **or** one claim path — do not iterate endlessly.  
- No Mainnet, no cards, no third-party invites during the window.

## Steps (when authorized)

1. Create For-tokens room (TEST) while pause is lifted.  
2. Entrant A deposits; confirm escrow open on explorer.  
3. Entrant B deposits (or document solo-refund path if only one joins).  
4. Play or let window end per intended settlement branch (win / tie / no finish / solo refund).  
5. Claim winner payout **or** refund; confirm chain status + in-app receipt.  
6. Re-enable pause immediately after evidence captured.

## Explicit non-claims

- Free-room message signing does **not** validate deposit signing.  
- A clean escrow round does **not** prove solver-resistant competition.

## Evidence to keep

Room code, cluster, stake, signatures, before/after balances (redacted), UI status strings, `/api/release` commit during the window.
