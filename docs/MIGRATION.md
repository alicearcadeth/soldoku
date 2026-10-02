# Migration

These steps restore the project on another computer. They do not depend on a clock, a deadline, or the previous computer's folders.

## Prerequisites

- Git
- Node.js 22 (`node -v`). The repository pins this with `.nvmrc` and `package.json` `engines`.
- npm (the lockfile is `package-lock.json`)
- For an Android release build only: JDK 17 (`JAVA_HOME`) and Android SDK (`ANDROID_HOME`) with platform 37. The Gradle wrapper in `android/` uses Gradle 9.7.1.
- For an escrow program build only: Rust/Cargo and the Solana CLI (`cargo-build-sbf`) on `PATH`, or `SOLANA_BIN`. The web app does not need them.
- For a hosted deploy only: Wrangler 4 (`npx wrangler@4.145.0`). Authenticate it on that machine. Do not copy a token into the repo.

## Clone

```bash
git clone <private-repository-url>
cd sudoku
git checkout release/clock-in-final
```

## Install

```bash
npm ci
```

## Configure

```bash
cp .env.example .env
```

Leave privileged values empty for ordinary development. Real values belong in `.env` or `config/operator.env`, which Git ignores. See `docs/PRIVATE_SETUP.md`.

## Run web app

```bash
npm run dev
```

Classic and Practice work without a wallet key. The hosted site is already at `https://sudoku.jamesbitarcade.workers.dev`.

## Run tests

```bash
npm test
npx tsc --noEmit
```

`npm run test:localnet` needs a local Solana validator. Skip it when you are only checking the web app. A gitignored localnet mint file under `programs/match-escrow/fixtures/` is optional. Ordinary tests use a local-only key when that file is absent. Staging still requires the real file outside Git.

## Build

Web:

```bash
npm run build
```

Android, after JDK 17 and the Android SDK are installed:

```bash
cd android
./gradlew assembleRelease
```

On Windows the wrapper is `gradlew.bat`. Signing names are in `docs/PRIVATE_SETUP.md`. A build without the release keystore is not a replacement for `submission/sudoku-clockin.apk`.

## Run Android

Install the existing submission APK with `adb install -r submission/sudoku-clockin.apk` from the repository root, or install a newly signed APK from `android/app/build/outputs/apk/release/`. The APK is a shell. It loads the hosted site.

A physical Seeker is a separate hardware check. Source migration does not require one.

## Deploy hosted app

Only with deploy credentials on that machine:

```bash
npx wrangler@4.145.0 deploy --config wrangler.jsonc
```

Do not deploy documentation-only changes. Production config and the Mainnet gate stay as documented in `docs/mainnet.md`.

## Submission artifacts

| Path | Purpose |
|---|---|
| `submission/sudoku-clockin.apk` | Accepted release APK |
| `submission/sudoku-clockin-final.mp4` | CLOCK IN demo |
| `submission/pitch.html` | Pitch |
| `docs/CURRENT_RELEASE.md` | Hashes and the hosted identity |

Earlier clips and archived APKs under `submission/` stay in Git for history. They are not the accepted demo or APK.

## Optional privileged Devnet operations

Scripts such as `scripts/v2-deploy.mjs` and `scripts/devnet-deploy.mjs` need the authority files in `~/.config/solana`, a Devnet RPC, and a Solana CLI. They exit or fail when those are absent. They are not part of `npm test`.

## Private files not stored in GitHub

- Android release keystore and its password file
- Devnet authority, upgrade, mint, and player key files
- `config/operator.env` and any real `.env`
- Wrangler or Cloudflare login
- Optional wallet-export files used only by the import helpers

Transfer those yourself. Do not put them in Git.

## Verification

```bash
node scripts/verify-migration.mjs
npm test
npm run build
```

`verify-migration.mjs` prints PASS, WARN, or FAIL. It does not deploy, send transactions, or print secret values. A missing JDK or Android SDK is a warning. A missing source file, lockfile, or submission artifact is a failure.

## New-computer acceptance

The move is complete when this computer can:

- clone the private repository
- check out `release/clock-in-final`
- install dependencies with `npm ci`
- build with `npm run build`
- pass `npm test`
- start `npm run dev`
- find the submission artifacts named above
- build Android when the signing material and SDK are present
- deploy only after Wrangler credentials are configured on this machine

## History to keep

Prefer the full history of this repository. It is small, and the release branch is `release/clock-in-final`. The tag `ui-baseline-pre-seeker-polish` marks the UI baseline. Other local branches (`master`, `ui/seeker-polish`, `ux/final-quality-audit`, `ux/player-feedback-pass`) are ordinary history. Do not rewrite commit timestamps.
