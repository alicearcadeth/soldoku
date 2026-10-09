# Alternate-wallet fresh-message attempt — 2026-10-09 (ICT evening)

## Goal

Complete a **fresh** Seed Vault **message** authorize on live `d9a182a` while the primary wallet (`E3DQ…DpJn`) still has a valid competition session (~expires **2026-10-10 14:01 ICT**).

## What happened

| Step | Result |
|------|--------|
| Disconnect primary | Passed (home showed Connect wallet) |
| Owner reconnect #1 | Same wallet `E3DQ…DpJn` via MWA — rejected for fresh-message purpose |
| Script bug | First “passed” alt-connect with `primaryChip:null` accepted E3DQ — **fixed** to reject `/E3DQ/` |
| Owner reconnect #2–3 | MWA seen; ended on **`connect.phantom.app`** UI; no non-E3DQ chip on Soldoku Home |
| Fresh message on `d9a182a` | Still **unverified** |

Artifacts: `alt-wallet-fresh.json`, `alt-wallet-fresh-run*.log`, `70-*` dumps, `scripts/seeker-alt-wallet-fresh.mjs`.

## Owner next steps (pick one)

### A — Alternate Seed Vault account (now)

1. Use **Solana Mobile Wallet / Seed Vault** account switcher (not Phantom browser `connect.phantom.app`).
2. Select a **different** Devnet-capable owner account (Home chip must not show `E3DQ…`).
3. In Soldoku: Connect wallet → **Mobile Wallet Adapter** → approve Connect.
4. Say “ready” in chat — agent runs create/join → approve **MESSAGE** → Quick-check if creating.

### B — Wait for natural expiry

After **2026-10-10 ~14:05 ICT**, keep `E3DQ…`, re-run session probe, then `SEEKER_ROOM=<free> node scripts/seeker-fresh-message.mjs`.

## Constraints unchanged

No storage clear, no funded rooms, no card, no Mainnet, no invites.
