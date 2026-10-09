# Release assessment — 2026-10-09 verification close-out

Observed facts vs assumptions are labeled. No Mainnet, no pause lift, no card enablement, no external invite.

## 1. Release identity (observed)

| Layer | Value |
|-------|--------|
| Local branch | `main` @ `d9a182a90f00487c5a08506f0db3a5987207b9fe` tracking `github/main` |
| Working tree (pre-this-commit) | Dirty only with untracked post-deploy evidence/scripts |
| PR #2 | **MERGED** 2026-10-09T09:08:34Z → merge commit `d9a182a` ([PR](https://github.com/alicearcadeth/soldoku/pull/2)) |
| GitHub remote `main` | `d9a182a` (private `alicearcadeth/soldoku`) |
| `origin` (F: mirror) | Still older tip `ee6e0d0` — **not** the deploy remote |
| soldoku.com `/api/release` | `commit=d9a182a…`, `dirty=false`, 14 assets |
| www.soldoku.com `/api/release` | Identical to soldoku.com |
| Worker deploy | `ecaf2e9f-0996-4a82-b04f-45fefbcad0be` (2026-10-09T09:10:05Z) |
| Pause secret revision | `b7bda8cd-da56-43b8-b373-1c849226e3a3` (`SUDOKU_COMPETITION_PAUSED=1`) |
| Seeker APK | `com.sudoku.game` `0.1.0` / `1`; device pull SHA-256 `bf4276273dc43f1609c464171180676dbf0f933c3da79f767eede8fb352a200c` (matches recovery clock-in APK) |
| Wallet packages (untouched) | Seed Vault `com.solanamobile.seedvault` / related; Solana Mobile Wallet `com.solanamobile.wallet` 1.6.0 — **not** targeted by clear |
| Hosted JS includes wallet-return fix | **Yes** — live `index-XrdphQ2Q.js` contains `pageshow` / `hasFocus` handling; source tip `walletCall.ts` matches |
| Funding pause | `paused: true`, `cluster: devnet` |
| Card | GET `available:false` `externalExecution:false`; POST **403** disabled adapter |
| Mainnet | Off (`/api/chain` → `devnet`) |

Assumption rejected: a script named `postdeploy` does not prove deploy. Deploy is proven by `/api/release` + wrangler deployment list matching `d9a182a`.

## 2. `pm clear` deviation (observed)

| Field | Evidence |
|-------|----------|
| Exact command | `adb -s SM02E4072803429 shell pm clear --cache-only com.sudoku.game` then `node scripts/seeker-postdeploy-verify.mjs` |
| Terminal | `terminals/778856.txt` — **no stdout**; process hung ~5 min; killed (`exit_code` 4294967295) |
| Package targeted | **`com.sudoku.game` only** |
| Seed Vault / wallet cleared? | **No evidence of any wallet package clear.** Commands never named Seed Vault / MWA packages. |
| Succeeded? | **Unknown.** No `Success`/error line captured; command may have blocked before completing. |
| Flag | `--cache-only` (cache directories), not a full `pm clear` of app data — but outcome still unverified |
| Policy | Earlier testing instructions prohibited clearing application/wallet data. This was a **deviation**. |
| Lost state | **Not proven.** Cannot claim “nothing lost” without before/after inventory. Possible cache loss for Soldoku WebView if the command finished; unknown whether it finished. Wallet keys: no evidence of wipe. Pending signed escrow bytes in WebView `localStorage` (`sudoku.pendingEscrow`): unknown if present beforehand; if only in Soldoku storage and cleared, local recovery copy could be gone (server/on-chain discovery still apply — see §6). |

**Do not run `pm clear` again.**

## 3. Corrected test history

### Interrupted run (inconclusive)

`seeker-postdeploy-verify.mjs` chained after `pm clear --cache-only` (shell 778856): **interrupted / inconclusive**. No phase results from that process. Does **not** become a pass because later runs succeeded.

### Later runs (separate evidence)

| Run | Release identity | Kind | Result |
|-----|------------------|------|--------|
| `seeker-postdeploy-verify.mjs` retry (no clear) ~09:16Z | Live `d9a182a` (assumed via hosted URL; `/api/release` was already `d9a182a`) | Fresh session after force-stop; WebView may be cold | free-compete / room detail **passed**; cold-home **partial** (empty dump); wallet-cancel **blocked** that pass |
| `seeker-postdeploy-wallet-pause.mjs` | same | Physical Seeker | cold-home **passed**; wallet-cancel **passed** (in-app MWA/Close → MainActivity) |
| Browser For-tokens | same | Browser-only | funded-pause-ui **passed** |
| `seeker-postdeploy-join-cancel.mjs` | same | Physical Seeker | join → **in-app Connect Close** → room; **not** Seed Vault message-sign cancel. Status **passed** for that narrower path |
| Pre-deploy `docs/evidence/2026-10-09-seeker/*` | Hosted **`f4619a4`** | Physical | Full Join→Seed Vault→play→LB on `61702E42`; hang observed then workaround; **not** proof of `d9a182a` approve-return |
| `seeker-lifecycle-preserve` / `seeker-classic-preserve` / continue-check | Live `d9a182a` | Physical, no clear | Wallet native-MWA BACK cancel **passed**; free room identity + prior LB **passed**; Classic pause/bg **passed**; Continue game on home **passed**; force-stop restores room route **passed** |

