# Card funding foundations (unreleased, disabled)

See [ADR 0001](adr/0001-card-funding-foundations.md).

## What shipped in source

- Provider-neutral adapter interface with disabled production + local/test adapters (`src/solana/cardFunding.ts`)
- Durable intent/event schema helpers (`src/solana/cardFundingPersist.ts`)
- Worker routes: `GET/POST /api/funding/card` always unavailable; capabilities expose blockers
- Public Compete copy: “Card funding unavailable”
- DEV-only `?fiatSandbox` preview for lane UX (cannot admit a live entrant)

## Intentionally disabled

- No live provider requests, checkout sessions, swaps, or real-money purchases
- No card purchase of Devnet TEST
- No Mainnet competition support
- No public mock-event injection route
- Credentials / `FIAT_FUNDING_MODE=sandbox` do not enable `/api/funding/card`
- CSP is not weakened for a future provider host

## Activation checklist

Listed by `activationRequirements()` and `/api/funding/capabilities` → `cardFundingActivation`.
