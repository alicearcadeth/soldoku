# Seeker relay compute-budget diagnosis

Physical diagnostic room 1B501B07 on dc186d9 returned: `Unrelated instructions cannot be relayed by the competition API (program ComputeBudget111111111111111111111111111111).`

No phone deposit was broadcast. The opponent's solo 1 TEST stake was refunded after registration closed; finalized receipt and empty vault are in chain-state.json. Both TEST balances returned to their starting values.

A serialized, signed transaction regression reproduced this rejection before the fix. The relay now permits only account-free SetComputeUnitLimit and SetComputeUnitPrice instructions, with exact encodings, no duplicates, a 1..1,400,000 compute-unit limit and a maximum optional priority fee of 0.001 SOL. Existing wallet, room, stake, destination and unrelated-program validation remains in place. Unsupported compute variants remain rejected.

Local verification: 308 passed, 6 skipped; TypeScript and production build passed. Physical validation of the corrected relay remains pending at this checkpoint. This is not an end-to-end funded pass.

Fee calculation follows https://solana.com/docs/core/fees. The ceiling excludes base transaction fees and account rent.
