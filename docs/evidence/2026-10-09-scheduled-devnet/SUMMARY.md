# Scheduled Devnet round on deployed `f4619a4`

## Fresh on this release

| Case | Room | Result |
|------|------|--------|
| Controlled 2-wallet scheduled cron settlement + claim | `821DB68C` | Pass — see `results.json` |
| Controlled solo refund while pause restored after deposit | see `../2026-10-09-scheduled-refund/results.json` | Pass |

Winner cron settlement signature (finalized, retained on later cron poll):
`hHQo97tifZYpUJWZ9X6cDoFnLStWUCK3d1BukGZhA24ysaQEc7FBaCPt12H8NbQynxKksvuSNa2wfhUj2YVmMcE`

Funding pause restored after deposits and again at end. No outstanding TEST obligations from these rooms (vault empty / refund conserved).

## Existing evidence (not re-run here)

| Case | Source |
|------|--------|
| Interrupted settlement signature retained / closed-room receipt repair | Room `2B4FB023` on this deploy; unit coverage in `settlement.test.ts` |
| Missing-ATA recovery / parked-token return | `docs/evidence/2026-10-08-devnet/results.json` |
| Three-wallet production browser round | `docs/evidence/competition-production-devnet.json` |

Interrupted-request recovery was not re-executed as a separate live fault injection on this round; cron unknown→confirmed retention was freshly verified via the later poll on `821DB68C`.
