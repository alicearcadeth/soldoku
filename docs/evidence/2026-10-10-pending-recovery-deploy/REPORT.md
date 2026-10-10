# Pending recovery deployed and checked physically

Owner explicitly authorized deploying runtime `795e6d190cad968d04919fcc61cbdcd6244f6d23` while retaining funded-entry pause.

## Live release

- Worker version `49c50ff6-fdb9-484e-9de8-49967cd0fbb5`.
- Both soldoku.com and www.soldoku.com: commit `795e6d1`, `dirty: false`, expected JS SHA-256 `c13b1a68bb43e0687527151ad8f56a00ac33f89cbfd496948de08b76b35f83bd`.
- Documents retain script-src self + boot-script SHA-256, frame-ancestors none, nosniff and no-referrer.
- Competition config remains paused and Devnet. Card POST remains 403. Program/mint and play/grace configuration unchanged. No new deposits requested.
- Pre-deploy D1 export: `C:\Soldoku-reconstruct\backups\d1-before-795e6d1-20261010.sql`, SHA-256 `e0912ec1203c9e8a8f6f9b291cf8768831677224af869ae1a9d4e7b1f80680b1`. Export checkpoint `00000715-00000012-00005100-5cdc9d7ed6769d99cb1c9ff817004141`. No database restore or schema migration.

## Physical old receipt

The Seeker was restarted with force-stop/start, preserving storage. Original wallet E3DQ…DpJn remained connected. Opened closed room `110FBE65` and observed the new Check pending transaction button for the old unresolved receipt.

One click, without wallet signing or transfer, produced: `The earlier transaction did not land. Its receipt is kept. You can retry if registration is still open; otherwise use a new room.` The pending check disappeared after terminal reconciliation. Force-stop/start again restored the same room without the pending check; a Home check confirmed the original wallet was still connected. Evidence: phone-pending-before.xml, phone-recovered.xml, phone-restarted.xml, phone-wallet-restarted.xml.

The first restart dump still showed a loading view and was not accepted as a pass; the saved restarted evidence was replaced only after the actual expected room loaded.

Wallet TEST remains 20,000,000 units. Old signature `5AfxV1HswTx97cZNxjsd1RSnZrJBJQgAMKzyydLizbHrWHM6hC9y4NCM7sHFVDXahCG4oiHRzPDWRLvzPeUSfFGB` remains absent from chain history; room has zero entrants. Closed registration still forbids a new deposit there. No cache/storage clearing, second approval, program upgrade, Mainnet operation or card execution.

This closes the actual stuck-receipt recovery check. Explicit fresh-signature retry after chain-confirmed expiry is covered by the real browser UI with a test wallet/mocked API, not an additional funded phone room in this deployment. Prior physical creator/payout/refund evidence keeps its original release identity.

## Outstanding refund

DAABEC94 still has its single 1-TEST stake after a signed one-day extension. It unlocks 10 October 2026 at 23:04:06 ICT. One-time follow-up at 23:05 ICT will check chain state and ask for the owner's Seed Vault approval. Not refunded yet. Funding remains paused.

Clean-release verification: 316 tests passed, 6 integration tests skipped, clean install/build passed. General unattended-production limitations and dependency advisories remain; this release does not establish Mainnet or real-money readiness.
