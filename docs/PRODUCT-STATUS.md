# Soldoku product status — 2026-10-09

Current snapshot; historical evidence preserves the release tested at that time.

## Release and preservation

- Deployed on soldoku.com and www: `eb14d0d8b733fc7d4dd00a583a5ff9c867ab6836`, clean release, Worker `c34e7a66-0a95-4cc5-bac5-7ef7ed469457` before pause-secret updates. Both domains' release manifests and all 14 manifest assets verified.
- Source is pushed to private `alicearcadeth/soldoku`; latest docs may be ahead of the deployed runtime.
- Backup bundle: `C:\Soldoku-reconstruct\backups\soldoku-seeker-relay-eb14d0d.bundle`, verified complete history.
- Pre-deploy D1 export: `C:\Soldoku-reconstruct\backups\d1-before-eb14d0d.sql`, SHA-256 `82f4579032627b0948058371bc12a370e0bc86c093936595355d50ff75ae06d8`; bookmark `00000694-00000002-000050ff-e6bdf49ec5c2dda2b5e4787be4dd3a76`. No restore performed.
- Existing APK `com.sudoku.game` 0.1.0, SHA-256 `bf427627…`, loads the hosted release; no reinstall or storage clear.

## Availability

Classic, Practice and free competitions remain available. New funded rooms and deposits are paused after the bounded physical deposit windows. Claims, refunds, settlement and reads remain available. Card execution is disabled (POST 403). Mainnet and real payments remain off.

## Current verification

- Get-wallet return fix is deployed. Earlier physical wallet connection and free-message authorization passed; evidence retains its original release identity.
- Stake presets are centered and labeled Soldoku, with custom amount entry; this display name does not change the Devnet mint or give TEST cash value.
- Seed Vault initially rejected a Devnet request while configured for Mainnet. The owner switched the wallet to Devnet.
- Physical signing then exposed relay rejection of the wallet's added Compute Budget instructions. Room `1B501B07` reproduced the exact program rejection on `dc186d9`; the phone spent no stake and the opponent's solo stake was refunded, vault empty.
- Release `eb14d0d` permits bounded, account-free compute limit and priority price settings. Wallet/room/amount/destination/action checks and unrelated-instruction rejection remain. Clean checkout: 308 tests passed, 6 opt-in tests skipped; build passed.
- Physical 1 TEST deposits in `FE65DD6D` and `E571262D` finalized on `eb14d0d`, each vault holding 2 TEST. Game completion, scheduled settlement and physical claim/refund are still in progress at this checkpoint.

## Remaining limits

Physical funded testing is not complete until claim/refund finalization and empty-vault checks finish. Existing broader limits remain: skipped integrations, dependency advisories, no live D1 restore rehearsal, solver/collusion resistance, and no real-money/provider approval. This Devnet test does not establish unattended or Mainnet production readiness. External invites have not been sent.

## Evidence

- `docs/evidence/2026-10-09-seeker-relay-fix/`: rejection, red/green regression and diagnostic refund.
- `docs/evidence/2026-10-09-seeker-relay-fixed-physical/`: phone deposit and winner journey.
- `docs/evidence/2026-10-09-seeker-relay-fixed-refund/`: phone deposit and no-finish refund journey.
