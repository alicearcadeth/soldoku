# Reviewable merge & deployment package (phase 2026-10-09)

## Essential before external free-room pilot

| Item | Why |
|------|-----|
| Merge PR #2 | Pause UX + Seeker walletCall hang fix + Join/Start copy |
| Deploy web release from merged tip | Phone APK loads live site; without deploy, hang fix stays unreleased |
| Pilot guide + feedback template | Consistent invites |

## Can wait

| Item | Why |
|------|-----|
| Funded physical deposit/claim | Pause held; plan only |
| Card provider onboarding | Foundations disabled by design |
| Account-switch deep suite | Nice-to-have after free pilot |

## Exact artifacts (update tip after final push)

- **Branch:** `seeker-product-2026-10-09`  
- **PR:** https://github.com/alicearcadeth/soldoku/pull/2  
- **Reviewed tip:** `6accfca24ba58391e3e99fff8da0f941bb10185b`  
- **Live today:** `f4619a4` (unchanged until authorized deploy)  
- **Backup:** `C:\Soldoku-reconstruct\backups\soldoku-2026-10-09-1551-39f7eea` (plus later backups if created)

## Deploy target (when authorized)

- Existing Cloudflare Worker + static assets for `soldoku.com` (same pipeline as prior releases).  
- Config: funded pause remains **on** unless a separate owner auth lifts it.  
- Card adapter remains disabled-production.

## Expected post-deploy identity

- New `/api/release` `commit` = deployed git SHA  
- Asset hashes in that JSON update  

## Compatibility

- Existing free rooms and leaderboard rows remain.  
- Do **not** restore old DBs or swap escrow program IDs as part of this release.

## Post-deploy checks

1. `/api/release` matches intended SHA  
2. Compete → For tokens shows pause; free create still works  
3. Seeker Join free room: after Seed Vault return, no multi-minute “Verify your wallet identity…” trap  
4. No Simulate / fiatSandbox controls on production UI  

## Rollback

Redeploy previous known-good Worker/assets (`f4619a4` or last good SHA). Do not “fix” finance by restoring incompatible schema dumps.

## Single owner request (when ready)

**Please authorize: (1) merge PR #2, (2) deploy the merged tip to soldoku.com, (3) keep funded pause on.** Reply with yes/no per item.
