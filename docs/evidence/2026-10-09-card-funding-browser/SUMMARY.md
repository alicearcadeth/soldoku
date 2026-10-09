# Card-funding browser validation

- Browser: Google Chrome via Playwright `channel: "chrome"` (`C:\Program Files\Google\Chrome\Application\chrome.exe`)
- Production preview: `vite preview` on `127.0.0.1:4179` after `npm run build`
- DEV preview: `vite` on `127.0.0.1:5188/?fiatSandbox=1`
- Viewport: 390×844
- Payment-provider network requests observed: **none**

## Scenarios

1. **production-unavailable** — Compete → Create → For tokens shows “Card funding unavailable”; no Card funding preview region; no Simulate controls.
2. **dev-preview-lanes** — Preview controls exercise pending/unknown, provider success, browser return, decline, cancel, delivery failed/short/late, refund-review, asset received, separate deposit approval / entry-finalized preview; reload recovers lanes; Browse rooms navigation works.

Screenshots: `prod-unavailable.png`, `dev-preparing.png`, `dev-lanes.png`, `dev-reload.png`.
