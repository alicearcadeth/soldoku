# Soldoku — Colosseum answers

Prepared 5 October 2026. Paste-ready draft; these entries have not been written to your signed-in Colosseum form. **Keep the existing Brief description exactly as it is.** Team profile, country/contact details and X are yours to complete.

## Project website

https://soldoku.com/

## What are you building, and who is it for? — max 1,000 characters

Soldoku is a mobile-first competitive Sudoku game for puzzle players, friends and Solana mobile users. Players create or join rooms, solve the same grid and compete for the fastest correct finish, with one attempt per wallet and a shared leaderboard. Classic offers solo play without a wallet; free competitions let players try the multiplayer experience. Funded competitions add real Solana escrow and winner claims. Our live Devnet beta uses TEST tokens with no cash value. The core wallet identity, deposit, escrow, settlement and payout flows are already implemented and tested with real signed transactions. Mainnet is our next deployment target, using the same game and escrow model; production network/token support, security validation and mobile wallet verification remain before launch. An Android shell supports our work toward Seeker compatibility.

## Why did you decide to build this, and why build it now? — max 1,000 characters

Sudoku is familiar and easy to understand, but solo solving gives players few ways to turn a good finish into a shared competitive moment. We wanted to make the same puzzle a challenge people can enter together, compare fairly and celebrate. Solana gives us a way to combine wallet identity with programmable escrow and transparent payout receipts, while Seeker gives us a concrete mobile environment to build for. We are building now to test whether a simple puzzle competition can bring players back before adding more complex game modes. Our focus is a working, testable loop: join, solve, rank and settle.

## What technologies are you using?

React 19, TypeScript and Vite for the mobile-first web app; Cloudflare Workers and D1 for competition state, accepted moves and server-verified results; Rust with Pinocchio for Solana escrow programs; @solana/web3.js, SPL Token, Wallet Standard and Mobile Wallet Adapter for wallet and chain integration; Kotlin/Android WebView for the Android shell. Vitest and Playwright support automated tests and live browser rehearsals. We use OpenAI Codex for AI-assisted implementation, debugging, test development and UI iteration, with changes checked through builds, tests and real Devnet verification.

## Which chains does your product use?

Select **Solana** only.

## How does your product use these chains? — max 500 characters

Solana wallets sign player identity messages and escrow transactions. A Rust program holds funded competition deposits, then pays the unique fastest server-verified finisher. Ties or no valid finishes refund entrants, with a deadline-based refund path if settlement fails. Gameplay verification and ranking run off-chain; deposits, settlement and payouts are on-chain. Our live beta uses Solana Devnet TEST with no cash value. The core transaction flow is implemented; Mainnet is not enabled yet.

## Category and mobile focus

Category: **Gaming**. Select **Yes** for the mobile-focused dApp checkbox.

## Anything else judges should know? — max 500 characters

Live Devnet beta using valueless TEST. The demo shows real signed deposits, server-verified play, settlement and a winner claim, using disposable test wallets and scripted puzzle input; waits are edited out. Browser checks verify three finalized deposits, a full 3 TEST payout and an empty vault. The automated suite passes 248 tests; 6 optional integration tests are skipped. A prior Seed Vault deposit warning is unresolved; physical Seeker deposits still need verification.

## Project logo

Upload `public/brand/soldoku-logo.png`. It is approximately 414 KB, within the stated stored image limit.

## GitHub link

https://github.com/alicearcadeth/soldoku

The repository is private. Judges need access before submission; the form identifies hackathon@colosseum.com as the contact for a private repo. No invitation has been sent from this task.

## Important context about your repo — max 500 characters

This repo contains the Soldoku web app, Cloudflare Worker/D1 backend, Sudoku engine, Rust Solana escrow programs, Android web shell, automated tests and verification evidence. The live app runs on Devnet with valueless TEST; Mainnet staking is disabled. See README.md and docs/evidence/ for setup and transaction receipts. Older two-player race code is retained for recovery and refunds; the current Compete flow uses multiplayer leaderboard competitions.

## Demo video

Upload `submission/soldoku-devnet-demo.mp4` to YouTube, Loom or Vimeo and paste the hosted URL. This is the product demo, separate from the team pitch. Set public visibility on the Colosseum page according to your preference.

Suggested title: **Soldoku — real Devnet deposit, Sudoku competition and winner payout**

Suggested description: Recorded from https://soldoku.com/ on 5 October 2026. Three disposable test wallets deposit TEST into Solana Devnet escrow, resume the same shared puzzle, finish through server-verified moves, and settle and claim the winner's pool. The recording uses a Wallet Standard test signing adapter and scripted puzzle inputs. Registration and settlement waits are omitted; the real deadlines were respected. The fireworks and sound come from the live app. TEST has no cash value. This is a browser demo, not a physical Seeker wallet approval demonstration.

## Live product link

https://soldoku.com/

## Access instructions

Open https://soldoku.com/ in a browser. No account or wallet is needed for Classic: choose Play classic and a difficulty. For free competitions, connect a supported Solana wallet and sign the identity message; no deposit is required. For funded competitions, choose Soldoku Token (Devnet), then Rules & test funds > Get test funds. If Devnet refuses the SOL airdrop, use https://faucet.solana.com/ for that wallet; TEST may still be supplied by the app. TEST has no cash value. Enable Settings > Sound effects to hear the victory fireworks. Funded rooms share a registration cutoff and a 30-minute play window; claims unlock after the actual deadline.

## Pitch video

Record yourself using `submission/colosseum-pitch-script.md`, upload to YouTube, Loom or Vimeo, and paste the link. Maximum two minutes.

## Mainnet wording — accurate positioning

“Soldoku already executes the core financial flow — deposits, escrow, settlement and payouts — on Solana Devnet. These are real signed transactions. Mainnet is our next deployment target, using the same game and escrow model, with production network/token support, security validation and mobile wallet testing still required before launch.”

The current funded-competition backend permits Devnet/localnet only, and the Rust program allows specific test mints. Moving this funded flow to Mainnet therefore requires implementation/configuration changes and deployment validation. “Move to Mainnet immediately” would overstate the current evidence.

## Fields for you

- Team profile and membership.
- Country and Telegram contact.
- Outside-team contributor disclosure, if applicable.
- X profile.
- Recorded pitch URL and uploaded demo URL.

The screenshot's October 6, 04:00 PDT timestamp is the opening of final submission, equivalent to October 6, 18:00 Bangkok; it is not a deadline. Check the final review screen for remaining required fields and the current submission window.
