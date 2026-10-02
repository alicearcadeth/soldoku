# Sudoku

A two-player Sudoku race with a non-custodial Solana escrow. Classic and Practice are free. A staked match locks the same puzzle for both players and pays the winner from a program vault.

The public app is a **Devnet** beta. The stake is a test token. It has **no cash value**. Mainnet staking is not enabled.

## Play

- Public beta: https://sudoku.jamesbitarcade.workers.dev
- Inert production shell: https://sudoku-mainnet.jamesbitarcade.workers.dev

Classic starts without a wallet. Practice starts without a wallet. Staked mode asks for a Devnet wallet and shows `DEVNET`, `TEST TOKENS`, and `NO CASH VALUE`.

## Architecture

The browser and the Android Web Shell talk to a Cloudflare Worker. The Worker deals the puzzle, records accepted moves, and builds escrow transactions. Players sign those transactions in their own wallet. The Worker never holds the stake.

The escrow program stores the players, the stake, and the deadlines in the match account at open. The match authority can later submit the server's win or draw result. It cannot change the mint, the stake, the players, the deadlines, or the payout wallets. Settlement pays only the two players' token accounts. After the vault is empty, the opener can close the match and vault accounts. The rent goes back to the opener.

The production program binary is built to accept only Mainnet USDC. It is not deployed. The Devnet staging program is a separate build that accepts one test mint. The public historical Devnet program is a third identity and is not upgraded by this repository's staging flow.

A future funding path quotes SOL to USDC through DFlow and then deposits that USDC. That broadcast is not turned on. If the wallet already holds the stake token, the app skips the swap.

## Development

```powershell
npm install
npm run dev
```

`npm run dev` serves the local app. Localnet rooms use the test settlement mint and a disposable browser key. They are not Devnet and not Mainnet.

Useful checks:

```powershell
npx tsc --noEmit
npm test
```

On this machine `npx` is optional. `node node_modules/typescript/bin/tsc --noEmit` and `node node_modules/vitest/vitest.mjs run` are the same checks.

## Program

The escrow crate is `programs/match-escrow`. A production build has no `test-settlement` feature and embeds the Mainnet USDC mint. A staging or localnet build uses `--features test-settlement` and the fixture mint. Do not load the production binary on localnet, and do not deploy either binary to Mainnet from these scripts.

Solana CLI in this environment is the WSL install. `scripts/build-escrow-once.sh` builds the test binary, then the production binary. Run it only when you intend to rebuild. The deploy helper in `src/solana/productionDeploy.ts` refuses Devnet identities and never sets execute mode.

## Devnet staging

Staging is a private rehearsal of the production instruction set on Devnet. It is not the public site. Start it only with Devnet RPC and the staging authority key in the environment:

```powershell
$env:SUDOKU_STAGING = "1"
$env:SUDOKU_ESCROW_PROGRAM_ID = "GTJ68bR2Fwkc9JcYefH9Eas9gvHnR6AkZ3TincmJsst4"
$env:SUDOKU_MINT = "7VaC5xJULHGQzsZsyUCaZ7BbLGNDENLjXiPbfbbRY84j"
$env:SOLANA_CLUSTER = "devnet"
$env:SOLANA_RPC = "<your devnet RPC>"
$env:SUDOKU_AUTHORITY_KEY = Get-Content "$env:USERPROFILE\.config\solana\sudoku-staging-upgrade.json" -Raw
node scripts/start-staging-server.mjs
```

`scripts/staging-devnet-rehearse.mjs` runs the CLI lifecycle. It spends Devnet SOL on fees. It does not spend Mainnet assets.

## Android

The Web Shell lives in `android/`, package `com.sudoku.game`. The submission APK loads the public Devnet site. Build it with JDK 17 (`JAVA_HOME` set to that JDK) and an Android SDK (`ANDROID_HOME`):

```powershell
cd android
.\gradlew.bat assembleRelease
```

Release signing uses the existing keystore outside this repo. Set `SOLANA_MOBILE_KEYSTORE_PATH`, `SOLANA_MOBILE_KEYSTORE_ALIAS`, `SOLANA_MOBILE_KEYSTORE_PASSWORD`, and `SOLANA_MOBILE_KEY_PASSWORD`. This repository does not contain the keystore or its password. See `docs/PRIVATE_SETUP.md`. A debug build can point at a local staging origin with `-PSOLANA_MOBILE_URL=http://10.0.2.2:5174` for the emulator. That debug build is not the submission APK.

The shell opens `solana-wallet` links in a Mobile Wallet Adapter app. On a physical Seeker, Seed Vault Wallet has connected and signed a message. A Devnet deposit was blocked by the wallet before signing, with the warning “Scam site detected.” That deposit is not verified, and new deposits are paused in the public UI until support identifies the check. Classic, Practice, and refunds of an already funded room stay available.

## Worker and database

Public Worker config: `wrangler.jsonc`. Production config: `wrangler.production.jsonc`. Production D1 is empty of match rows. Do not copy Devnet rows into it. Recovery steps are in `docs/production-recovery.md`.

The production worker returns 403 for financial routes until the owner sets the approval phrase. Do not set that phrase as part of ordinary development. `SUDOKU_FUNDING_PAUSED=1` refuses new paid rooms and still allows practice, moves, refund, settlement, and close for a room that is already open.

## Test tokens

Devnet stakes of 1, 2, or 5 are test tokens. A desktop staging session can create a disposable key in the browser. That key is not a personal wallet. Fund it only from the staging authority on Devnet. The public site expects a normal Devnet wallet.

## Known limits

An outside Sudoku solver can still be used. The server rejects impossible move sequences and very fast finishes, and it flags a fast finish for review. It does not take the stake because of that flag. See `docs/fair-play.md`.

The public Devnet program does not have the Close instruction. Staging and the undeployed production build do. Historical public rooms stay on the program that opened them.

Mainnet deployment, a real DFlow swap, real USDC, a paid RPC provider, and the dApp Store submission are not part of this beta.

New Devnet deposits are paused in the public UI after Seed Vault Wallet blocked one attempt. The escrow rules are unchanged. The pause is in the page, so it is not a server-wide block unless `SUDOKU_FUNDING_PAUSED` is also set. Set `NEW_DEPOSITS_HELD` in `src/ui/depositHold.ts` to `false` only after that warning has an official explanation. Do not treat the warning as a false positive without that explanation. The Android shell loads the hosted site, so a web deploy changes the installed app without a new APK.
