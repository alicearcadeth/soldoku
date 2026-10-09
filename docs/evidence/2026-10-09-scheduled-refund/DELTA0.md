# BFF6D992 refund Δ0 clarification

Read-only Devnet verification on 9 October 2026 (genesis `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`).

## Meaning of Δ0

`refund.delta: "0"` in `results.json` is the **net** TEST change across deposit **plus** refund for wallet `JCVsKd4TMg1fvEs7rjf5YgLYbJfNC8Dwb4x1PchFkGM7`. It is **not** “the refund transferred zero tokens.”

## Chain observations

| Step | Signature | Wallet TEST | Vault TEST |
|------|-----------|-------------|------------|
| Before deposit (evidence) | — | 34000000 | — |
| After deposit | `2ichTi5ktsZWsXFQtGMRppvETnVDs8f5j6KY7LZK4Ee6cor6bFUjYjyP7H484xVU1F6U7dXVwAV4PGZ6LpLQNP1J` | 33000000 (−1000000) | 1000000 |
| After refund claim | `5s42HnGAyankYazYnZpX3QfscR1K7k8n9DbNWRwni1F96oXd8ySBg67Np3cr8cWEjiG1zmMXFArJB9Z1iJ33nCwP` | 34000000 (+1000000) | 0 |
| Net (deposit+refund) | — | **Δ0** | empty |
| Duplicate claim | API rejected: “Your escrow claim is already complete.” | no further transfer | 0 |

Room escrow PDA: `Hd68PRzu2iaKdjqqDYnPcdTLUqf9yqzYyPZ4kkrDf2Ci`  
Vault ATA: `9WkUXUfrPhD8rD8Dnct2zSaR7PTjv2ovv4rZ1chBz5wY` (balance now `0`)

Stake amount: **1000000** base units (1 TEST). Both transactions finalized with `err: null`.
