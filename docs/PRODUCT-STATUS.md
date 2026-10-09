# Soldoku product status — 2026-10-09

Living snapshot. Historical evidence folders keep their original wording; this file is current.

## Source lines

| Line | Identity | Notes |
|------|----------|-------|
| **Deployed (live)** | `d9a182a` via soldoku.com + www `/api/release` | Dirty: false; Worker `ecaf2e9f-…` + pause secret `b7bda8cd-…` |
| **main (GitHub)** | ahead of live (includes `a907d1a` Get-wallet fix + evidence) | Live web still `d9a182a` until owner deploys |
| **PR #2** | **MERGED** | https://github.com/alicearcadeth/soldoku/pull/2 |
| **APK tested** | `com.sudoku.game` 0.1.0 / SHA-256 `bf427627…` | Shell loads **live** web (`d9a182a`) |

## Availability

| Surface | State |
|---------|-------|
| Classic / Practice | Available on live |
| Free competitions | Available on live; physical free auth verified on `d9a182a` (see AUTHORIZE-RETURN / FRESH-MESSAGE-PASSED) |
| Funded Devnet entry | **Paused**. Claims/refunds/settlement + room reads remain |
| Card funding | Foundations **deployed-but-disabled** (not unreleased) |
| Mainnet / real payments | Off |

## Validated journeys (internal agent + owner HITL)

| Journey | Environment | Verdict |
|---------|-------------|---------|
| Classic pause / bg / Continue | Seeker + `d9a182a` | Passed (`docs/evidence/2026-10-09-deploy/`) |
| Free room browse / LB read | Seeker + `d9a182a` | Passed (`61702E42`) |
| Wallet connect cancel / MWA BACK | Seeker + `d9a182a` | Passed |
| Existing-session join → Start, count +1, no hang | Seeker + `d9a182a` | Passed (`CA64EA8C`) |
| Fresh Seed Vault message authorize on live tip | Seeker + `d9a182a` | **Passed** (`BTzc…fY9r` → `D878A8E1`) — `FRESH-MESSAGE-PASSED.md` |
| Full Join → play → LB | Seeker + prior `f4619a4` | Passed historically — `7:50.6 · rank 2` |
| Funded deposit / claim / refund on device | — | **Untested** this phase |
| External-player pilot | live `d9a182a` | **OPEN** — owner invites 3–5; agent ops in `docs/evidence/2026-10-09-free-pilot/` |

## Gaps

1. Get-wallet UI fix (`a907d1a`) reviewed; **not required** before a guided 3–5 free pilot — see `GET-WALLET-FIX-REVIEW.md`. Redeploy when owner next authorizes a release.
2. Owner may authorize invites using `docs/pilot/FREE-COMPETITION-PILOT.md` — no invites under this phase alone.
3. Bounded funded Devnet physical plan still needs separate pause-lift auth. Do not clear Soldoku/wallet app data.

## Evidence index

- Post-deploy assessment: `docs/evidence/2026-10-09-deploy/ASSESSMENT.md`
- Pre-deploy Seeker (f4619a4): `docs/evidence/2026-10-09-seeker/`
- Merge-tip backup: `C:\Soldoku-reconstruct\backups\soldoku-main-2026-10-09-d9a182a`
