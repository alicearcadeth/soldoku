# New laptop check — 2 October 2026

Project extracted from `sudoku-release-clock-in-final.zip`. The original ZIP is unchanged. The extracted folder has no Git history; it is a ZIP download, not a Git clone.

## Verified

- Node 24.16.0 and npm 11.13.0 are available. Dependencies installed using `npm.cmd ci` and the existing lockfile.
- `npm.cmd run build` passed TypeScript checking and the production web build.
- `npm.cmd test`: 193 passed, 4 skipped across 45 files. Skipped tests require local blockchain or live DFlow/MoonPay services.
- Browser verification: home page renders, controls render, no reported browser errors; screenshot is `local-home.png`.
- `scripts/player-feedback-check.mjs`: all 24 checks passed, including music, settings, pause, notes, replacement confirmation, practice and deposit-pause UI, and widths from 320 to 1280 pixels.
- `node scripts/laptop-check.mjs`: Classic completion and reload on desktop and phone; private Practice pairing, keyboard move persistence, third-player rejection; Quick Match; no uncaught browser errors. All passed. Results and screenshots are in `output/laptop-check/`.
- `npm.cmd start` starts the built app on port 4173 on Windows.
- Android `gradlew.bat assembleDebug` passed using installed JDK 21. Gradle installed required Android SDK Platform 37.0 using the SDK's existing accepted license. Debug APK: `android/app/build/outputs/apk/debug/app-debug.apk`. This is not the official signed release APK.
- Android `gradlew.bat lintDebug` passed with 0 errors and 8 warnings about dependency versions, unused resources, and resource shrinking. Report: `android/app/build/reports/lint-results-debug.html`.

## Changes for this laptop

- Removed Unix shell parameter syntax from `npm start`. Vite's existing config already reads `PORT` and defaults to 4173.
- Added optional `PLAYWRIGHT_CHROMIUM` executable path support to the player-feedback and older player-qa browser scripts, which otherwise assume Chrome is installed.
- Installed Playwright Chromium for local checks.
- Added `scripts/laptop-check.mjs` for the current release's core gameplay flows.
- Added `start-local.cmd` as a double-click launcher.
- Added ignored `android/local.properties` with this laptop's SDK location.

## Remaining limitations and findings

- New wallet deposits are intentionally paused by this release. This check did not enable deposits or perform blockchain transactions.
- Mainnet staking is not enabled by this product. Live settlement, refunds, escrow builds and wallet signing were not verified on this laptop.
- Solana CLI, Cargo and WSL are not installed. The old machine's documented Solana key directory is absent. Release keystores and deployment credentials are not included in the ZIP; their presence elsewhere on this laptop was not established.
- No Android device or emulator was connected during the check. Native wallet intents and physical-device gameplay were not tested.
- `npm audit` reported 11 affected packages: 8 moderate and 3 high. Full evidence is in `dependency-audit.json`. High-severity findings involve bigint-buffer and Solana token dependencies. npm proposes major API changes or a large downgrade for fixes; no automatic forced update was applied.
- The build warns about a 700.83 kB JavaScript bundle and falls back to pure JavaScript bigint bindings. These did not prevent the tested flows from working.
- The older `scripts/player-qa.mjs` assumes the Dark theme button appears directly in Pause; themes now live in Settings. Its local offline-reload step also waits for a service worker, but this app registers that worker only on HTTPS. That older runner was stopped; the current-release gameplay checks above passed. Offline reload on the hosted HTTPS site and Firefox/WebKit were not verified.
- Deployment tooling is not pinned in package.json. Cloudflare production deployment was not attempted.

## Run again

Double-click `start-local.cmd`, then open http://127.0.0.1:5173.

Or use PowerShell:

```powershell
Set-Location 'C:\codex project\kuku\sudoku-release-clock-in-final'
npm.cmd run dev -- --host 127.0.0.1
```

For production-build gameplay checks:

```powershell
npm.cmd run build
npm.cmd start
# In a second PowerShell window, in the same folder:
node scripts/laptop-check.mjs
```

For the UI feedback runner, point `PLAYWRIGHT_CHROMIUM` at the installed test browser:

```powershell
$env:PLAYWRIGHT_CHROMIUM = 'C:\Users\Michael\AppData\Local\ms-playwright\chromium-1243\chrome-win64\chrome.exe'
node scripts/player-feedback-check.mjs http://127.0.0.1:5173/
```

Android debug build:

```powershell
Set-Location android
.\gradlew.bat assembleDebug
```
