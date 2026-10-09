# Physical Seeker product test — 2026-10-09

**Web environment under test:** installed APK loads `https://soldoku.com/` = deployed **`f4619a4`** (not unreleased `main` card UI).  
**Device:** Seeker, Android 16 (serial redacted).  
**APK:** `com.sudoku.game` `0.1.0` / `versionCode` 1. Pulled base.apk SHA-256 `bf4276273dc43f1609c464171180676dbf0f933c3da79f767eede8fb352a200c` (matches release record).  
**Wallets present:** Seed Vault impl `1.1.1`, Solana Mobile Wallet (MWA host).

This is agent-observed internal product testing. Not external usability validation.

## Scenario matrix

| Scenario | Status | Notes |
|----------|--------|-------|
| Cold launch / relaunch | passed | Restores in-progress Classic (“Continue game”); Home reachable |
| Home navigation | passed | Brand, mode cards, DEVNET pill |
| Android Back | passed | Practice → home; pause sheet dismiss |
| Settings | passed | Reachable from home/header |
| Classic gameplay controls | passed | Pause, Notes, Undo, keypad visible |
| Pause / timer / bg-fg | passed | Pause sheet; launcher Home → return recovers |
| Practice entry | passed | FREE RACE / create-join UI |
| Compete browse / room cards | passed | Active free rooms listed; View/Join |
| Create → For tokens (deployed) | passed* | Form shown; **no** unreleased “Card funding unavailable” (expected on f4619a4) |
| Card simulation absent | passed | No Simulate controls on device |
| Wallet discovery (MWA) | passed | “Mobile Wallet Adapter · Detected · connect” |
| MWA handoff | passed | `com.solanamobile.wallet/.MWABottomSheetActivity` launched from Soldoku |
| Connection result | passed | Home shows truncated wallet `E3DQ…DpJn` after handoff |
| Message proof / authorize | needs-owner | Competition session sign not completed in this pass |
| Cancel / reject connect | not tested | Connection succeeded before cancel path exercised |
| Account switch | not tested | Single account on device this session |
| Funded Devnet deposit | not tested | Pause kept; no new unpause window requested |
| Settlement / claim / refund on device | not tested | Prior API/cron evidence remains separate |
| Offline / reconnect | partial | Wifi toggle; home still rendered (SW/cache) |
| Process recreate (Classic pause) | passed | After `am kill`, relaunch restores pause sheet / Continue state |
| Free room detail deep-link | blocked this pass | Cold restore opened Classic pause before Compete navigation completed |
| Unreleased pause banner UX | fixed in source | Config lacked `paused`; see product PR (not on phone until deploy) |

\* Deployed product does not yet expose pause in `/api/competitions/config`; create still fails server-side when paused.

## Card foundations

Public `/api/funding/card` → `Unknown request` on live Worker. Capabilities show fiat providers `configured: false`. No production provider requests from device journey.
