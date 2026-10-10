# Physical creator retry — 10 October 2026

Hosted runtime: `88a40f8e49591e8d3c69bf395a6ac5186207e3fe`. Devnet only. No runtime changes or deploy during this round. Funding was opened for a bounded window and restored to paused after the finalized deposit.

## Verified

- Physical creator room `E0FD563E`, 1 TEST, five-minute registration plus the existing 30-second buffer. The play/grace periods remain 30/60 minutes.
- Seed Vault approval opened and deposited on-chain. Signature `2nVLDty6vdBUa7KwmAC376CVBmTvc4js6iJgJiRsvF5ne9KvG27qa3xwf7RMVqRWeeQYC8HSwXC6QBDUvfXwzPT8` is finalized with no error.
- Phone wallet `E3DQypoRXpB47tgSNdjdWgjvVyn3PYPHLut5j2S7DpJn`: 20,000,000 → 19,000,000 TEST base units. Vault: 1,000,000. One confirmed entrant.
- Config was verified `paused: true` after deposit; automatic window controller exited with `PAUSE RESTORED`.

## Refund and duplicate replay passed

After registration closed at 2026-10-10 09:54:15 ICT, the owner approved the physical Seed Vault refund. Signature `LahmYWtBzrgG8yF9jgqzZviqcTn4WXMU78sakHvfxcFSCFscN1QP9UUzsAuQSncWS9MVs3w2eqxr3Hb6SvPzxEz` finalized with no error. Wallet: 19,000,000 → 20,000,000. Vault: 1,000,000 → 0. Soldoku displayed `Your claim is complete.`

The already-finalized raw transaction was retrieved from Devnet and resubmitted without creating or signing a new transaction. Replay transferred zero additional TEST and the vault remained empty. See `physical-refund-replay.json`. This proves finalized-byte replay protection; a newly signed second refund was not requested.

The room's deposit/refund net TEST delta is zero. Network fees and rent are separate and are not returned by this program. Funding remains paused.

## Earlier attempts: do not conflate

`DAABEC94` was actually approved, not rejected. The owner clarified this. A second finalized wallet transaction extended registration one day. Its 1 TEST remains in escrow and the solo refund becomes available at 2026-10-10 23:04:06 ICT.

`110FBE65` cancellation without signing left the balance unchanged at 20,000,000, no escrow account, and zero entrants. After returning and touching Soldoku, the busy state cleared in about eight seconds with `session timeout`. A subsequent approved transaction returned signature `5AfxV1HswTx97cZNxjsd1RSnZrJBJQgAMKzyydLizbHrWHM6hC9y4NCM7sHFVDXahCG4oiHRzPDWRLvzPeUSfFGB`, but it was absent from chain history when checked on 10 October and that room retained zero entrants. That retry is not a pass. Its old pending local receipt was not cleared or altered. Successful approval in this new room does not establish recovery from that old pending receipt.

Evidence from the prior attempts is in `../2026-10-09-seeker-creator-rejection/`. No storage clearing, wallet data clearing, program upgrade, Mainnet operation, or card-provider activation was performed.
