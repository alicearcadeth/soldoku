# UI before and after

Baseline shots: `docs/ui-baseline/`. Experimental shots: `docs/ui-after/`. Both use a 400×890 CSS viewport unless the filename says otherwise. The Devnet presentation was forced in the screenshot harness with a mocked `/api/chain` response so the local server’s localnet flag did not hide the disclosure. Android shots are from emulator `emulator-5554`, Chrome, `http://10.0.2.2:5173/`.

| Screen | Before | After |
| --- | --- | --- |
| Home | `docs/ui-baseline/01-home.png` | `docs/ui-after/01-home.png` |
| Difficulty | `docs/ui-baseline/02-difficulty.png` | `docs/ui-after/02-difficulty.png` |
| Classic | `docs/ui-baseline/03-classic.png` | `docs/ui-after/03-classic.png` |
| Paused | `docs/ui-baseline/03b-paused.png` | `docs/ui-after/03b-paused.png` |
| Practice | `docs/ui-baseline/04-practice.png` | `docs/ui-after/04-practice.png` |
| Compete, disconnected | `docs/ui-baseline/05-compete-disconnected.png` | `docs/ui-after/05-compete-disconnected.png` |
| Compete, connected | `docs/ui-baseline/06-compete-connected.png` | `docs/ui-after/06-compete-connected.png` |
| Stake picker | `docs/ui-baseline/07-stake-picker.png` | `docs/ui-after/07-stake-picker.png` |
| Waiting | `docs/ui-baseline/08-waiting.png` | `docs/ui-after/08-waiting.png` |
| Wallet pending | `docs/ui-baseline/09-wallet-pending.png` | `docs/ui-after/09-wallet-pending.png` |
| Result | `docs/ui-baseline/10-result.png` | `docs/ui-after/10-result.png` |
| Profile | `docs/ui-baseline/11-profile.png` | `docs/ui-after/11-profile.png` |
| Offline | `docs/ui-baseline/12-offline.png` | `docs/ui-after/12-offline.png` |
| Widths 360, 390, 412, 480, 600, 840, 1280 | `docs/ui-baseline/width-*.png` | `docs/ui-after/width-*.png` |
| Landscape classic |  | `docs/ui-after/13-landscape-classic.png` |
| Android Chrome |  | `docs/ui-after/android-chrome-home.png`, `android-chrome-difficulty.png`, `android-chrome-classic.png`, `android-chrome-entered.png` |

## Home

- Before. Two cards. The introduction mentions Devnet test tokens before Practice exists as its own action.
- After. Play classic, Practice, and Compete are separate. A compact badge still says `DEVNET · TEST TOKENS · NO CASH VALUE`.
- Why. The puzzle and the free race are the product. The badge keeps the disclosure without leading the sentence.
- Reference. Task-before-wallet hierarchy from the Solana Mobile samples.
- Benefit. A first visit can choose a free game without parsing a stake.
- Tradeoff. Home is slightly taller. The badge is still on the first screen, on purpose.

## Practice

- Before. Heading “Compete”, then a Devnet line on a free race.
- After. Heading “Practice”. The first sentence says it is free and needs no wallet. The same badge remains.
- Why. The title was describing the other mode.
- Reference. Separate free and funded actions.
- Benefit. No wallet prompt on the free path.
- Tradeoff. The badge is still visible on a screen where no tokens move. Hiding it would violate the disclosure rule.

## Compete

- Before. The fee, rent, and SOL paragraph is the first thing. Connect wallet is a secondary button. The address replaces that button. Balance says “room tokens”.
- After. The race sentence comes first, then the disclosure paragraph, the badge, the selected stake, and a primary Connect wallet button. A connected wallet is a status row: `Wallet JCVs…kGM7 connected`. Balance says the test tokens are in the wallet and are not a match deposit. Connecting adds “Approval continues in your wallet.”
- Why. Players were reading escrow mechanics before they knew it was a race, and the balance line sounded like the match was funded.
- Reference. Seeker Connect’s “continue in your wallet” progress state, adapted to the existing Mobile Wallet Adapter flow. Wallet UI’s separated connected and pending states.
- Benefit. The next action is obvious, and a wallet balance is not an escrow deposit.
- Tradeoff. The fee paragraph is still long. It stays visible because those sentences are the disclosure, including “This beta does not convert SOL.” Folding them into a closed control would make them easier to miss.

## Deposit label

- Before. “Deposit stake”.
- After. “Deposit stake · approve N test token(s)”, or “Check deposit” when a signature is already stored.
- Why. The amount should be on the button that asks the wallet to approve.
- Reference. Specific action labels rather than a vague continue.
- Benefit. The player sees the amount at the approval step.
- Tradeoff. None for logic. The button still contains the words “Deposit stake”.

## Offline

- Before. “Loading…” forever when the lobby captcha cannot load.
- After. “You are offline. That action was not saved.” with Try again and Back.
- Why. The fetch error was ignored.
- Reference. An error state with a way out, as in Seeker Connect’s dialog, using Sudoku’s existing sentence.
- Benefit. The lobby can recover.
- Tradeoff. None.

## Board, result, waiting

- Before and after are the same puzzle screen. Controls are at least 48px. Grid cells stay about 41 CSS px at 400px width so the board does not scroll sideways.
- Waiting still shows the code, the opponent state, and the grid.
- The solved sheet is unchanged aside from a scroll limit on short screens.
- Why this was not restyled. The board was already the calm part of the app.
- Tradeoff. Cells are under 48px. That is the width of nine columns, not an oversight.

## Android

Emulator Chrome at 1080×2400 shows the new home, the difficulty list, the Easy board, and a placed digit. The number pad ends above the navigation bar. Entering 1 updated the selected cell, turned the conflict red and underlined, and raised Mistakes to 1. This is Chrome on the emulator, not the submission Web Shell. The shell was not rebuilt.

## Widths

Home at 360, 390, 400, 412, 480, 600, 840, and 1280 did not grow wider than the viewport (`scripts/ui-check.mjs`). `?theme=classic` sets `data-theme="classic"`.
