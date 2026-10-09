# External-testing verdicts — 2026-10-09

Agent/internal evidence only. **Not** external-user validation.

| Track | Verdict | Evidence basis |
|-------|---------|----------------|
| **Classic / Practice** | **Ready** for small pilot | Seeker journeys: nav, pause, notes, undo, practice entry (`docs/evidence/2026-10-09-seeker/`) |
| **Free competitions** | **Limited ready** | Full Join → play → LB on `61702E42` against live `f4619a4`. Hang-after-Seed-Vault fix is on PR #2 **unreleased** — pilot quality improves after authorized merge+deploy |
| **Funded Devnet competitions** | **Blocked** for external players | Pause held; no physical deposit/claim/refund verification this phase (`docs/pilot/FUNDED-DEVNET-TEST-PLAN.md`) |
| **Card funding** | **Blocked** | Disabled production path; live `/api/funding/card` → `Unknown request` |

## Residual risks (owner policy)

- Solver / collusion / multi-device timing games are **not** eliminated by server elapsed-time ranking.  
- Message-sign identity ≠ funded deposit safety.  
- Invitees must understand TEST has no cash value and funded entry is paused.
