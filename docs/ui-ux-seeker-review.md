# Seeker UI/UX review

Reviewed the working Sudoku app on branch `ui/seeker-polish` before the experimental polish. Baseline commit `9c6bceedfa664f60e8ef7943694c276fcfb38eb3`, tag `ui-baseline-pre-seeker-polish`. Screenshots are in `docs/ui-baseline/`. No Solana Mobile, Wallet UI, shadcn, or Credenza code was copied.

The app already feels like a paper puzzle, not a DeFi dashboard. The board, number pad, and bottom sheets should stay. The problems are hierarchy, wallet-state wording, and one stuck loading screen.

## Home

1. Current behavior. Home centers “Paper grid”, “Sudoku”, one paragraph, and two cards: Play classic and Compete. The paragraph’s second sentence is about Devnet test tokens. Practice is only a sentence inside the Compete card. Evidence: `docs/ui-baseline/01-home.png`, `width-360-home.png`, `width-1280-home.png`.
2. Actual problem. A first visit introduces money before the three ways to play. Practice is easy to miss.
3. Screenshot. `docs/ui-baseline/01-home.png`.
4. Reference. Solana Mobile samples put the task first and the wallet second. shadcn’s composition rule is one primary group, then secondary choices. Not a visual copy.
5. Why it fits Sudoku. Classic, Practice, and Compete are the product. The wallet is not.
6. Why it is better. Three labeled entries match the way the app actually works.
7. Expected benefit. A new player can start a free puzzle or a free race without reading a stake sentence.
8. Mobile/Seeker benefit. The choices are full-width cards, reachable without hunting inside Compete.
9. Accessibility. Each mode is its own button, so the name is “Play classic”, “Practice”, or “Compete” instead of one mixed card.
10. Technical cost. A route mode flag. No new dependency.
11. Regression risk. Scripts that click “Compete” and expect Practice must click Practice. `scripts/player-qa.mjs` was updated. Other scripts already click Practice or Staked after Compete.
12. Recommendation. Redesign the home choices. Keep the paper look.

## Classic board

1. Current behavior. The grid fills the width. Timer and mistakes sit above it. Undo, Erase, Notes, and Hint sit under it. The number pad shows remaining counts. Evidence: `docs/ui-baseline/03-classic.png`.
2. Actual problem. Text controls were 44px tall. Grid cells are about 41 CSS px at a 400px width because nine columns plus padding cannot be 48px without horizontal scrolling.
3. Screenshot. `docs/ui-baseline/03-classic.png`, `10-result.png`.
4. Reference. Android touch guidance is about 48dp. A 9×9 grid on a 360–412px CSS viewport cannot meet that without overflow.
5. Why it fits. The pad is the repeated control. The cells are the puzzle surface.
6. Why it is better to keep cell size. Overflow would make the board feel broken. Larger pad targets fix the controls that are pressed over and over.
7. Expected benefit. Notes, Undo, Hint, Pause, and Home are easier to hit. The grid stays readable.
8. Mobile/Seeker benefit. Landscape still scrolls instead of clipping the pad (`docs/ui-after/13-landscape-classic.png`).
9. Accessibility. Focus rings were missing. Color is not the only mistake signal: conflicts are underlined and the mistake count is text.
10. Technical cost. CSS only.
11. Regression risk. Low. Puzzle rules are untouched.
12. Recommendation. Small polish for controls, focus, and sheet scrolling. Keep the board geometry.

## Practice

1. Current behavior. Practice and Staked share the heading “Compete”. The free explanation is good, then a DEVNET line appears even though no tokens move. Evidence: `docs/ui-baseline/04-practice.png`.
2. Actual problem. The screen title says the race costs something. The disclosure is doing the talking.
3. Screenshot. `docs/ui-baseline/04-practice.png`.
4. Reference. Seeker samples separate a free action from a funded action. The disclosure itself stays, from Sudoku’s own beta rules, not from those apps.
5. Why it fits. Practice is free and needs no wallet. The app is still a Devnet beta, so the badge cannot disappear.
6. Why it is better. “Free. No wallet required.” comes first. The badge is secondary.
7. Expected benefit. Someone opening Practice is not asked to connect a wallet.
8. Mobile/Seeker benefit. The free path is a home card, not a tab buried under a stake essay.
9. Accessibility. The heading is “Practice”.
10. Technical cost. Copy and heading only.
11. Regression risk. Low. Room creation is unchanged.
12. Recommendation. Redesign the title and order. Keep the badge.

## Compete and money

