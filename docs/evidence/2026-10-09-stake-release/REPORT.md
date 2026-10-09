# Authorized stake and wallet UI release

Deployed source: `0b3055bebe3d700c7c77fc869214261ab05d8817`, clean isolated checkout at `C:\Soldoku-reconstruct\release-0b3055b`.
Worker: `1257f47f-8465-4570-bd5f-a8d51f4b57a6`.
Previous paused release: `d9a182a90f00487c5a08506f0db3a5987207b9fe`, Worker `b7bda8cd-da56-43b8-b373-1c849226e3a3`.

## Verification

- Clean npm install, 306 tests passed / 6 skipped, TypeScript and production build passed. Skipped integrations are not verified by this release run.
- `verify-release.mjs` passed on soldoku.com and www.soldoku.com: release metadata and all 14 files match the clean build and GitHub source.
- JS `/assets/index-B1OcjSw9.js`: SHA-256 `1f8d0b58c0dfa25446eb459f2096402306629c8ed34941e8edd3c2c9c38ba831`.
- CSS `/assets/index-kysR4Rwb.css`: SHA-256 `41382a06bfe4e1500b15dd916f60258fb5590936e6b4702e9dfaa02bee96f9cc`.
- Live Chrome on both domains: centered presets, Soldoku amount labels, custom 3 and 10, funded-create button disabled, Devnet paused config, no card simulation, card POST 403, document script CSP. See browser.json and domain screenshots.
- The initial live browser harness wrongly assumed the supported token was selected. It timed out while SOL was selected; the corrected harness explicitly chooses Soldoku Token before asserting its labels. No product change was needed for this harness assumption.
- Physical Seeker: force-stop/relaunch preserved the existing Classic game. Home still offered Continue. No storage or cache clearing or reinstall.
- Physical disconnected-wallet screen offered Mobile Wallet Adapter and mobile guidance, with no Get-wallet links. See seeker-wallet-choices.xml.
- MWA opened Seed Vault. Owner approved connection. App returned to Soldoku home displaying `E3DQ…DpJn`, without the wallet sheet or a hanging spinner. This verifies connection, not a fresh competition message signature or transaction.
- Physical token-create view showed 1/2/5 Soldoku presets, the custom-amount hint, and accepted 10 with summary `10 Soldoku`. See seeker-custom-10 screenshot/XML.

## State and boundaries

Funding pause remains true; cluster remains Devnet; card execution remains disabled. No program upgrade, token movement, funded room, or competition settlement was performed in this release verification. Physical funded deposit/payout/refund validation remains outstanding and requires a bounded unpause authorization.

Soldoku is a display label. The mint, TEST symbol, precision and escrow rules were not changed. Devnet/no-cash-value notices remain visible.

## Checkpoint

Pre-deploy D1 bookmark: `0000068f-00000000-000050ff-8ded90f5026112c1d43ca22be9bdebea`.
Export: `C:\Soldoku-reconstruct\backups\d1-before-0b3055b.sql`, SHA-256 `401f24bb39d82f8c750355667fd42783ff9d9e649c35ae37cdf71b2b79ff9906`.
Export was not restored. It remains outside GitHub. Do not restore older financial state as a deployment rollback.
