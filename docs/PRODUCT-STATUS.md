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
| Free competitions | Available; cancel-return verified on `d9a182a`; message **approve** return still needs owner on this tip |
| Funded Devnet entry | **Paused**. Claims/refunds/settlement + room reads remain |
| Card funding | Foundations **deployed-but-disabled** (not unreleased) |
| Mainnet / real payments | Off |

## Validated journeys (internal agent + owner HITL)

| Journey | Environment | Verdict |
|---------|-------------|---------|
| Classic pause / bg / Continue | Seeker + `d9a182a` | Passed (`docs/evidence/2026-10-09-deploy/`) |
| Free room browse / LB read | Seeker + `d9a182a` | Passed (`61702E42`) |
| Wallet connect cancel / MWA BACK | Seeker + `d9a182a` | Passed |
| Join message approve → no Verify hang | Seeker + `d9a182a` | **Needs owner** (fix is in live JS) |
| Full Join → play → LB | Seeker + prior `f4619a4` | Passed historically — `7:50.6 · rank 2` |
| Funded deposit / claim / refund on device | — | **Untested** this phase |
| External-player pilot | — | **Not started** |

## Gaps

1. Owner Seed Vault approve on `d9a182a` to close authorize-return gap.
2. Bounded funded Devnet physical plan still needs separate pause-lift auth.
3. Do not clear Soldoku/wallet app data during testing (`pm clear --cache-only` was attempted once; outcome unknown — see deploy ASSESSMENT).

## Evidence index

- Post-deploy assessment: `docs/evidence/2026-10-09-deploy/ASSESSMENT.md`
- Pre-deploy Seeker (f4619a4): `docs/evidence/2026-10-09-seeker/`
- Merge-tip backup: `C:\Soldoku-reconstruct\backups\soldoku-main-2026-10-09-d9a182a`
