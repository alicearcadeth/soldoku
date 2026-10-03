# Current release

Public app: https://soldoku.com/ and https://www.soldoku.com/

This is the Devnet Soldoku beta. Stakes are TEST and have no cash value. Mainnet staking is not enabled. New testers obtain Devnet SOL and TEST from **Get Devnet SOL and TEST**. See [testers.md](testers.md).

The Android shell package is `com.sudoku.game`. Its release URL is `https://soldoku.com/`. A rebuilt APK may replace `submission/sudoku-clockin.apk` only when its certificate SHA-256 is `28e197708d1dc9de80f1e23939352bcd6a80e1171717055205f5394a622c5553`.

Checked on this PC on 3 October 2026:

- `sudoku-release.keystore` alias `sudoku-release` is `f16e0470a3b43bb6fd162f3613e4523953bf9efada7229d718deebd710532d29`. It does not match.
- `~/.config/solana/sudoku-android.keystore` alias `android` matches. Owner `CN=Sudoku`. Certificate SHA-256 `28e197708d1dc9de80f1e23939352bcd6a80e1171717055205f5394a622c5553`.
- The rebuilt APK is `submission/soldoku-clockin.apk`, also at `android/app/build/outputs/apk/release/app-release.apk`. File SHA-256 `bf4276273dc43f1609c464171180676dbf0f933c3da79f767eede8fb352a200c`. Package `com.sudoku.game`, versionName `0.1.0`, versionCode `1`. It contains `https://soldoku.com/` and does not contain the old workers.dev host. `apksigner` verifies APK Signature Scheme v3 only, the same scheme as `F:\James\codex project file\Sudoku\output\submission\sudoku-clockin.apk`.

## Live Worker

Deployed 3 October 2026 from local commit `76d14da278ef90fec45e584f83f13853514ccc64` with uncommitted source. Worker version `fd515ede-227e-426d-8188-0e2ad81fecd1`. `https://soldoku.com/api/competitions/config` reports Devnet, TEST mint `BtdrgokAvXQE4yj3zS48c4ktnMSy3TGoRkHCWD5fV8U4`, and the tester faucet enabled. The bundle contains **Get Devnet SOL and TEST**. Settlement is scheduled every five minutes.

A new wallet on that deploy received 1 SOL and 20 TEST. The SOL receipt is `4GL4ZpJbhGBQvXmzvGTGSZzVEjYMpp7SuoJUSdKZrqJx6nejaSsvNaE9YQXDvzudPHhpcFYgcT84MB4gLdaVDoX5`. The TEST receipt is `235fZVYiZw97jvpVAcB5ajSDGx2JU5VsuiNxRRLdeayC5kyBZ7Z6SrSTSZoecczH6SQiu6p7WAdmjYJ9rB4Vtwpz`. A second request for the same wallet was refused for 24 hours. For every subsequent release, commit and push the source, run `npm run build` from a clean checkout, deploy with `npx wrangler deploy --config wrangler.soldoku.jsonc`, and run `npm run verify:release`. The verifier checks that local HEAD, GitHub main, the live release manifest, and every published asset match. The current live commit is available at `https://soldoku.com/api/release`.

The earlier clean production check remains [competition-production-devnet.json](evidence/competition-production-devnet.json): commit `d1acf7bdabeda6837f1c762a425bcbce2d33b91c`, Worker `e6b26786-1f7b-4da5-8a83-251043aa4563`, program `6uuszYMoZ2bBX8oVccpYPUgdhW6CSvASziN2m8LpJxYs`.

## Earlier CLOCK IN artifacts

`docs/clock-in.md` and `submission/` record the 30 September 2026 submission, including the APK that loaded `https://sudoku.jamesbitarcade.workers.dev/`. That host is not the current public app. Do not treat its worker version or client asset names as the Soldoku release.

## Financial safety

Mainnet stays disabled. Do not point Devnet keys or the Devnet TEST mint at Mainnet USDC. The legacy two-player deposit pause is a separate surface from multi-player TEST competitions.
