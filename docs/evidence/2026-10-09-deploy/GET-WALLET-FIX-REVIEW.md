# Get-wallet fix review — pilot deploy gate

Review of `a907d1a` (Hide Phantom Get-wallet download when Mobile Wallet Adapter is present). No deploy in this phase.

## Bug (live `d9a182a`)

Seeker Connect sheet shows **Phantom / Solflare / Backpack → Get wallet ↗** even when Mobile Wallet Adapter is detected and `app.phantom` is installed. Tapping Get-wallet opens a download / `connect.phantom.app` path and ignores the installed MWA route.

Repro loop (red on live): `node scripts/seeker-wallet-sheet-probe.mjs` → `wallet-sheet-probe.json` (`hasMwa: true`, `hasPhantomGetWallet: true`).

## Fix (git only; not on live)

| Piece | Status |
|-------|--------|
| `walletInstallSuggestions()` returns `[]` when MWA present | In `a907d1a` |
| MWA ordered first; Seeker copy points at Seed Vault / installed mobile wallets | In `a907d1a` |
| Unit tests `src/ui/walletInstallSuggestions.test.ts` | **4/4 passed** (re-run 2026-10-09) |
| Seeker green probe after fix | **Blocked** until hosted redeploy (not authorized here) |

## Pilot deploy gate (3–5 free invitees)

| Question | Answer |
|----------|--------|
| Is deploy of `a907d1a` **necessary** before a guided 3–5 free pilot? | **No** |
| Why | Free Compete uses **Mobile Wallet Adapter · Detected · connect**. That path works on live `d9a182a`. The Get-wallet row is a UX trap, not a blocked auth/play API. |
| Mitigation without deploy | Invite handout: tap **Mobile Wallet Adapter** only; do **not** tap Get wallet / Phantom download. Owner briefs Seeker users once. |
| When deploy **is** necessary | Before a wider / less-guided Seeker cohort, or if any invitee hits the download dead-end and cannot recover. |

Recommended: deploy `a907d1a` (or later tip containing it) when the owner next authorizes a release — not a hard gate for this limited free pilot.
