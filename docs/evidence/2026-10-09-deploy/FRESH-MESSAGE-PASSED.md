# Fresh physical message authorization — PASSED on `d9a182a`

**2026-10-09 ~19:04 ICT** · Mode B (alternate wallet)

## Identities

| Item | Value |
|------|--------|
| Live release | `d9a182a` `dirty:false` |
| APK | `com.sudoku.game` 0.1.0 |
| Primary (session still valid) | `E3DQ…DpJn` (not used this run) |
| Approving wallet | `BTzc…fY9r` |
| Free room created | `D878A8E1` · stake **0** · medium · 1 day |
| Script | `scripts/seeker-alt-wallet-fresh.mjs` |
| Artifact | `alt-wallet-fresh.json` / `alt-wallet-fresh-run4.log` |

## Results

| Check | Status |
|-------|--------|
| Connect alt wallet via MWA (not Get-wallet) | **Passed** · chip `BTzc…fY9r` |
| Create free room → Seed Vault **message** | **Passed** · `sawNativeMwa` + `sawSeedVault` |
| Cached-session skip | **No** · `cachedSessionSuspected: false` |
| Return without Verify hang | **Passed** · Quick-check gate shown |
| Confirm create → room | **Passed** · `D878A8E1`, Start challenge, participants 1 |
| Persistence after force-stop | **Passed** · Start challenge, Join not offered |

## Verdict

| Question | Answer |
|----------|--------|
| Existing-session physical join (prior) | Passed (`CA64EA8C` / `E3DQ…`) |
| Fresh physical message approve + return on `d9a182a` | **Passed** (this run) |
| Free-competition authorization gap | **Closed** for message path on live tip |

Message only — not a deposit. Funded/card/Mainnet unchanged.
