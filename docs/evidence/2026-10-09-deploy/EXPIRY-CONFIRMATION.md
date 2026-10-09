# Competition session expiry confirmation — 2026-10-09

## Wall clock

| Clock | Value |
|-------|--------|
| Probe time (UTC) | `2026-10-09T11:18:20Z` |
| Probe time (ICT) | **2026-10-09 18:18 +07** |
| Live release | `d9a182a` `dirty:false` |
| Wallet chip | `E3DQ…DpJn` |

## Can we read `expires` directly?

**No.** `com.sudoku.game` is not debuggable (`run-as` refused). No WebView DevTools socket for Soldoku. localStorage cannot be read without clearing storage (forbidden).

## Evidence-based estimate

| Input | Value |
|-------|--------|
| Last observed Seed Vault message authorize | ~`2026-10-09T07:01:39Z` (`91-retry-results.json`, hosted `f4619a4` then) |
| TTL | `DAY_MS` = 24h (`src/competition/store.ts`) |
| Estimated expiry UTC | `2026-10-10T07:01:39Z` |
| Estimated expiry ICT | **2026-10-10 14:01:39 +07** |
| Hours remaining at probe | ~**19.7** |

## Behavioural confirmation (actual)

Script: `scripts/seeker-session-probe.mjs` → artifact `session-probe.json`.

Path: Compete → Create competition → Free → **Create room** → `identity()`.

| Observation | Result |
|-------------|--------|
| Seed Vault / MWA for message | **Not shown** |
| Gate dialog “Quick check before creating” | **Shown** (dump `50-probe-1791544733200.xml`) |
| Verdict | **`sessionLikelyValid: true`** — competition session still present |

Create was cancelled; no room created for this probe.

## Conclusion

| Question | Answer |
|----------|--------|
| Has the session expired? | **No** (confirmed by identity() reuse) |
| Is ~14:01 ICT 10 Oct still the right wait target? | **Yes**, barring a later `/authorize` that would extend it |
| Fresh message test on `d9a182a` now? | **Blocked** until expiry or another owner wallet |
| Fresh message status | Remains **unverified** |

## Owner paths to unblock

1. **Wait** until after **2026-10-10 14:05 ICT**, re-run `node scripts/seeker-session-probe.mjs` until `readyForFreshMessage: true`, then `node scripts/seeker-fresh-message.mjs` (free room, Join → Seed Vault message → return).
2. **Alternate wallet:** In Seed Vault, switch to another owner account with no Soldoku competition session → Connect in Soldoku → Join a new free room (stake 0) → approve **message**.
