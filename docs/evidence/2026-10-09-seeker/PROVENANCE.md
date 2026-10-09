# Evidence provenance — 2026-10-09 Seeker

**Device:** Solana Seeker (serial redacted in prose; scripts may use `SEEKER_SERIAL`).  
**Web under test:** APK loads `https://soldoku.com/` = deployed **`f4619a4`**.  
**APK:** `com.sudoku.game` 0.1.0 / SHA-256 in `APK-IDENTITY.md`.  
**Nature:** Agent-observed internal product testing with ADB/uiautomator scripts. **Not** external-user validation.

## Classification

| Kind | What it means here | Examples |
|------|--------------------|---------|
| Physical observation | Device UI / activity focus / screenshots from the Seeker | `91-after-return`, `92c-complete`, `92c-leaderboard`, Seed Vault passcode UI |
| Scripted input | Automated taps/swipes/text via `adb shell input` | `scripts/seeker-*.mjs` driving Compete → Join → Start |
| Owner HITL | PIN / biometric / Approve / Deny that automation must not forge | Seed Vault passcode during Join; any Approve |
| Mock / unit tests | Vitest / local Worker fixtures — not this folder | `src/**/*.test.ts` |
| On-chain transactions | Broadcast Devnet txs (deposit/claim/refund) | **None in this folder** — funded entry paused; free room only |
| Untested | Explicit gaps | Funded deposit/claim/refund on device; Mainnet; card payments; account switch mid-game |

## Session outcomes (free room `61702E42`)

| Observation | Source |
|-------------|--------|
| Message proof Join → Start challenge | Physical + owner passcode (`90-*`, `91-*`) |
| Complete **7:50.6 · rank 2** | Physical + scripted moves (`92-challenge-results.json`, `92c-complete`) |
| Bg/fg recovery of board digits | Physical + scripted HOME/relaunch |
| Wallet connect reject / MWA BACK | Physical + scripted (`92d-*`, `92e-*`) |

Intermediate per-cell fill dumps were discarded after scoring; outcomes remain in JSON + key screenshots.

## Redaction

- No session tokens, authorization signatures, or Seed Vault secrets are stored.
- Full wallet addresses may appear in public competition leaderboard API responses mirrored in UI text; truncated forms (`E3DQ…DpJn`) are preferred in prose.
- Device serial is not written into SUMMARY/PROVENANCE.
