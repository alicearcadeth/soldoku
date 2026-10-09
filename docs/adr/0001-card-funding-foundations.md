# ADR 0001: Disabled card-funding foundations for competition admission

## Status

Accepted for local/private implementation. External execution remains disabled. Not authorized for deployment.

## Context

Soldoku competition admission today requires a wallet-signed Devnet TEST escrow deposit. Future card funding must deliver a supported Solana asset to a bound wallet, then require a separate escrow approval. Artportal (commit `7166c1535192d3d255aad611eddc81cb28a8daf3`) separates card/certificate checkout from Solana escrow and never treats browser return or provider payment as escrow funding.

Crossmint NFT/certificate checkout is not interchangeable with fungible on-ramping. Soldoku must not import mint, shipping, seller settlement, or certificate delivery logic.

Inspected Artportal sources:

- https://github.com/alicearcadeth/artportal/blob/7166c1535192d3d255aad611eddc81cb28a8daf3/lib/collector-checkout.ts
- https://github.com/alicearcadeth/artportal/blob/7166c1535192d3d255aad611eddc81cb28a8daf3/lib/collector-checkout-store.ts
- https://github.com/alicearcadeth/artportal/blob/7166c1535192d3d255aad611eddc81cb28a8daf3/lib/payment-checkout.ts
- https://github.com/alicearcadeth/artportal/blob/7166c1535192d3d255aad611eddc81cb28a8daf3/lib/payment-server.ts
- https://github.com/alicearcadeth/artportal/blob/7166c1535192d3d255aad611eddc81cb28a8daf3/app/api/moonpay/webhook/route.ts

## Decision

1. Keep one funding state family under `src/solana/fiatFunding.ts` / `cardFunding.ts`. Do not add a second competing admission machine.
2. Distinguish payment, asset delivery, and competition escrow as separate lanes. A provider callback cannot mark a competition funded.
3. Persist intents server-side with conflict-safe uniqueness on idempotency keys and processed event ids. localStorage is preview-only.
4. Expose a provider-neutral adapter with capabilities, checkout create/status, verified event normalization, delivery observations, and environment identity.
5. Ship a disabled production adapter and a deterministic local/test adapter. Credentials alone never enable external execution.
6. Public UX may say “Card funding unavailable.” Simulated success stays in development tooling and cannot admit a real entrant.
7. Activation later requires suitable provider approval, credentials, network/asset compatibility, secure webhooks, wallet signing, fee/gas handling, ops support, and separate real-value authorization.

## Distinctions (do not conflate)

| Path | Role in Soldoku |
|------|-----------------|
| Direct merchant card collection | Out of scope until a merchant processor is approved |
| Provider-hosted crypto purchase | Candidate on-ramp lane (disabled) |
| Provider-managed wallet delivery | Observed delivery, not admission |
| NFT checkout | Not used |
| Swaps | Existing DFlow path remains separate and non-wagering |
| Escrow deposit | Existing competition deposit; only finalized escrow admits |

## Consequences

- External payment access missing is an expected boundary, not a blocker for foundations.
- Deployed Devnet competition behavior stays on the verified release until this work is separately authorized for deploy.
- Seeker physical validation remains deferred and named on the backlog.
