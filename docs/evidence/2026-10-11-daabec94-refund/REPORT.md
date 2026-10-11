# DAABEC94 physical Devnet refund — 11 October 2026

Owner approved the refund in Seed Vault on the connected Seeker. Finalized chain evidence verifies the entrant E3DQ…DpJn received 1,000,000 base units (1 Soldoku token): wallet 20 → 21, escrow vault 1 → 0, entry claimed=true.

Signature: `4sN5aNXedP2JwYa5yZXXsqYQrhFJ6cpwFzexRWYn2gLzNAjpWTNeugdBuuyevgKheA39YXgwDxwWo2Qgx2xzjr9D`, finalized slot 509743002. Fee: 45,000 Devnet SOL lamports. This closes the previously outstanding extended-room test stake.

Funding stayed paused throughout. No Mainnet, program/deadline change, storage clear, or signing on the owner's behalf. Earlier message/refund requests timed out; chain was rechecked before the fresh request. Restarting Soldoku preserved storage and loaded the new Soldoku labels.

`chain-before.json` and `chain-after.json` contain finalized entrant, vault, balance, and transaction evidence. Physical UI snapshots record the verification and approval-return flow. No additional duplicate transaction was submitted in this round; claimed=true and empty vault were verified.

Live runtime remains b13e18d; this commit adds evidence only.
