# Soldoku — CLOCK IN form answers

Prepared 11 October 2026. Owner confirmed: no VC/angel funding, no previous hackathon win with this project, built within the last three months. These answers have not been submitted to the form.

## PROJECT TITLE
Soldoku

## CATEGORY / OPTIONAL PROJECT DESCRIPTION
Gaming

Soldoku turns Sudoku from a solo puzzle into a mobile-first competitive experience on Solana, available on the web and Seeker. Players create or join rooms, solve the same puzzle, and compete for the fastest valid completion time. Classic play and friendly Practice races make it easy to start, while leaderboard competitions bring wallet identity, token entry escrow and on-chain winner payouts into the game. Our goal is simple: keep the puzzle familiar and make the competition rewarding.

The submitted beta runs on Solana Devnet. Funded entry and payouts have been verified on a physical Seeker; new funded rooms are currently paused. This description does not claim live real-money competition or a verified market-size estimate.

## PRIOR VC / ANGEL FUNDING
No

## BUILT IN THE LAST 3 MONTHS
Yes

## PREVIOUS HACKATHON WIN
N/A

## IF PORTING AN EXISTING APPLICATION TO MOBILE
Use this field if the form treats the web app to Android shell as a port:

We brought Soldoku's competitive Sudoku experience to Seeker: create or join a room, solve the same puzzle, and race for the fastest valid finish. Beyond packaging the web game in an Android shell, we integrated Mobile Wallet Adapter with Seed Vault for wallet connection, competition message authorization, token entry deposits and prize/refund claims. We added wallet return handling, background game persistence and saved-transaction recovery so an interrupted request can be reconciled before retrying. Physical Seeker tests verified deposits, gameplay, scheduled settlement, winner payouts and refunds on Solana Devnet. Classic and Practice remain accessible without a wallet, and the mobile interface supports custom entry amounts. The Android app uses our hosted web interface.

## IF THIS IS A NEW MOBILE APPLICATION
Use this alternative only if that classification applies; do not fill both fields unnecessarily:

We built Soldoku within the last three months to turn a familiar solo puzzle into a mobile competition: one shared grid, timed attempts and a leaderboard that identifies the fastest valid finish. Players can enjoy Classic, race friends in Practice, or enter wallet-based competitions. Our mobile development includes an Android shell, Mobile Wallet Adapter and Seed Vault integration, competition message authorization, custom token entry amounts, background persistence and interrupted-transaction recovery. On Solana Devnet, we verified physical Seeker deposits, scheduled escrow settlement, winner claims and refunds. Gameplay and result verification run in the web app and Worker backend; token custody and payouts use the Solana escrow program.

## SKR INTEGRATION
No active SKR integration. Funded tests use a separate Soldoku Devnet token; it is not SKR. SKR is not used for staking, rewards or access in the submitted build.

## DECK URL
https://github.com/alicearcadeth/soldoku/releases/download/submission/clockin-2026-10-11/soldoku-clockin-pitch-2026-10-11-v5.pdf

## DEMO VIDEO URL
See FINAL-UPLOADS.md. The form accepts YouTube, Loom or a public Google Drive link. A GitHub MP4 link alone is not a replacement for this field.

## REPOSITORY URL
https://github.com/alicearcadeth/soldoku

## ANDROID APK URL
https://github.com/alicearcadeth/soldoku/releases/download/submission/clockin-2026-10-11/soldoku-clockin.apk

## JUDGE ACCESS / OPTIONAL TRANSCRIPT CONTEXT
Open https://soldoku.com for Classic and Practice without a wallet. Free leaderboard rooms use a wallet message and then Start challenge. The APK loads the hosted site and uses Mobile Wallet Adapter on Seeker. Funded entry is paused, so use the supplied evidence; do not expect to open a new funded room. Existing claims and refunds remain available. Solana Devnet beta; tokens have no cash value. Mainnet and card execution are disabled.

The demo includes current recorded navigation and clearly labeled historical funded outcomes. Assisted Classic moves and automated navigation demonstrate mechanics, not human solving skill. No new funded competition was staged for this video. See DEMO-PROVENANCE.md and the transcript.



