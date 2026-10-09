# Physical Seeker product test — 2026-10-09

**Web environment under test:** installed APK loads `https://soldoku.com/` = deployed **`f4619a4`** (not unreleased `main` / PR #2 UI).  
**Device:** Seeker, Android 16 (serial redacted).  
**APK identity:** see `APK-IDENTITY.md` — device pull and recovery copy both SHA-256 `bf4276273dc43f1609c464171180676dbf0f933c3da79f767eede8fb352a200c`.  
**Ignored local copy (not committed):** `submission/soldoku-clockin.apk` (gitignored `*.apk`; copied from recovery for tooling only).  
**Wallets present:** Seed Vault impl `1.1.1`, Solana Mobile Wallet (MWA host).

This is agent-observed internal product testing. Not external usability validation.

## Scenario matrix

| Scenario | Status | Notes |
|----------|--------|-------|
| Hosted `/api/release` = f4619a4 | passed | Reconfirmed 2026-10-09 |
| Cold launch / relaunch | passed | Restores Classic Continue; Home reachable (earlier pass) |
| Home navigation | passed | Brand, mode cards, DEVNET pill |
| Android Back | passed | Practice → home; pause sheet dismiss |
| Settings | passed | Reachable from home/header |
| Classic gameplay controls | passed | Pause, Notes, Undo, keypad |
| Classic digit / notes / undo | passed (earlier) / blocked (later) | Later automation hit secure lock screen |
| Pause / timer / bg-fg | passed | Pause sheet; launcher Home → return |
| Process recreate | passed | `am kill` → pause/continue restore |
| Practice entry | passed | FREE RACE UI |
| Compete browse / room cards | passed | Active free rooms; View/Join |
| Free room detail | passed (browse) / blocked (re-run) | Re-run stopped on lock screen before View room |
| Create → For tokens (deployed) | passed* | No unreleased card-unavailable copy (expected on f4619a4) |
| Card simulation absent | passed | No Simulate controls |
| Wallet discovery (MWA) | passed | Detected · connect |
| MWA handoff | passed | `MWABottomSheetActivity` from Soldoku |
| Connection result | passed | Truncated wallet on home |
| Free room detail `61702E42` | passed | View room → Weekend Sprint, Back to Rooms, share/copy |
| Join → MWA / Seed Vault | passed handoff | `MWABottomSheetActivity` → `seedvaultimpl` authorize |
| Message proof / authorize | passed (retry) | After force-stop + owner passcode: Join → Seed Vault → return shows **Start challenge**; participants 3→4 (`91-*`) |
| Wallet sheet Close/cancel | passed | Home `E3DQ…DpJn` → Connect wallet sheet → **Close** → home (`91-sheet` / `91-closed`) |
| Start challenge + moves | passed | Room `61702E42`; entered 3 cells then continued (`92c-*`) |
| Bg / reopen recovery | passed | HOME → relaunch; probe digits 7/4/8 still on board; timer continued |
| Complete + leaderboard | passed | Finished **7:50.6 · rank 2**; LB shows `E3DQ…DpJn · You` under `FTwf…xAVt` 0:25.7 |
| Reject new wallet/sign + return | passed | Connect sheet Close; MWA connect → BACK cancel sheet → Soldoku home (`92d-*`, `92e-*`) |
| Account switch | not tested | |
| Lock → PIN unlock | needs-owner | Secure keyguard; automation must not enter PIN |
| Funded Devnet deposit | not tested | Pause held; no unpause requested |
| Funded room read-only | blocked this re-run | Lock; prior API evidence for BFF6D992 separate |
| Offline / reconnect | partial | Wifi toggle; cached home |
| Pause banner (unreleased) | source fixed | PR #2; not on phone until deploy |

\* Deployed create still fails server-side when paused; UI notice is PR #2 only.

## Card foundations

Public `/api/funding/card` → `Unknown request` on live Worker. No production provider requests from device journey.

## Authorize hang (observed) + retry

**Earlier (stuck):** Joining free room `61702E42` opened Solana Mobile Wallet / Seed Vault. After return to Soldoku, status remained **Verify your wallet identity…** and **Join room** stayed `enabled=false` until force-stop. Root cause: `walletCall` treated the MWA sheet as still covering when Seeker did not deliver `focus` after Seed Vault; `sheetCapMs` is 10 minutes. Fix on product branch: clear sheet flag on `pageshow` / `visibilitychange` visible + clearer timeout copy (unreleased — phone still loads `f4619a4`).

**Retry after owner force-stop (passed):** Cold rejoin (`seeker-rejoin-sign.mjs`) → room detail → **Join room** → MWA sheet → Seed Vault passcode UI → return to Soldoku with **Start challenge** (Join gone), participants **4 · open entry**. Then home wallet chip → sheet **Close**. Artifacts: `90-*`, `91-*`, `91-retry-results.json`.

## Challenge play (61702E42) — same session

Feedback loop: `scripts/seeker-challenge-start.mjs` + `scripts/seeker-challenge-play.mjs` (board parsed from narrow digit UI nodes; pad = wide `1`–`9` buttons). Results: `92-challenge-results.json`.

| Phase | Status |
|-------|--------|
| Start challenge | passed (session cached; no new sign) |
| Enter moves | passed (3 cells) |
| Background / reopen | passed |
| Complete puzzle | passed — **7:50.6 · rank 2** |
| Leaderboard | passed — You `#2 E3DQ…DpJn` |
| Reject wallet request | passed — MWA sheet BACK / Connect Close → home |

Phone left **disconnected** after reject tests (Connect wallet on home). No deposit / funded path.
