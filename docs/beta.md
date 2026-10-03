# Limited Devnet beta

Share this with people who want to try the website. Do not post it until you have read it. No support email is published, because none was supplied.

Public site: https://soldoku.com/

New players get Devnet SOL and TEST from **Get Devnet SOL and TEST** on Compete. See [tester funds](testers.md). The older host `https://sudoku.jamesbitarcade.workers.dev/` is not this release.

## Announcement

Sudoku is a calm 9×9 puzzle you can open in a browser.

Play Classic on your own. It does not need a wallet, and the puzzle stays on your device.

Race a friend for free in Practice. Share a room code, or use Quick Match. No tokens move.

Compete is a Devnet beta. A funded room uses TEST, which has no cash value. Everyone plays the same grid after registration closes, and the unique fastest finish wins the pool. Ties and no valid finishes refund the entrants. New testers use **Get Devnet SOL and TEST** before they deposit. A Seeker uses the mobile wallet. A desktop browser can connect a Wallet Standard wallet. Classic and Practice do not need one. The older two-player race is still on the page and is not the current funded competition.

This is not real-money play, not a store release, and not a security audit.

## If someone gets stuck

- Nobody joins a Quick Match listing: it leaves the public list after 20 minutes.
- A private Practice code lasts about two hours if nobody joins.
- The other player never deposits: a refund opens when the join window ends.
- A staked match cannot finish: either player can refund after the settle deadline. Both stakes come back. The screen says the refund is confirmed only after the escrow account says so.
- Report a problem from About this beta on the home screen. The note is stored on the game server. It does not include a wallet or a puzzle.

## Known limitations

- Staked play needs a wallet that can sign on Devnet. A Seeker uses Mobile Wallet Adapter. A desktop browser uses Wallet Standard. If none is installed, Connect wallet says so. That is not the same as a test on a physical Seeker.
- A narrow browser window is not a test on a phone.
- Browser Back moves through Home, Classic, and Compete. It does not clear a saved Classic game. New game asks before it replaces an unfinished puzzle. Finished games stay in the history on this phone. The Solved Home button still clears the current save.
- An outside solver can fill a race. Practice does not move tokens. Real-value stakes stay off until the separate Mainnet gate in `docs/mainnet.md`.
- One Devnet RPC is configured. There is no verified backup.
- WebKit was not part of the finished browser pass.

## The one missing value

The dApp Store listing and a public mailto both need a real support address. Do not invent one. When you choose it, put it in About this beta and in `docs/dapp-store.md`. Until then, About this beta is the feedback path.

## Owner-only production APK

Do not install this over the development APK. From `android/`, set `SOLANA_MOBILE_KEYSTORE_PASSWORD` and `SOLANA_MOBILE_KEY_PASSWORD` from the password file kept outside the repository. Do not print them. Then:

```powershell
cd android
.\gradlew.bat assembleRelease -PSOLANA_MOBILE_KEYSTORE_PATH="$env:SOLANA_MOBILE_KEYSTORE_PATH" -PSOLANA_MOBILE_KEYSTORE_ALIAS=android
```

The submitted certificate is SHA-256 `28e197708d1dc9de80f1e23939352bcd6a80e1171717055205f5394a622c5553` in `docs/CURRENT_RELEASE.md`. `sudoku-android.keystore` alias `android` matches it. `sudoku-release.keystore` alias `sudoku-release` does not. The signed rebuild is `submission/soldoku-clockin.apk`.

Store submission, KYC, and the publisher key stay owner actions. See `docs/dapp-store.md`.
