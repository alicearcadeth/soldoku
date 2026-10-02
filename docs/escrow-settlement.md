# Settlement mint

The production escrow build accepts one mint: Mainnet USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`. The address is a constant in the program binary. Open, Join, Settle, Cancel, and Close all reject any other mint before they move tokens.

A config account that stores the mint was the alternative. It needs an initialization signer, and every instruction has to load that account. A missed check, or a front-run before initialization, would accept the wrong asset. The constant removes that account. Changing the mint later requires a program upgrade. The upgrade authority can still do that. The match authority cannot.

Localnet uses a second binary built with `--features test-settlement`. That binary accepts only the test mint `7VaC5xJULHGQzsZsyUCaZ7BbLGNDENLjXiPbfbbRY84j`. The same binary is deployed on Devnet as staging program `GTJ68bR2Fwkc9JcYefH9Eas9gvHnR6AkZ3TincmJsst4`, labeled STAGING / DEVNET / NO CASH VALUE. It is not the production artifact. The public Devnet V2 program is left unchanged.

The token program, associated-token program, and system program accounts must be those exact programs. Mint and token accounts must be owned by the token program, and each token account must name the settlement mint and the expected owner. Those checks happen in this program, before the token program is invoked.

The match authority still chooses the winner, the draw, or neither. It cannot change the stored mint, stake, players, or deadlines, and payouts go only to the two players' associated token accounts. The upgrade authority can replace the program. It is not frozen.

## Known staging room KKTK

Room `KKTK` is a stranded Devnet staging match. It is not a production balance and it does not block the submission.

Read on 2026-09-28 from program `GTJ68bR2Fwkc9JcYefH9Eas9gvHnR6AkZ3TincmJsst4`:

- Match id `127117713982598`, account `BkTM943cjAZCp9CAj8DRPS6VmVsDwsX6Rrc65g1YS67b`
- Status `0` (waiting), outcome `0`
- Stake `1000000` base units of test mint `7VaC5xJULHGQzsZsyUCaZ7BbLGNDENLjXiPbfbbRY84j`
- Token vault `2JwPTYkpz8UMZss532WHtognd3q8E6BEwSkzzgqYnkfP` still holds `1000000` (one test token)
- Match account rent `1478280` lamports; vault rent `1488440` lamports
- Join deadline `1790599239`, settle deadline `1790600139`
- Opener `7wFhXMKvi53qCsckaC4KVFSm9aWXdXXf7kMrj8m8LV94`

Cancel requires that opener's signature. The opener key was a disposable debug-WebView key and was removed when that debug install was cleared. Do not try to recover it. The locked asset is a Devnet test token on the staging program, not Mainnet USDC and not the public V2 program.
