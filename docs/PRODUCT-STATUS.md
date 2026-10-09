# Soldoku product status — 2026-10-09

Living snapshot. Historical evidence folders keep their original wording; this file is current.

## Source lines

| Line | Identity | Notes |
|------|----------|-------|
| **Deployed (live)** | `f4619a4` via `https://soldoku.com/api/release` | Dirty: false |
| **main (GitHub)** | `5ead4e6` Merge PR #1 | Settlement recovery + disabled card foundations |
| **PR #2 head** | `6accfca` on `seeker-product-2026-10-09` | Pause UX, walletCall hang fix (+ hasFocus), Join/Start copy, pilot docs — **not merged, not deployed** |
| **APK tested** | `com.sudoku.game` 0.1.0 / SHA-256 `bf427627…` (`docs/evidence/2026-10-09-seeker/APK-IDENTITY.md`) | Loads **live** web (`f4619a4`), not PR #2 assets |

## Availability

| Surface | State |
|---------|-------|
| Classic / Practice | Available on live |
| Free competitions | Available on live; physical Join → play → leaderboard verified on Seeker |
| Funded Devnet entry | **Paused** (API + PR #2 UI notice). Claims/refunds/settlement intended to remain |
| Card funding | Foundations merged; production adapter **disabled**; `/api/funding/card` → unknown/disabled path |
| Mainnet / real payments | Off |

## Validated journeys (internal agent + owner HITL)

| Journey | Environment | Verdict |
|---------|-------------|---------|
| Classic / Practice nav, pause, notes, undo | Seeker + `f4619a4` | Passed (earlier evidence) |
| Free room detail, Join message proof | Seeker + owner Seed Vault | Passed (`61702E42`) |
| Start → moves → bg/fg → complete → LB | Seeker scripted + physical | Passed — **7:50.6 · rank 2** |
| Wallet connect reject / MWA cancel return | Seeker | Passed |
| Funded deposit / claim / refund on device | — | **Untested** |
| Card payment | — | **Unavailable** (by design) |
| External-player pilot | — | **Not started** |

## Gaps before external pilot

1. Merge + deploy PR #2 (owner authorize) so pause copy + hang fix ship.
2. Bounded funded Devnet physical plan ready; execution needs pause lift auth.
3. Reconnect after disconnect left phone on Connect wallet — expected after reject tests.
4. Solver/collusion residual risk remains for competitions (timing rules do not eliminate it).

## Evidence index

- Physical Seeker: `docs/evidence/2026-10-09-seeker/` (+ `PROVENANCE.md`, `SUMMARY.md`)
- Backup tip (includes `.git`): `C:\Soldoku-reconstruct\backups\soldoku-2026-10-09-1551-39f7eea`
