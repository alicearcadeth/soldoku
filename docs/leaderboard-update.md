# Leaderboard and UX update — 2 October 2026

Updated behavior and acceptance criteria: [Refined implementation requirements](refined-implementation-requirements.md).

## Implemented locally

- Settings now has visible Theme, Font, Size, and Sound & feedback headings. The confusing mixed-character sample is replaced with a labeled sentence preview and a separate 1–9 puzzle-digit preview. Preferences continue to persist. Settings also offers Home.
- Home has a Connect wallet button at the top right. The picker lists detected Solana Wallet Standard wallets, and offers official download links for Phantom, Solflare, and Backpack when those wallets are not detected. Connection, disconnection, and account changes are shared across the app.
- Compete opens the new leaderboard browser. There is no separate wallet button on this page. Creating or joining prompts for a wallet when needed. A signed, expiring challenge proves wallet ownership; connection alone is not treated as ownership proof.
- The creator chooses difficulty, free/token mode, entry amount, and 1 Day, 1 Week, or a custom duration. A slider check appears after Create room is clicked. The server requires a passed, unexpired check before creating the room.
- Token planning offers “Pick Your Token on Solana,” search by symbol/name/mint, labeled 1/2/5 token buttons with USD equivalents, and editable token/USD inputs. The field last edited is the source of the conversion. Invalid amounts and unavailable prices are not presented as valid quotes.
- Quotes use the DEX Screener public API, choose the most liquid qualifying Solana pool, and refresh every 30 seconds. A 15-second cache avoids duplicate requests. The picker now pins canonical SOL/USDC and optionally uses Jupiter's verified registry, rather than trusting pool names. Quotes require at least $10,000 reported liquidity and pass a substantial-pool consistency check. Decimal source precision is retained for conversions; display decimals adapt to value. See the refined requirements for registry setup and limitations.
- The browser lists game difficulty, token, entry amount, approximate USD value, period, participant count, status, and best completion. Players can join from the list or find a room by code. Ended rooms can be included in the list.
- A leaderboard room stores one generated Sudoku. Every entrant gets exactly that grid. The grid is disclosed to a participant only after Start challenge. One timed attempt is enforced per wallet, including when signing in again, changing browser, or reloading. A completed attempt has no restart path.
- The server records each player's start and finish; client-supplied timing cannot change the leaderboard. Leaving the page does not stop the attempt clock. All players must finish before the room closes. The fastest correct elapsed time wins, regardless of who finishes first in wall-clock time. Exact ties share a rank. An ended room with no correct finishes has no winner.
- There is no configured two-player or other participant cap in the new room logic. Tests enrolled thirteen wallets in one room. All entrants remain enrolled, even after leaving, so duration cannot become unlocked again.
- Only the creator may extend an active room while it has no other entrant. The server checks ownership and participant count atomically on every extension. Joining locks duration. Expired rooms cannot be extended.
- Home is available in the new room browser, creation screen, room details, and challenge. Room details now include a bordered “← Back to Rooms” action. Classic and the existing Practice lobby retain Home navigation.
- Existing Classic, two-player Practice, and old escrow recovery remain available. The old escrow UI is behind “Previous two-player races & refunds.”

## Financial work not implemented or enabled

New leaderboard rooms currently have **free entry**. The token controls are usable for live price and amount planning, but the server rejects creation of a paid leaderboard room. It does not create an apparently paid room without funding, take tokens, or promise a payout.

The existing Rust escrow only supports two players and one configured settlement mint. It cannot safely implement this request's open-entry, arbitrary-token pool. This update does not modify or deploy that program, remove the existing deposit hold, or enable Mainnet operations. Actual token deposits/payouts need a separate multi-participant escrow, per-wallet entries, mint/decimal validation, native SOL or wrapping handling, token-program compatibility, and defined prize/refund rules. Payout splitting and tie payout policy have not been confirmed; the UI only ranks free competitions.

## Fairness and deployment limits

