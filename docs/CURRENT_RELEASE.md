# Current release

Public app: https://soldoku.com/ and https://www.soldoku.com/

This is the Devnet Soldoku beta. Stakes are TEST and have no cash value. Mainnet staking is not enabled. New testers obtain Devnet SOL and TEST from the in-app test-funds control. See [testers.md](testers.md).

The Android shell package is `com.sudoku.game`. Its release URL is `https://soldoku.com/`. A rebuilt APK may replace `submission/sudoku-clockin.apk` only when its certificate SHA-256 is `28e197708d1dc9de80f1e23939352bcd6a80e1171717055205f5394a622c5553`.

Checked on this PC on 3 October 2026:

- `sudoku-release.keystore` alias `sudoku-release` is `f16e0470a3b43bb6fd162f3613e4523953bf9efada7229d718deebd710532d29`. It does not match.
- `~/.config/solana/sudoku-android.keystore` alias `android` matches. Owner `CN=Sudoku`. Certificate SHA-256 `28e197708d1dc9de80f1e23939352bcd6a80e1171717055205f5394a622c5553`.
- The rebuilt APK is `submission/soldoku-clockin.apk`, also at `android/app/build/outputs/apk/release/app-release.apk`. File SHA-256 `bf4276273dc43f1609c464171180676dbf0f933c3da79f767eede8fb352a200c`. Package `com.sudoku.game`, versionName `0.1.0`, versionCode `1`. It contains `https://soldoku.com/` and does not contain the old workers.dev host. `apksigner` verifies APK Signature Scheme v3 only, the same scheme as `F:\James\codex project file\Sudoku\output\submission\sudoku-clockin.apk`.

## Live Worker

Verified 5 October 2026 on code commit `db12ea438a0d9c75ed7086e8efc409cbb77e0b48`, Worker `17f32c99-968c-4326-983b-34b1e1af3f4a`. Two three-wallet Devnet rounds completed settlement and 3 TEST winner payouts. Each round has five finalized successful receipts; both escrow vaults ended empty. Existing deposits were recovered after fixing concurrent room polling that caused Start and claim preparation HTTP 409 failures. See [public verification evidence](evidence/competition-production-2026-10-05.json).

Validation: 248 tests passed; six optional integration tests skipped. Mainnet remains disabled. Browser signing was verified with test wallet adapters; physical Seeker / Seed Vault deposit approval remains unverified. The public Devnet SOL faucet can refuse requests independently of TEST funding.

The current release manifest is at https://soldoku.com/api/release. Build from a clean committed checkout, deploy with `npx wrangler deploy --config wrangler.soldoku.jsonc`, and run `npm run verify:release` for both public domains.

## Earlier CLOCK IN artifacts

`docs/clock-in.md` and `submission/` record the 30 September 2026 submission, including the APK that loaded `https://sudoku.jamesbitarcade.workers.dev/`. That host is not the current public app. Do not treat its worker version or client asset names as the Soldoku release.

## Financial safety

Mainnet stays disabled. Do not point Devnet keys or the Devnet TEST mint at Mainnet USDC. The legacy two-player deposit pause is a separate surface from multi-player TEST competitions.
