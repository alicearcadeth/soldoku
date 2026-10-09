# Soldoku product status — 2026-10-09

Living snapshot. Historical evidence folders keep their original wording; this file is current.

## Source lines

| Line | Identity | Notes |
|------|----------|-------|
| **Deployed (live)** | `d9a182a` via soldoku.com + www `/api/release` | Dirty: false; Worker `ecaf2e9f-…` + pause secret `b7bda8cd-…` |
| **main (GitHub)** | `d9a182a` Merge PR #2 | Pause UX, walletCall hang fix, Join/Start copy, pilot docs |
| **PR #2** | **MERGED** | https://github.com/alicearcadeth/soldoku/pull/2 |
| **APK tested** | `com.sudoku.game` 0.1.0 / SHA-256 `bf427627…` | Shell loads **live** web (`d9a182a`) |

## Availability

| Surface | State |
|---------|-------|
| Classic / Practice | Available on live |
| Free competitions | Available; cancel-return + join→Start on `CA64EA8C` verified on `d9a182a` (see AUTHORIZE-RETURN.md; session-reuse caveat) |
| Funded Devnet entry | **Paused**. Claims/refunds/settlement + room reads remain |
| Card funding | Foundations **deployed-but-disabled** (not unreleased) |
| Mainnet / real payments | Off |

## Validated journeys (internal agent + owner HITL)

| Journey | Environment | Verdict |
|---------|-------------|---------|
| Classic pause / bg / Continue | Seeker + `d9a182a` | Passed (`docs/evidence/2026-10-09-deploy/`) |
| Free room browse / LB read | Seeker + `d9a182a` | Passed (`61702E42`) |
| Wallet connect cancel / MWA BACK | Seeker + `d9a182a` | Passed |
| Join → Start challenge, count +1, no hang | Seeker + `d9a182a` | Passed (`CA64EA8C`); fresh Seed Vault message sheet not re-observed (session cache) |
| Full Join → play → LB | Seeker + prior `f4619a4` | Passed historically — `7:50.6 · rank 2` |
| Funded deposit / claim / refund on device | — | **Untested** this phase |
| External-player pilot | — | **Not started** |

## Gaps

1. Optional: retest fresh message Seed Vault after session expiry.
2. Bounded funded Devnet physical plan still needs separate pause-lift auth.
3. Do not clear Soldoku/wallet app data during testing (`pm clear --cache-only` was attempted once; outcome unknown — see deploy ASSESSMENT).

## Evidence index

- Post-deploy assessment: `docs/evidence/2026-10-09-deploy/ASSESSMENT.md`
- Pre-deploy Seeker (f4619a4): `docs/evidence/2026-10-09-seeker/`
- Merge-tip backup: `C:\Soldoku-reconstruct\backups\soldoku-main-2026-10-09-d9a182a`