One attempt means one attempt per **wallet**, not proof that a human owns only one wallet. A slider is a quick interaction check, not protection against outside Sudoku solvers. The server validates single-cell moves, immutable givens, sequence numbers, and timing; it rejects complete-grid bursts and sub-15-second finishes. An outside solver can still enter a correct grid gradually, as already described in `fair-play.md`. Paid play should not be inferred from these checks.

Local state persists in the ignored `data/competitions.json` file. The Worker implementation persists separate competition state in D1 with conditional writes and retries, without changing legacy match data. Its request path and write-conflict retry were tested with a database stand-in; no Cloudflare deployment or live D1 migration was performed. The snapshot storage is suitable for this local implementation and requires a capacity/scalability review before high-volume hosted use. “No configured player cap” does not imply unlimited infrastructure capacity.

Wallet discovery, connection/cancellation, message signing, and session reuse were verified with test Wallet Standard providers labeled Phantom, Solflare, and Backpack, using valid cryptographic signatures checked by the server. Actual approval through the user's installed wallet extensions, and a physical Seeker wallet, were not exercised. No personal wallet keys were read.

## Verification

- `npm.cmd run build`: TypeScript and production web build passed.
- `npm.cmd test`: 207 passed; four pre-existing blockchain/live-provider tests skipped.
- `scripts/competition-check.mjs`: eleven browser journeys cover settings, wallet picker, create/check, extension, three-player joining, lock enforcement, one-attempt persistence across sessions, completion/rank, live token/USD conversion, custom duration, refusal of paid creation, mobile/desktop overflow, and browser errors.
- `scripts/laptop-check.mjs`: existing Classic completion/reload on desktop and phone, Practice room joining and move recovery, third-player rejection in the legacy two-player mode, Quick Match, and browser errors passed.
- Screenshots and browser results: `output/competition-check/`. QA rooms were removed from the main local app; final tests use separate storage at port 5174.
- No new package dependencies were added. Existing dependency advisories and bundle-size warning remain outside this change.

## Reproduce without filling the normal room list with QA data

```powershell
Set-Location 'C:\codex project\kuku\sudoku-release-clock-in-final'
$env:SUDOKU_COMPETITION_STORE = "$PWD\output\isolated-qa\competitions.json"
$env:SUDOKU_MATCH_STORE = "$PWD\output\isolated-qa\matches.json"
npm.cmd run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

In another PowerShell window in the same project:

```powershell
$env:QA_ORIGIN = 'http://127.0.0.1:5174/'
node scripts/competition-check.mjs
node scripts/laptop-check.mjs
```

The browser runner uses the installed Playwright Chromium. Its test-wallet secret keys are disposable and are never written to source files or sent to the server.

## Main changed files

- `src/App.tsx`, `src/ui/SettingsSheet.tsx`, `src/ui/ClassicGame.tsx`, `src/ui/Compete.tsx`, `src/styles.css`: navigation, settings, home entry points, and appearance.
- `src/ui/WalletSession.tsx`, `src/solana/browserWallet.ts`: shared wallet picker and connection events.
- `src/ui/Competitions.tsx`, `src/ui/TokenStake.tsx`: room browser, creation, extension, leaderboard challenge, and token quote UI.
- `src/competition/`: room rules, identity/session verification, market quotes, local API, types, and tests.
- `src/worker.ts`, `vite.config.ts`: separate competition and price routes plus persistence.
- `scripts/competition-check.mjs`, `src/solana/browserWallet.test.ts`: browser verification and wallet regressions.

## API references

- [DEX Screener API reference](https://docs.dexscreener.com/api/reference): token pools and search.
- [Solana Foundation wallet connector documentation](https://github.com/solana-foundation/connectorkit/blob/main/packages/connector/README.md): Wallet Standard wallet integrations.
- [Phantom Solana integration documentation](https://docs.phantom.com/solana/integrating-phantom).
- The installed `@wallet-standard/app` type definitions were checked for registration, discovery, event subscriptions, and subscription cleanup.
