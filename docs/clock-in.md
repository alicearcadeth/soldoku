# CLOCK IN submission

Checked against the Solana Mobile post [Clock In](https://solanamobile.com/blog/clock-in-the-solana-mobile-hackathon) on 2026-09-28.

Submissions open 8 September 2026 and close 8 October 2026. Winners are announced in early November. The published required artifacts are a functional Android APK, a GitHub source repository, a demo video, and a pitch deck or short presentation. Publishing on the Solana dApp Store is how a winner claims a prize later. It is not required to enter. A physical Seeker is not required to build or test.

Judging areas in that post: stickiness and product-market fit, user experience, innovation, and presentation. An optional SKR prize exists. This project does not add an SKR feature for that prize.

## Artifacts in this workspace

| Artifact | Location | Status |
| --- | --- | --- |
| APK | `submission/sudoku-clockin.apk` | Release shell for the promoted UI. SHA-256 `79529045f97ad9867ab6dc6207a06d038600966c0b687dfd7ba53406e2b0d954`. Package `com.sudoku.game`, version `0.1.0`, versionCode `1`. Certificate SHA-256 `28e197708d1dc9de80f1e23939352bcd6a80e1171717055205f5394a622c5553`. The previous file is `submission/archive/sudoku-clockin-pre-seeker-ui.apk`, SHA-256 `e33725e8a78d7be54a9bf8dd0eb40c1241ae3a61ecb94a5363f168dd1c08aff7`. |
| Source | this repository, branch `release/clock-in-final` | Not pushed. No git remote is configured. |
| Demo | `submission/sudoku-clockin-final.mp4` | Finished recording of the public app, 75 seconds, 400×890. Home, Classic, notes, hint, pause, theme, a free Practice win, and the paused Compete screen. The earlier short clip remains at `submission/sudoku-clockin.mp4`. |
| Pitch | `submission/pitch.html` | Current home and the paused Compete screen. A physical Seeker deposit is not described as complete. |
| Hosted app | `https://sudoku.jamesbitarcade.workers.dev` | Worker `a392e0c8-fc10-4db9-9cab-de7cfb507974`. Client `assets/index-BO7DSemp.js`. CSS `assets/index-Z6rSqkAq.css`. Rollback worker `9e228a8e-0961-4e89-803a-a17638d68f39`. Devnet program `937BAWXVCW58oEKkA1FijkSXXtdgGEytUyPRV2Roge22`. |

## Project copy

**Name:** Sudoku

**One line:** A two-player Sudoku race with a non-custodial Solana escrow, built for a phone wallet.

**Short description:** Classic and Practice are free. Compete deals one puzzle to two players. On Devnet, each player locks a test token in an on-chain vault and the winner is paid from that vault. The same app is structured for a later Mainnet USDC vault, funded either directly or by swapping SOL through DFlow. Mainnet staking is not live.

**Problem:** People already play Sudoku alone. A wager between two players usually means one of them holds the money. That falls apart on a phone, with a stranger, or when one player leaves.

**Solution:** Both players sign a deposit into a program vault. The server runs the race and submits the result. The program pays only the two players, and only the amount that was locked. Either player can refund after the deadline. The opener can close the empty accounts and take the rent back.

**Why mobile:** The match is short, the board fits a phone, and the wallet approval is the Mobile Wallet Adapter sheet the player already uses.

**Why Solana:** The stake, the result, and the refund are one account and a few transactions. Settlement does not wait on a custodian.

**Why Solana Mobile:** The Android shell is a Web Shell that hands `solana-wallet` requests to the wallet app. The same match can be opened from a desktop browser for the second player.

**Architecture:** React client, Cloudflare Worker, D1 for room state, and an Anchor-free escrow program. The Worker builds transactions. The wallet signs them. See the README.

**MWA:** The shell registers the Mobile Wallet Adapter wallet standard in the page and launches the wallet app for connect and sign. The emulator proof uses a mock wallet where the mock can complete the sheet. Seed Vault on a Seeker is not claimed. A physical Devnet deposit was blocked by Seed Vault Wallet before signing, with the warning "Scam site detected." No deposit was broadcast.

**Competitive flow:** Create a room, both players deposit, both race the same givens, first correct finish wins, a draw splits the vault, a missed join or an unfinished match refunds after the deadline.

**Current Devnet status:** The public site uses test tokens and says so. A separate staging program on Devnet has run winner, draw, unmatched refund, deadline refund, and close. The public historical program was not upgraded.

**Future Mainnet:** Direct USDC deposits, or SOL swapped to USDC through DFlow and then deposited. The production program binary accepts only Mainnet USDC. It is not deployed. The production worker rejects financial calls.

**DFlow:** The production quote API can build an unsigned swap. This project has not broadcast one.

**Security and recovery:** Pause stops new paid rooms without freezing a refund of an open room. Unknown sends are looked up by the original signature. D1 can be restored from a bookmark onto a copy, not by guessing. The match authority cannot rewrite the terms after open.

**Roadmap:** Public Devnet beta now. Then, only with owner approval: Mainnet deploy, one real swap, one real escrow, an external review, and a fair-play policy before public real-value play. Seeker verification and the dApp Store come after that. Card funding stays paused.

**Limitations:** Test tokens are not money. The public Devnet program does not close accounts. An outside solver cannot be ruled out. There is no dedicated Mainnet RPC provider yet. New deposits are paused in the public UI after the Seed Vault warning. That pause is in the page. It is not a worker-wide block unless `SUDOKU_FUNDING_PAUSED` is also set. Classic time counts active play, including a slow tick while the puzzle is still on screen. Paused, hidden, and unfocused time stays out, and a reload keeps the pause. The installed APK does not dispatch `sudoku-shell-hide`. The page also pauses on blur, page hide, and visibility. That phone pass was not repeated in this release because the Seeker was not attached. The APK loads the hosted site, so this web deploy is what the installed app shows.

**Deposit hold:** `NEW_DEPOSITS_HELD` in `src/ui/depositHold.ts` is true. Create, join, and a new deposit are unavailable in Compete. Practice, Classic, wallet connection, history, and a refund of a room that already has a deposit stay available. The worker's escrow rules are unchanged. Turn the flag off only after support identifies the wallet check.

## Eligibility

Read from the 8 September 2026 announcement and the hackathon page on 30 September 2026. The announcement requires an Android APK, a GitHub repository, a demo video, and a pitch. Winners publish on the dApp Store later. That publication is not an entry requirement. A physical Seeker is not required to build or test. An optional SKR prize exists. This project does not add an SKR feature.

The announcement does not say a WebView shell is ineligible, and it does not publish a separate native-code minimum. The hackathon page is a visual desk. Its fetch did not include a rules document with extra binding fields. If the organizers require something beyond an Android shell that loads the app and speaks Mobile Wallet Adapter, that requirement was not in the announcement.

What this project actually has: an Android WebView shell, Mobile Wallet Adapter connect and sign, a Devnet escrow program, and browser gameplay on the same site. Seed Vault connection and message signing were done on a physical Seeker. The physical deposit was blocked. Mainnet wagering is not live.

## Draft submission answers

These match the four deliverables in the 8 September 2026 CLOCK IN announcement. The hackathon site at https://solanamobile.com/hackathon did not expose a readable field list in the page fetch, so any extra form fields need the owner to read them at submission time. Do not submit without the owner's go-ahead.

- Project: Sudoku
- URL: https://sudoku.jamesbitarcade.workers.dev
- APK: `submission/sudoku-clockin.apk`, package `com.sudoku.game`, version 0.1.0. It loads the hosted site.
- Source: no GitHub URL yet. The local branch is `release/clock-in-final`. There is no remote.
- Demo: `submission/sudoku-clockin-final.mp4`, 75 seconds. It shows the public app: Classic, a free Practice win, and Compete with new deposits paused. It does not show a wallet deposit.
- Pitch: `submission/pitch.html`
- What it is: a phone Sudoku app with a free solo puzzle, a free two-player practice race, and a Devnet test-token race whose stake sits in a program vault.
- Seeker: gameplay, wallet connection, and message signing were done on a physical Seeker. The deposit was blocked by Seed Vault Wallet with "Scam site detected" and was not broadcast. The latest clock change was not retested on the phone in this pass.
- Not live: Mainnet wagering, dApp Store publication, and a completed physical deposit.

Owner still has to supply the team name, contact, GitHub destination, and permission to publish or submit. Recommended repository name: `sudoku`. Description: "A two-player Sudoku race with a non-custodial Solana escrow, built for a phone wallet." Do not push until the owner names the repository and authorizes it.
