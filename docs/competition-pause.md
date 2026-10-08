# Competition pause

`SUDOKU_COMPETITION_PAUSED=1` stops new funded rooms and deposit relays. Claims, refunds, settlement, and recovery stay available. Free rooms are unchanged.

The pause does not freeze a direct on-chain join. Program `6uuszYMoZ2bBX8oVccpYPUgdhW6CSvASziN2m8LpJxYs` still accepts a join while the room is open. Stopping that requires a program upgrade, which this change does not make.

Leave the variable unset for normal Devnet operation. Do not use it as a Mainnet switch. Mainnet stays disabled.
