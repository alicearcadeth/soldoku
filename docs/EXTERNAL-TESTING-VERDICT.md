# External-testing verdicts — 2026-10-09

Agent/internal evidence only. **Not** external-user validation.

| Track | Verdict | Evidence basis |
|-------|---------|----------------|
| **Classic / Practice** | **Ready** for small pilot | Seeker on `d9a182a`: pause/bg/Continue; earlier Practice entry on `f4619a4` |
| **Free competitions** | **Limited ready** | Browse/LB + wallet cancel on `d9a182a`. Full Join→play→LB proven on prior `f4619a4`. Message-approve return on `d9a182a` still needs owner |
| **Funded Devnet competitions** | **Blocked** for external players | Pause held; no new physical deposit this phase |
| **Card funding** | **Blocked** (deployed-disabled) | GET unavailable; POST 403; no provider execution |

## Residual risks (owner policy)

- Solver / collusion / multi-device timing games are **not** eliminated by server elapsed-time ranking.
- Message-sign identity ≠ funded deposit safety.
- Invitees must understand TEST has no cash value and funded entry is paused.
- Clearing Soldoku storage can drop local `sudoku.pendingEscrow` bytes; do not treat that as safe.

## Owner gate before invites

Do **not** invite external players until the owner closes the `d9a182a` message-approve return check (or explicitly accepts that residual).
