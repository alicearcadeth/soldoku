# Physical no-finish refund result

Room E571262D was created/funded on eb14d0d and claimed on live 88a40f8. Two 1-TEST deposits finalized; nobody finished. The scheduled 21:45 ICT cron settled it for refunds, finalized on-chain; the 21:50 cron confirmed the receipt and cleared the alert.

Opponent refund finalized, +1 TEST. Owner used the physical Seeker to approve refund 2ELDT3Hk95PdjguZDpaXuBF17taRf68dpbLTKR2qjxGKEMxFg8DdYKHyjeqj2y8aAfwu2TDmVfkxXA3HdKtU4DkF, finalized, +1 TEST. Vault is empty. The exact phone refund bytes replayed with zero additional payment; repeat opponent claim preparation was rejected, delta 0.

See ../2026-10-09-seeker-relay-fixed-physical/REPORT.md and physical-claim-replay.json for the full ledger and limitations. Funded entry remains paused; card and Mainnet remain off. The room's persistent refunding status does not imply outstanding tokens: both entrants have reclaimed and vaultAmount is zero.
