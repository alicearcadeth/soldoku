# Free-competition pilot preflight — 2026-10-09

Authorized: guided 3–5 owner-selected testers on live `d9a182a`, guide tip `be453d6`.  
Agent does **not** contact invitees. No deploy. No pause lift. No token moves. No card/Mainnet.

## Verified before start

| Check | Result |
|-------|--------|
| `GET /api/release` | `d9a182a90f00487c5a08506f0db3a5987207b9fe` · `dirty:false` |
| www same tip | yes |
| `GET /api/competitions/config` | `paused:true` · `cluster:devnet` · `enabled:true` |
| Guide tip | `be453d6` (local HEAD matches) |
| Connect path | **MWA only** — ignore Get-wallet on live |
| Card | disabled-production (unchanged) |

## Stop conditions (pause invites / rooms)

- Wallet Get-wallet / download traps recur for multiple testers
- Board progress lost with no Continue recovery
- Incorrect or missing results after a correct finish
- Duplicate seat for same wallet
- Funded/deposit UI on free rooms
- Stuck Verify after approve

## Constraints held

Funded entry paused · card execution disabled · Mainnet off · no agent outreach.
