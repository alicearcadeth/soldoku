# Escrow V2

New public Devnet staked rooms use Escrow V2. Legacy rooms keep the program id they were opened with. Missing `programId` still means the legacy program. This is not Mainnet, and it does not upgrade the legacy program.

These development keys are not Mainnet identities. Do not copy them into a production worker.

## Identities

| Role | Public key | Local file |
|---|---|---|
| V2 program | `937BAWXVCW58oEKkA1FijkSXXtdgGEytUyPRV2Roge22` | `~/.config/solana/sudoku-v2-program.json` |
| V2 upgrade authority | `6fTc4rVYFz6NtHDZXeGQqTTQTiCe41Fsrz8ypxqMt8dX` | `~/.config/solana/sudoku-v2-upgrade.json` |
| V2 match authority | `4uBUqMExgkzqW2WWKyrq1uSoAQAi3YenKnSsXTrB6T3N` | `~/.config/solana/sudoku-v2-authority.json` |
| Staging test mint | `Zhn8TKx25j5HSErNdrRmUrAR173PvtNHtPb1szaZuRn` | `~/.config/solana/sudoku-v2-mint.txt` |

The three JSON files are secret. Keep them outside the repository, readable only by the account that deploys. Back them up by copying those files to encrypted media the owner controls. Do not commit them, paste them into chat, or put the program or upgrade key in a Worker. The staging Worker holds only the match-authority secret.

The legacy program `HUkhJi8p1XXuErpEXkgpfQjwdapigXLECRoQSu3indyS` was not upgraded. Its upgrade authority is still the Devnet player wallet `JCVsKd4TMg1fvEs7rjf5YgLYbJfNC8Dwb4x1PchFkGM7`. That wallet must not become the V2 or Mainnet upgrade authority.

Deployed bytecode SHA-256 `934b68050567538622715e3ad51323c6039333c05e805caf051cd6930f93f2fb` matches `programs/match-escrow/target/deploy/match_escrow.so`.

## Security invariant

`open` stores the authority account and requires that account to sign. A substituted authority with no signature fails. A valid signature proves that the named key authorized that match. It does not make the program usable only by Sudoku. Another key can open its own match by signing. The app still has to check the account owner, stored authority, players, mint, and stake before it treats the account as a Sudoku room.

Cancel does not require the match authority. After the join deadline a waiting deposit can be refunded by the player. After the settle deadline an active match can be refunded by either player. A second cancel or settle does not move tokens again.

## Legacy rooms

Snapshot: `snapshots/legacy-devnet-before-v2.json`. Read on 26 Sep 2026. No vault held tokens. No match account was waiting or active.

| Room | State | Vault |
|---|---|---|
| UGWU, XVBJ | Staked in D1, no escrow account | none |
| CNNM, FJTY, NNPV | Settled on the legacy program | 0 |
| VFVE | Draw on the legacy program | 0 |
| 3HQ9, GHEG, 74RM | Cancelled on the legacy program | 0 |

Historical rooms were not backfilled. Missing `programId` still resolves to the legacy program. A V2 PDA for the same match id is a different account. Do not point a legacy refund or settlement at the V2 program.

UGWU and XVBJ still have no escrow account and no deposit. The public app now refuses a new legacy open for an unfunded room and tells the player to create a new room. On 26 Sep 2026, `POST /api/rooms/prepare` for UGWU returned "This room expired before it was funded. Create a new room." Their stored match ids were not reused for V2.

## Cutover

A. Deploy V2 to isolated Devnet. Done. Program `937BAWX...`, upgrade authority `6fTc4r...`, staging Worker `sudoku-v2-staging` at `https://sudoku-v2-staging.jamesbitarcade.workers.dev`, D1 `sudoku-v2-staging` (`455d7d3e-682b-47b3-8995-261b31a320d8`). The staging room `T7HP` was deposited, confirmed again after a Worker redeploy, and then refunded after its join deadline. Its vault is 0. Check: deployed hash matches the build, `/api/chain` on the staging host reports staging and the V2 program, and the public host still reports the legacy program.

B. Compatibility reads. In source, a room keeps `programId` for its life. Missing ids stay on the legacy program. Desk instructions take that id. This can ship to the public Worker without changing which program new rooms use, as long as `SUDOKU_STAGING` and `SUDOKU_ESCROW_PROGRAM_ID` are unset there. Check: a legacy room's funds query still reads `HUkhJi8...`, and the public D1 body is not deleted.

C. New public rooms use V2. Done on 26 Sep 2026 for the public Worker `sudoku`. Secrets set: `SUDOKU_ESCROW_PROGRAM_ID` is the V2 program and `SUDOKU_ESCROW_V2=1`. The public match authority stayed `AixXFtny6qq792Pzt8G7ytLbM1eKRXZGSAx91EqBRo7s`. The mint stayed the public Devnet test mint. Staging kept its own authority and mint. `/api/chain` on the public host reports the V2 program, `staging: false`. The staging host still reports `staging: true`.

Live public rooms, all owned by the V2 program, vaults now 0:

| Room | Result | Evidence |
|---|---|---|
| MBAY | Winner, status 2, outcome 1 | Open `2fXmin6nhHzyWYgXTztTUJPXVj8xPKYUe6djMzKQad8FQPFSj24Ags7ELNfyVneE3h7CJGKusgB9Cx5UwXS4dnbP` |
| 86U6 | Draw, status 2, outcome 3 | Worker settlement after the match clock |
| ANQ6 | Unmatched refund after the join deadline, status 3 | `51KdnkbxZxje9dYxvw9TE79EzndThJYfWJ7pDyVMrgssuvssQAUULNnviT3hdxL8vFteUx3raurztzAeiSZinv1y`. The same signed transaction was submitted again and did not pay twice. A Worker deploy ran after the transaction was sent. |
| JWCM | Deadline refund, status 3, player-signed, no match authority | `6AkwJBRc4U4hACXcHCAPSHEgV2iTaXv7zG2qD15vF3zZXespmb3mYVNFx3jB7iQhD3dcJdr8pMzURkTx6kpCBQW` |

NNPV remains settled on the legacy program. 74RM remains refunded on the legacy program. UGWU and XVBJ remain unfunded legacy rows.

D. New hosted opens no longer use the legacy program. A funded legacy room can still settle or refund on the legacy program. An unfunded legacy room is expired in the UI instead of being retargeted.

E. Legacy support stays. The 26 Sep 2026 re-read still found no legacy vault with tokens and no waiting or active legacy match. Historical settled and cancelled accounts stay on the legacy program.

Rollback of A is to ignore the staging Worker. Do not close the V2 program if it holds a balance. Rollback after C is not "restore Worker `a3cd73b4`". That older bundle rejects a V2 program id at startup. The public Worker must keep resolving both program ids. Removing `SUDOKU_ESCROW_V2` stops new V2 rooms only after every V2 vault is confirmed empty. Do not transfer vault balances from one program to the other. Do not change a room's `programId`.

An old transaction confirms against the program id inside it. Confirmation must read that room's original program. Do not change `programId` after the deposit transaction is built.
