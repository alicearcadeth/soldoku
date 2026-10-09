# PR #1 merge recommendation

**Verdict: ready with stated limitations — recommend merge; do not auto-deploy.**

Base: `main` @ `ee6e0d0`. CI: no status checks configured (`statusCheckRollup: []`). Wrangler deploy is manual (`npx wrangler deploy`); merge does **not** deploy.

Record the **current PR head** after the review follow-up commit lands (see git / GitHub). Parent foundation commit: `3d4a12a1b47d9a9788776eaef22c4c4de4d0353c`.

## Why acceptable

- Settlement recovery commits through `f4619a4` are the verified deployed Devnet path; card foundations on top are disabled by construction.
- Payment / delivery / escrow lanes stay distinct; provider events cannot finalize entry; public `/api/funding/card` stays 403 for POST; credentials do not enable execution.
- Competition pause, claims, and refunds remain available; fresh Devnet cron + refund evidence recorded.
- Browser production build shows “Card funding unavailable” without simulation controls; DEV `?fiatSandbox` preview only.

## Residual risks / future gates

- Provider approval, webhooks, hosted UI/CSP allowlists, and real-value authorization remain external.
- D1 intent tables are prepared on the card route but no live checkout writes occur while disabled.
- Physical Seeker path unverified (see `seeker-validation-checklist.md`).
- `processedEventIds` is bounded; durable dedupe is `(provider, event_id)` uniqueness when activated.

## Keep unreleased

Do **not** deploy card-foundation Worker/UI changes without separate authorization. Deployed release remains `f4619a4` until an explicit deploy.
