# External-testing verdicts — 2026-10-09

Agent/internal evidence only. **Not** external-user validation.

| Track | Verdict | Evidence basis |
|-------|---------|----------------|
| **Classic / Practice** | **Ready** for small pilot | Seeker on `d9a182a`: pause/bg/Continue; earlier Practice entry on `f4619a4` |
| **Free competitions** | **Limited ready** | Existing-session join + **fresh message** on `d9a182a` (alt wallet `BTzc…fY9r` / room `D878A8E1`). Full play→LB on prior `f4619a4` |
| **Funded Devnet competitions** | **Blocked** for external players | Pause held; no new physical deposit this phase |
| **Card funding** | **Blocked** (deployed-disabled) | GET unavailable; POST 403; no provider execution |

## Residual risks (owner policy)

- Solver / collusion / multi-device timing games are **not** eliminated by server elapsed-time ranking.
- Message-sign identity ≠ funded deposit safety.
- Invitees must understand TEST has no cash value and funded entry is paused.
- Clearing Soldoku storage can drop local `sudoku.pendingEscrow` bytes; do not treat that as safe.

## Owner gate before invites

Owner may authorize a **3–5** free pilot via `docs/pilot/FREE-COMPETITION-PILOT.md`; do **not** invite until that separate go-ahead.

Deploy of Get-wallet fix `a907d1a`: **not necessary** for that guided cohort (use MWA only); recommended on next authorized release — `GET-WALLET-FIX-REVIEW.md`.

Funded entry remains paused; card execution remains disabled.
