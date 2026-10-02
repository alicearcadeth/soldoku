# Private setup

This file names secret material. It does not contain secret values. Paths are relative to the user home or to environment variables, so they work on another computer.

Ordinary development does not need any of this. Classic, Practice, `npm test`, and `npm run build` run without keystores, authority keys, or a Cloudflare login.

## Android signing

Required only when producing the official signed release APK.

Expected secure file, outside the repository:

`~/.config/solana/<release-keystore>`

The file that signed `submission/sudoku-clockin.apk` is the one whose certificate matches `docs/CURRENT_RELEASE.md`. Two local filenames have been used in tooling (`sudoku-release.keystore` with alias `sudoku-release`, and `sudoku-android.keystore` with alias `android`). Use the file that matches the submitted certificate. Do not guess.

Required configuration names:

- `SOLANA_MOBILE_KEYSTORE_PATH`
- `SOLANA_MOBILE_KEYSTORE_ALIAS`
- `SOLANA_MOBILE_KEYSTORE_PASSWORD`
- `SOLANA_MOBILE_KEY_PASSWORD`

The password file stays outside the repository. Do not commit it and do not paste it into a shell history you then commit.

JDK 17 comes from `JAVA_HOME`. The Android SDK comes from `ANDROID_HOME`. Neither path is stored in Git.

## Devnet match and mint authority

Required only for privileged Devnet deploy and financial tests.

Never committed. Expected location:

`~/.config/solana/`

Typical filenames, all secret:

- `sudoku-v2-program.json`
- `sudoku-v2-upgrade.json`
- `sudoku-v2-authority.json`
- `sudoku-v2-mint.txt`
- `sudoku-authority.json`
- `sudoku-dev.json`
- `sudoku-player-b.json`
- `sudoku-staging-program.json`
- `sudoku-staging-upgrade.json`
- `sudoku-devnet-mint.txt`

Public addresses for these roles are in `docs/escrow-v2.md`. The JSON contents are not public.

Optional import helpers read a wallet export only when `SUDOKU_IMPORT_WALLET_FILE` or `SUDOKU_IMPORT_PLAYER_B_FILE` is set. Those exports stay outside the repository.

Program builds use the Solana CLI and Cargo inside the environment you choose. Set `SOLANA_BIN` when `solana` is not on `PATH`. Set `SUDOKU_WSL_HOME` only for the optional helpers that write a shell script into a WSL home. Set `SUDOKU_WSL_USER` only when the default WSL user is not the one that has the Solana install.

## Worker and deployment credentials

Required only for deployment.

Use `npx wrangler login` or the Wrangler environment the host already documents. Do not embed a token in the repository, in `wrangler.jsonc`, or in an example file.

RPC and operator values, when a deploy needs them, belong in `config/operator.env` (ignored) or in the process environment. Names are listed in `.env.example`. `SUDOKU_AUTHORITY_KEY` is the match-authority secret for a worker that settles rooms. Leave it unset for local Classic and Practice.

`SUDOKU_REVEAL` stays unset on the public Devnet worker.

## What stays on the machine

Copy the categories above to the new computer through a channel you control. Do not add them to Git, GitHub Releases, or chat.
