# First Mainnet DFlow and escrow test

Do not run this until the owner has approved Gate A and Gate B. It is not a public launch.

## Labels

The rehearsal already completed used four separate kinds of evidence:

- A real DFlow production quote for 0.01 SOL, with no transaction requested.
- A real unsigned DFlow transaction for the public test wallet, inspected and not broadcast.
- Localnet escrow execution of the production program artifact, including Close.
- Mainnet read-only account and genesis calls. No Mainnet transaction was sent.

## Procedure

1. Confirm the program `4GqmVjmNLwfJ8UrtGTV9C2RZAqNqRiaGGmCsKRX7EKMH` is on Mainnet and its upgrade authority is `7pxUUSe4jNiN4bwV6a4gtaLwfpz5JBseHGC9j2mvwzW7`.
2. Use a fresh wallet that holds a little SOL and no unrelated tokens. Do not use a personal wallet.
3. Request a SOL to USDC order for the smallest input that the quote says will clear 1 USDC after slippage. On 28 September 2026, 0.01 SOL quoted about 1.1859 USDC with a minimum of about 1.179971 USDC. Re-quote at test time. If the minimum is below 1 USDC, stop.
4. Inspect the unsigned transaction. Stop if the fee payer, mints, recipient, or programs do not match the validator.
5. Sign and send that one swap. Record the signature. If the result is unknown, look up that signature. Do not send a second swap.
6. Confirm the wallet's USDC balance increased by at least the room stake. If it did not, stop.
7. Open one room at the approved stake and deposit that USDC. If the deposit is rejected or unknown, keep the USDC in the wallet and submit the same deposit again only after its signature is confirmed absent. Do not swap again.
8. Confirm the vault balance equals the stake and the room record matches the deposit signature.
9. Finish or cancel only under the written test plan. Close only after the vault token balance is zero. The opener receives the match rent and the empty vault rent, minus the close fee.

## Stop conditions

- The quote minimum is below the stake.
- The inspector rejects the transaction.
- The swap signature is unknown.
- The wallet did not receive USDC.
- The deposit signature is unknown.
- Any account owner, mint, or program id differs from the production config.