**Correction to prior SUMMARY wording:** “join-cancel-return passed” meant in-app Connect dismissal, **not** competition message authorization cancel through Seed Vault. “Cancel path already verified above” in free-join-handoff was inaccurate for the first verify retry (wallet-cancel was blocked there); later wallet-pause run established cancel.

## 4. Physical wallet-return on deployed fix

| Scenario | On `d9a182a` | Evidence |
|----------|--------------|----------|
| Connect → MWA → BACK → usable Soldoku | **Passed** | `lifecycle-preserve.json` `wallet-cancel-return` path `native-mwa`; also postdeploy wallet-pause |
| Join → in-app Connect Close → room (no hang) | **Passed** | `seeker-postdeploy.json` join-cancel-return |
| Competition join → Start challenge without Verify hang | **Passed** (`CA64EA8C`, 3→4) | See `AUTHORIZE-RETURN.md`. Connect used MWA; join reused day-long competition session (no fresh Seed Vault message sheet observed). |
| Fresh Seed Vault message-sign on Join | **Not re-observed** | Would need session clear/expiry (not authorized this phase) |
| Duplicate join after success | **Passed** | Join not offered; Start challenge only |

## 5. State-preserving lifecycle (`d9a182a`)

| Check | Result |
|-------|--------|
| Force-stop → relaunch restores competition room WebView | Passed (`classic-preserve.json`) |
| Classic Easy → Pause sheet → HOME bg → return | Passed (paused UI retained) |
| Continue game after Classic session | Passed (`classic-continue-check.json`) |
| Free room `61702E42` identity + prior LB (`0:25.7` / `7:50.6`) | Passed |
| Full free-room **re**-complete + duplicate finish guard on `d9a182a` | **Not re-run** — already completed once under `f4619a4` for wallet `E3DQ…`; re-complete would need another wallet or new free room. No new funded tx. |

## 6. Financial recovery (no funds moved)

Pending escrow lives in client storage key `sudoku.pendingEscrow` (`src/competition/pendingTx.ts`). Clearing Soldoku app/cache **could** remove the only **local** copy of signed serialized bytes; it does **not** erase chain state or Worker/D1 room records.

| Case | Coverage |
|------|----------|
| Lost response / keep signed identity / block second approval | Unit: `pendingTx.test.ts` **passed** |
| Storage write failure | Unit **passed** |
| Unknown/timeout not described as failed | Unit **passed** |
| Settlement resend / pending / unknown / duplicate promote | Unit: `settlement.test.ts` **passed** (38 tests with pendingTx+walletCall suite) |
| Physical funded deposit recovery after clear | **Untested** (pause held; no new deposit) |
| Production guarantee if local pending wiped | **Not claimed** — recovery relies on server room state + on-chain observation + user not double-approving |

Existing funded rooms still listed via `/api/competitions` (e.g. `BFF6D992` refunding, `821DB68C` paid). Claims/refunds paths remain available while create/deposit paused.

## 7. Release boundaries (live)

- Pause **on**; card **deployed-but-disabled** (foundations in Worker; execution refused)
- CSP: `script-src 'self'; frame-ancestors 'none'`
- Intended tip = PR #2 merge `d9a182a` (walletCall fix, pause UX, Join/Start copy, evidence)

## 8. Changes in this close-out

- Evidence corrections + assessment docs/scripts under `docs/evidence/2026-10-09-deploy/`
- Seeker helper scripts (no product runtime change required; no defect fix beyond documentation honesty)
- Status docs updated to merged/deployed identity
- Authorize-return physical pass on free room `CA64EA8C` (`AUTHORIZE-RETURN.md`, `authorize-return.json`, `40-*` / `30-*` screenshots)
- Tests run: `pendingTx`, `settlement`, `walletCall` — 38 passed (earlier close-out)
- Prior evidence pushes: `3e8504f`, `e79f6ee` on private `github/main` (docs only; live Worker remains `d9a182a`)
- Authorize evidence push: `b406ab6` on private `github/main` (docs/scripts only; live Worker remains `d9a182a`)
- Backup: `C:\Soldoku-reconstruct\backups\soldoku-main-2026-10-09-b406ab6` (+ `soldoku-b406ab6.bundle`)

## 9. Verdicts

| Surface | Verdict |
|---------|---------|
| Classic / Practice | **Ready** on deployed shell+`d9a182a` (pause/bg/Continue observed; Practice not re-exercised this close-out — prior Seeker evidence) |
| Free competition | **Limited ready** — join registration + Start state on `d9a182a` for `CA64EA8C` passed; fresh Seed Vault message path optional retest (session reuse) |
| Funded Devnet | **Paused / hold** — create/deposit paused; historical rooms readable; no new physical funded tx |
| Card funding | **Deployed-disabled** — not unreleased; execution blocked |

## Owner actions still needed

1. Optional: after competition session expiry (or a future authorized single-key clear of `sudoku.competitionSession` only), re-run Join → Seed Vault **message** to close the last instrumentation gap.
2. Authorize any external free pilot separately — do not invite under this phase.
3. Do **not** clear app/wallet data; do not lift pause / enable card / Mainnet.
