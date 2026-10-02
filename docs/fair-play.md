# Fair play

This is a product limit, not a claim that matches are provably human.

## Threat

The puzzle is the givens. Those cells are visible and are returned with the room. An external solver can fill the grid. The in-game Smart Hint is already withheld in Compete. That does not matter to a second program.

A local test client has already done this on hosted Devnet: it solved the public givens and entered one correct cell at a time. The server accepted the finish because the gaps were at least 400 ms and the match lasted at least 15 seconds. The same path is available to anyone who can call the move API. No public answer endpoint was added. `GET /api/rooms/solution` stays closed unless the process is localnet and the reveal secret matches. The hosted Worker secret list does not include that secret.

Other realistic cases:

- A person copies the grid into a solver and types the digits back. Timing looks ordinary.
- Two wallets, or two people, agree that one will lose. The server sees a normal finish.
- A player leaves. The tokens stay in the vault until the settle deadline, then either player can cancel and both stakes return.
- The worker chooses the winner. A leaked match-authority key can settle an active room to either side. The program will not settle a room that is not active, and it will not pay a settled room twice.
- The slider is issued by `POST /api/captcha`, and the response includes the target the notch shows. A script can submit that value. The slider stops a casual mis-click. It does not prove the later moves were made by a person, and it does not stop an external Sudoku solver.
- Practice no longer shows that slider. A free create, quick match, or join with an empty captcha id is limited to 12 opens per minute in that Worker isolate, and the lobby still holds at most 24 waiting rooms. A paid room still has to pass the slider because it creates an escrow room. Sending a captcha id, or a wallet, still consumes the check.

## What the server can say

Preventive: one cell per move, givens stay fixed, filled cells stay fixed, a finish must match the stored solution, and a finish inside 15 seconds or with fewer moves than empty cells is rejected. The opponent's cells are not included in the room view. A deposit is recorded only when the on-chain account owner, stored authority, mint, stake, and seated player match the room. New public rooms use Escrow V2, which requires the named authority to sign the open. The legacy program still accepts an open whose authority did not sign. The hosted app does not build those opens anymore. A custom client can still call the legacy program directly. That does not move an existing Sudoku room onto a different program.

A finish between 15 and 25 seconds is stored on the private audit row as `fastFinish`. The finish is still accepted. The flag is for a later review. It does not move the stake, and it is not returned by the public room view.

Not distinguishable: a person using a solver and typing at a human pace, or two friends arranging a loss.

No model in this app should void a stake or pick a winner. The result stays the server's comparison of the two boards. A dispute is a person looking at the retained room result, the wallet addresses, the completion time, and the escrow signature.

## Staked competition

Free Practice can keep the current race. It is a timer, and an outside solver does not take money.

Real-value Staked Competition should stay off until the owner publishes rules, names who can review a contest, and accepts that a solver cannot be ruled out. The minimum before any Mainnet stake:

- Rules that state the server result is the result, and that an outside solver is possible.
- The compact history already stored: mode, room, level, result, time, and chain outcome. No board archive and no device fingerprint.
- A written way to contest a match, and a named person who can answer. That person cannot rewrite a settled escrow. A settled payment stands unless a later legal process says otherwise.
- If a match cannot be finished, the existing deadline cancel returns both stakes. Use that path. Do not add a private confiscation tool.
- A legal review for the places the owner intends to offer real stakes.

The owner has to accept the remaining risk in writing. Passing the slider, or finishing slowly, is not that acceptance.

## Measured on 28 September 2026

The room view returns the givens and does not return the solution. `GET /api/rooms/solution` still answers only on localnet when the reveal secret matches. The generator's own solver, `countSolutions`, confirms a unique solution from those givens. On this machine an easy seeded puzzle was solved in well under a second. That measurement is in `src/match/fairPlay.test.ts`. It is not a client and it is not shipped.

The move API then accepts one changed cell at a time, at least 400 ms apart, and rejects a finish before 15 seconds or before every empty cell has been posted. Expert puzzles keep 22 to 28 clues, so they have 53 to 59 empty cells. At 400 ms each, a script needs about 21 to 24 seconds of spaced posts. The expert clock is 40 minutes. The 15 second floor does not bind once the empty-cell count is above 38. A script can solve first, then post the digits on that cadence. The server cannot tell that cadence from a person who already knows the digits.

`SUDOKU_FUNDING_PAUSED=1` refuses a new paid room without a program upgrade. It does not make the race human-only. Real-value staking stays gated on a product and legal decision that this limit is acceptable.
