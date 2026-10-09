# Reviewable merge & deployment package (phase 2026-10-09) — closed

## Completed

| Item | Result |
|------|--------|
| Merge PR #2 | Done → `d9a182a` |
| Deploy web to soldoku.com / www | Done — `/api/release` `d9a182a` `dirty:false` |
| Keep funded pause on | Done — `paused:true` + secret revision |
| Card stays disabled | Done — deployed-but-disabled |

## Exact artifacts

- **Merged tip:** `d9a182a90f00487c5a08506f0db3a5987207b9fe`
- **PR:** https://github.com/alicearcadeth/soldoku/pull/2 (MERGED)
- **Worker deploy:** `ecaf2e9f-0996-4a82-b04f-45fefbcad0be`
- **Assessment:** `docs/evidence/2026-10-09-deploy/ASSESSMENT.md`
- **Backup:** `C:\Soldoku-reconstruct\backups\soldoku-main-2026-10-09-d9a182a`

## Remaining (not authorized by deploy prompt)

- Owner Seed Vault message-approve return check on Seeker
- External invites
- Pause lift / funded physical / card enable / Mainnet

## Rollback

Redeploy previous known-good Worker/assets if needed (`f4619a4` or last good SHA). Do not “fix” finance by restoring incompatible schema dumps.