1. Current behavior. Staked mode opens with a paragraph about rent, SOL, room tokens, and fees, then the race rules, then a secondary Connect wallet button. Stake buttons show 1, 2, and 5 with no sentence that this is not yet a deposit. A connected wallet is the button label `Wallet abcd… connected`. Balance text says “room tokens”, which sounds like escrow. Evidence: `docs/ui-baseline/05-compete-disconnected.png`, `06-compete-connected.png`, `09-wallet-pending.png`.
2. Actual problem. The screen starts as an escrow note. “Connecting wallet” does not say that approval continues in the wallet. Wallet balance and match escrow can be confused.
3. Screenshot. The three files above, plus `11-profile.png`.
4. Reference. Seeker Connect (`f4aac047`) shows “Continue in your Seeker Wallet” and names declined, lost, and failed sessions in human language. Sudoku already maps those failures in `playerFacingError`. Wallet UI’s useful pattern is separate Connected, Pending, and Failed states. Its library was not adopted.
5. Why it fits. Sudoku already has the states. They were rendered as button text and gray notes.
6. Why it is better. Race, selected stake, Devnet badge, then Connect wallet. The fee paragraph stays, under the race sentence, because those sentences are the disclosure. A connected address is a status row, not a button. Balance copy says the tokens are in the wallet and are not a match deposit.
7. Expected benefit. The next tap on a disconnected staked screen is Connect wallet. Deposit later says which amount will be approved.
8. Mobile/Seeker benefit. The handoff line matches the moment the wallet app opens, without replacing Mobile Wallet Adapter.
9. Accessibility. Errors use `role="alert"`. The connecting line uses `role="status"`.
10. Technical cost. Labels and order. Deposit, refund, and close still call the same functions.
11. Regression risk. Medium if button names change. Visible labels still contain “Deposit stake”, “Refund stake”, “Close match”, “Connect wallet”, and “Create test wallet”.
12. Recommendation. Redesign the order and the status copy. Do not change amounts, instructions, or signing.

## Offline lobby

1. Current behavior. If `/api/captcha` fails, the lobby stays on “Loading…”. Evidence: `docs/ui-baseline/12-offline.png`.
2. Actual problem. There is no error and no retry. The promise was not caught.
3. Screenshot. `docs/ui-baseline/12-offline.png`.
4. Reference. Seeker Connect’s error dialog always offers a way out. Sudoku already had `playerFacingError` for failed fetches.
5. Why it fits. This is the existing offline sentence, not a new error system.
6. Why it is better. The player sees the failure and can try again or go back.
7. Expected benefit. A dropped network does not look like a hang.
8. Mobile/Seeker benefit. Same on a phone radio drop.
9. Accessibility. The message is an alert, not only a color.
10. Technical cost. A catch and a retry counter.
11. Regression risk. Low. A successful captcha still opens the same lobby.
12. Recommendation. Fix. This was a functional hole found by the UI review.

## Modals

1. Current behavior. Settings, pause, result, and about already use a bottom sheet. Evidence: `docs/ui-baseline/03b-paused.png`, `10-result.png`.
2. Actual problem. None that justified a new dialog library. On a short screen the sheet could grow past the viewport.
3. Screenshot. `docs/ui-baseline/10-result.png`.
4. Reference. Credenza’s desktop-dialog / mobile-sheet split. Sudoku is already mobile-sheet.
5. Why it fits. Do not add the dependency.
6. Why a library is not better. One layout already matches the phone.
7. Expected benefit. None from a migration.
8. Mobile/Seeker benefit. The sheet already sits above the bottom safe area.
9. Accessibility. Sheets remain buttons and text, not a new focus trap library.
10. Technical cost. High if Credenza, Radix, and Tailwind were added.
11. Regression risk. High for a migration. Low for `max-height` and overflow on the existing sheet.
12. Recommendation. Keep the sheets. Small polish: let a tall sheet scroll.

## What not to change

- Do not migrate to Seeker Connect. Sudoku’s working path is Mobile Wallet Adapter plus Wallet Standard. Seeker Connect is a different handoff.
- Do not rewrite the app in React Native. The samples are UX references only.
- Do not add Wallet UI or shadcn. The stack is React, Vite, and one CSS file.
- Do not restyle the board into a crypto surface.
- Do not add a judge-facing theme switch. Comparison is `?theme=classic` versus the default tokens.
- Do not hide `DEVNET · TEST TOKENS · NO CASH VALUE`.

## References inspected

| Repository | Commit | What was read | Used | Rejected | License |
| --- | --- | --- | --- | --- | --- |
| `solana-mobile/seeker-connect` | `f4aac0475335d823131e71d414be0d5c740300bd` | `js/packages/ui` presenter, progress, error dialog; package README | Progress wording and human error titles as a pattern | The Lit package, brand mark, and automatic migration | Apache-2.0. No code copied. |
| `solana-mobile/react-native-samples` | `6ae3d418bedfcf1b982b18ce8078d57d9c536ad0` | Sample list, including Settle and StakeSKR as mobile flows | Task-before-wallet hierarchy | React Native rewrite | No code copied. |
| `wallet-ui/wallet-ui` | `1534a836d764e91bba4b43de21697dd8a8d4c33f` | Connect, disconnect, and sign-and-send examples | Separate connected, pending, and failed states | The component library | No code copied. |
| `shadcn-ui/ui` | `db2db460a26fa84fb65c8d903b213925fbdee9ed` | Design-system scope: buttons, focus, type, spacing | Focus-visible rings, consistent radius, alert versus status | Tailwind, Radix, and a registry install | No code copied. |
| `solana-mobile/templates` | `658b2f5fd1f09c299e9cb930f56d4d4a0005cef6` | README and template purpose | Safe area and mobile spacing as a reminder | Uniwind / Expo migration | Apache-2.0. No code copied. |
| `redpangilinan/credenza` | `843ebbdd9165fae1f79ab53dc837d2a15b388c30` | The dialog-versus-sheet idea | Confirmation that Sudoku’s sheets are already the mobile pattern | The dependency | No code copied. |
