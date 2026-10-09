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
| Message proof / authorize | failed/stuck | After return, UI stayed on “Verify your wallet identity…” with Join disabled (`walletCall` sheet flag) |
| Wallet sheet Close/cancel | passed (earlier) | Home wallet chip → Close |
| Account switch | not tested | |
| Lock → PIN unlock | needs-owner | Secure keyguard; automation must not enter PIN |
| Funded Devnet deposit | not tested | Pause held; no unpause requested |
| Funded room read-only | blocked this re-run | Lock; prior API evidence for BFF6D992 separate |
| Offline / reconnect | partial | Wifi toggle; cached home |
| Pause banner (unreleased) | source fixed | PR #2; not on phone until deploy |

\* Deployed create still fails server-side when paused; UI notice is PR #2 only.

## Card foundations

Public `/api/funding/card` → `Unknown request` on live Worker. No production provider requests from device journey.

## Authorize hang (observed)

Joining free room `61702E42` opened Solana Mobile Wallet / Seed Vault. After return to Soldoku, status remained **Verify your wallet identity…** and **Join room** stayed `enabled=false` until force-stop. Root cause: `walletCall` treated the MWA sheet as still covering when Seeker did not deliver `focus` after Seed Vault; `sheetCapMs` is 10 minutes. Fix on product branch: clear sheet flag on `pageshow` / `visibilitychange` visible + clearer timeout copy (unreleased — phone still loads `f4619a4`).
