# BFF6D992 refund Δ0 clarification

Evidence source: `docs/evidence/2026-10-09-scheduled-refund/results.json` (controlled Devnet refund round on deployed `f4619a4`).  
Read-only chain re-check on 9 October 2026 (genesis `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`). This is documentation of **existing** receipts — not a new funded room.

## Meaning of Δ0

`refund.delta: "0"` is the **net** TEST balance change across **deposit + refund** for wallet `JCVsKd4TMg1fvEs7rjf5YgLYbJfNC8Dwb4x1PchFkGM7`.  
It does **not** mean the refund transfer moved zero tokens. The refund claim transferred **+1000000** TEST back to the wallet.

## Receipts and balances

| Step | Amount (TEST base units) | Signature / note | Wallet TEST | Vault TEST |
|------|--------------------------|------------------|-------------|------------|
| Starting balance | — | `balancesBefore` in results.json | **34000000** | (empty / not yet funded) |
| Deposit | **−1000000** | `2ichTi5ktsZWsXFQtGMRppvETnVDs8f5j6KY7LZK4Ee6cor6bFUjYjyP7H484xVU1F6U7dXVwAV4PGZ6LpLQNP1J` (finalized) | 33000000 | 1000000 |
| Refund claim | **+1000000** | `5s42HnGAyankYazYnZpX3QfscR1K7k8n9DbNWRwni1F96oXd8ySBg67Np3cr8cWEjiG1zmMXFArJB9Z1iJ33nCwP` (finalized) | **34000000** | **0** |
| Net (deposit+refund) | **0** | `refund.delta: "0"` | Δ0 vs start | empty |
| Duplicate claim | **+0 additional** | API 400: “Your escrow claim is already complete.” | 34000000 | 0 |
| Ending balance | — | `balancesAfter` in results.json | **34000000** | **0** |

- Stake: **1000000** base units (1 TEST), mint `BtdrgokAvXQE4yj3zS48c4ktnMSy3TGoRkHCWD5fV8U4`
- Room: `BFF6D992` · escrow PDA `Hd68PRzu2iaKdjqqDYnPcdTLUqf9yqzYyPZ4kkrDf2Ci` · vault ATA `9WkUXUfrPhD8rD8Dnct2zSaR7PTjv2ovv4rZ1chBz5wY`
- Both on-chain txs finalized with `err: null` on re-check; vault ATA balance observed **0** after refund
