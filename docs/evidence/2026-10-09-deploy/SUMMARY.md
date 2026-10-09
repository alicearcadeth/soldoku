# Deploy evidence — 2026-10-09 (PR #2 → Devnet)

Full assessment: [ASSESSMENT.md](./ASSESSMENT.md). Live snapshot: [live-verify.json](./live-verify.json).

## Identities (observed)

| Item | Value |
|------|--------|
| Merge | PR #2 → `d9a182a` (2026-10-09T09:08:34Z) |
| Live release | soldoku.com + www = `d9a182a` `dirty:false` (14 assets) |
| Worker | deploy `ecaf2e9f-…` + pause secret `b7bda8cd-…` |
| APK | `com.sudoku.game` 0.1.0; SHA-256 `bf427627…` |
| Backup (merge tip) | `C:\Soldoku-reconstruct\backups\soldoku-main-2026-10-09-d9a182a` |

## Safety (live)

- Funded entry paused (`paused: true`, Devnet)
- Card **deployed-but-disabled** (GET unavailable; POST 403)
- CSP present; Mainnet off

## `pm clear` (deviation)

Command attempted: `pm clear --cache-only com.sudoku.game` (Soldoku only). Hung with no output; process killed. **Outcome unknown.** Wallet packages not targeted. See ASSESSMENT §2. Do not repeat.

## Seeker results (corrected)

| Artifact | Status | Classification |
|----------|--------|----------------|
| Interrupted verify + `pm clear` (778856) | **inconclusive** | Not a pass |
| free-compete / room `61702E42` | passed | Physical, `d9a182a` hosted |
| wallet-cancel (MWA BACK / Close) | passed | Physical |
| join-cancel (in-app Connect Close) | passed | Physical; **not** Seed Vault message cancel |
| funded-pause-ui | passed | **Browser-only** |
| Classic pause / bg / Continue | passed | Physical `d9a182a` |
| existing-session join → Start (`CA64EA8C`) | passed | 3→4; no Verify hang; AUTHORIZE-RETURN.md |
| fresh Seed Vault message on `d9a182a` | **passed** | alt wallet `BTzc…fY9r` → room `D878A8E1`; FRESH-MESSAGE-PASSED.md |

Pre-deploy full Join→play→LB on `61702E42` remains under `docs/evidence/2026-10-09-seeker/` against hosted **`f4619a4`**.
