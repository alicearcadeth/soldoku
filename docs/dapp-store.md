# dApp Store package

This is an owner checklist. It is not a submitted listing, and it is not Seeker verification.

## Built package

- Package: `com.sudoku.game`
- Version name: `0.1.0`
- Version code: `1`
- Min SDK 28, target SDK 37
- Hosted page: `https://soldoku.com/`
- Signing certificate SHA-256: `28e197708d1dc9de80f1e23939352bcd6a80e1171717055205f5394a622c5553`
- The release APK was signed with alias `android` from `~/.config/solana/sudoku-android.keystore`. On 3 October 2026 that alias matched the certificate above. `sudoku-release.keystore` alias `sudoku-release` hashed to `f16e0470a3b43bb6fd162f3613e4523953bf9efada7229d718deebd710532d29` and does not match. Do not replace the matching keystore. The rebuilt file is `submission/soldoku-clockin.apk`, file SHA-256 `bf4276273dc43f1609c464171180676dbf0f933c3da79f767eede8fb352a200c`, verified with APK Signature Scheme v3.
- A debug build can use the same keystore when the store path, alias, and passwords are supplied at build time. The password is not stored in the project.

## Emulator result

- Android Emulator image: Android 14, API 34, `emulator-5554`
- Mock MWA Wallet `com.solana.mwallet` version `1.0.1` (versionCode 2), official sample, disposable Devnet key only
- Classic opens without a wallet. Free Practice opens without a wallet. Staked connects through Mobile Wallet Adapter, signs a history message, and can deposit on Devnet after the mock wallet's device-credential unlock.
- System Back leaves the activity when the WebView has no history entry. The funded room is still there when the app is opened again.
- Physical Seeker, Seed Vault Wallet, and device-specific signing are UNVERIFIED.

## Do not do yet

- Do not submit the Solana dApp Store listing.
- Do not complete publisher KYC from this checklist.
- Do not change the production signing identity.
- Do not treat the mock wallet as Seed Vault. The mock wallet keeps an unlocked signing window for 15 minutes after the device PIN, and it crashes the signing screen when that window has expired instead of asking again.
