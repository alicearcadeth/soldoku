# Card-funding browser validation (clean rerun)

Proves **simulated / disabled UI behavior only** — not real payments, provider sessions, or physical-wallet operation.

- Browser: Google Chrome via Playwright `channel: "chrome"`
- Runner: repaired `scripts/card-funding-browser.mjs` (`CARD_FUNDING_BROWSER_OUT` → this directory)
- Production: `vite preview` `127.0.0.1:4179` after `npm run build`
- DEV: `vite` `127.0.0.1:5188/?fiatSandbox=1`
- Viewport: 390×844
- Process exit: **0** (`LASTEXITCODE=0`)
- Payment-provider network requests: **none**

Original first-pass evidence remains under `docs/evidence/2026-10-09-card-funding-browser/` (including `EXIT-CODE.md`).

## Scenarios

1. **production-unavailable** — unavailable copy; no preview/simulate controls.
2. **dev-preview-lanes** — pending/unknown, provider success, return, decline, cancel, delivery failed/short/late, refund-review, asset received, separate escrow preview, reload recovery, Browse rooms.
