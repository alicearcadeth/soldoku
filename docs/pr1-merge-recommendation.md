# PR #1 merge recommendation

**Verdict: ready with explicitly accepted limitations — recommend merge; do not deploy.**

Reviewed PR head: `2b4dabe09ee25a412d31665fda5e4ee7224973e1` (browser-runner fix `7ad88ae`)  
Design/behavior review baseline: `1f4fe5668664f2ccc15ec97509a8d7d42f043d1a`  
Card foundations parent: `3d4a12a1b47d9a9788776eaef22c4c4de4d0353c`  
Deployed release (unchanged): `f4619a4d194ca03eef84df04080df38c7d6bad25`  
Base: `main` @ `ee6e0d0`.

CI: no status checks (`statusCheckRollup: []`). No `.github` workflows that deploy. Wrangler deploy is manual (`npx wrangler deploy --config wrangler.soldoku.jsonc`). **Merge does not deploy and does not activate payments.**

## Design / behavior (reviewed)

- Payment, delivery, and escrow lanes stay distinct; `admitsCompetitionEntrant` requires escrow `entry-finalized` plus match-funded fiat — provider completion alone never admits.
- `/api/funding/card` prepares D1 tables (`persistenceReady`) but POST stays 403; credentials / `FIAT_FUNDING_MODE` cannot enable external execution.
- Local-test adapter is gated; production UI excludes simulation; DEV `?fiatSandbox` preview only.
- Idempotent checkout keys, event dedupe, quote expiry → refund-review, late/short/failed delivery, refund-vs-card-reversal copy covered in unit + browser fixtures.
- Competition pause, settlement recovery, claims, and refunds remain on the verified path through `f4619a4`.

## Browser runner

Original Chrome evidence kept under `docs/evidence/2026-10-09-card-funding-browser/` (`results.json` passed; see `EXIT-CODE.md`).  
Clean rerun (exit **0**): `docs/evidence/2026-10-09-card-funding-browser-rerun/`.  
Proves simulated/disabled UI only — not real payments or Seeker/hardware wallets.

## Residual limitations (accepted)

- Provider approval, webhooks, CSP allowlists, and real-value authorization remain external.
- D1 intent writes do not occur while disabled (schema prepare only).
- Physical Seeker checklist unverified (`docs/seeker-validation-checklist.md`).
- Funded entry remains paused on the deployed Worker.

## Keep unreleased

Do **not** deploy card-foundation Worker/UI changes without separate authorization. Keep `SUDOKU_COMPETITION_PAUSED` until an explicit reopen.
