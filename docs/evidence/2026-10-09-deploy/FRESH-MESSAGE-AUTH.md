# Fresh competition message authorization — status (2026-10-09)

## Baseline

| Item | Value |
|------|--------|
| Live | `d9a182a` `dirty:false` |
| Existing-session join | **Passed** on free room `CA64EA8C` (see `AUTHORIZE-RETURN.md`) |
| Fresh Seed Vault message on live tip | **Unverified** |

A prior Seed Vault message approve → return **did** succeed on hosted **`f4619a4`** (room `61702E42`, artifacts `91-*`, ~`2026-10-09T07:01Z`). That hang-fix source is in the `d9a182a` deploy, but it is **not** a substitute for a fresh-message run against live `d9a182a`.

## Session mechanics (source)

1. Join/create/faucet call `identity()` → if cached session valid for connected wallet, **no** `signPlayMessage`.
2. Otherwise: `/proof` → wallet **message** sign (copy states no transfers) → `/authorize` → store `{ actor, wallet, expires }` in `sudoku.competitionSession`.
3. Server `expires = now + DAY_MS` (24 hours). Client treats session valid if `expires > Date.now() + 5000`.
4. **Disconnect** (`Compete.tsx` / wallet sheet): drops wallet connection, seat/pending for staked only. **Does not** `removeItem("sudoku.competitionSession")`.
5. No in-app “logout competition session” or session-reset control exists. Grep shows a single writer for that key (`Competitions.tsx` after authorize).

## Safe ways to get a fresh message (allowed by policy)

| Option | Safe? | Notes |
|--------|-------|-------|
| Wait for natural expiry | **Yes** | No storage clear; no clock change |
| Owner switches to another Seed Vault account with no competition session | **Yes** | Owner-controlled; then Join a **new** free room (not already joined) |
| App Disconnect | **No** (insufficient) | Leaves competition session intact |
| Clear app/browser/wallet storage / reinstall / change device clock / shorten `DAY_MS` | **Forbidden** this phase | Would force a sign but violates constraints |

**Not building** a new “clear competition session” product feature solely for this test.

## Next natural expiry (estimate)

| Input | Value |
|-------|--------|
| Last observed Seed Vault message authorize (this wallet) | ~`2026-10-09T07:01Z` (`f4619a4` / `91-retry-results.json`) |
| TTL | 24h from authorize |
| Estimated client/server expiry | ~`2026-10-10T07:01Z` (UTC) ≈ **2026-10-10 14:01 ICT** |
| Caveat | Any later successful `/authorize` would extend; the `d9a182a` `CA64EA8C` join reused cache and did **not** call authorize |

After expiry, open a **new** free room (stake 0) where this wallet is not already a participant, or use Join on a room that still offers Join after session miss — then expect Seed Vault **message** (not a deposit tx). Prefer reject-then-approve if practical; keep evidence separate.

## Expiry confirmation (2026-10-09 ~18:18 ICT)

See `EXPIRY-CONFIRMATION.md` + `session-probe.json`.

- Direct `expires` read: **impossible** (non-debuggable APK).
- Behavioural probe: Create room → gate dialog **without** Seed Vault → **session still valid**.
- Estimated expiry remains **2026-10-10 14:01:39 ICT**; ~19.7h remaining at probe time.

## Alt-wallet attempt (2026-10-09 evening)

See `ALT-WALLET-ATTEMPT.md`. Primary disconnected; reconnects returned `E3DQ…` or stalled on `connect.phantom.app`. Fresh message still **unverified**.

## Outcome (updated)

Fresh physical message authorization on `d9a182a`: **passed** — Mode B alt wallet `BTzc…fY9r`, room `D878A8E1`. See `FRESH-MESSAGE-PASSED.md`.
