# Soldoku implementation requirements

Updated 2 October 2026. This document consolidates the requested product changes and distinguishes working behavior from requirements for funded competitions.

## Branding and interface

- Use the supplied Soldoku PNG unchanged, preserving its 3:1 aspect ratio. Show it on Home, game and competition screens, loading states, wallet/token/settings dialogs, and browser/mobile wallet identity. Sudoku remains the name of the game type.
- Use `#14F195` for primary actions and selected states, with dark text `#08251b`. Keep neutral backgrounds; use subdued mint highlights on the grid and darker green for readable light-theme links and focus borders. Dark themes use bright green focus accents.
- Theme, Font, Size, and Sound & feedback have visible headings. The font preview contains a readable sentence and the digits 1–9.
- Use **game** for the saved session and actions: Continue game, New game, Start new game, Return to current game. Use **grid** for the Sudoku arrangement shared by competitors. Internal engine types may retain `Puzzle`; Sudoku is correctly classified as a puzzle game.
- Return to current game must open the saved board immediately, preserving difficulty, entries, notes, mistakes and elapsed time. It must not start a replacement or stop on the difficulty selector. The equivalent action from the in-game replacement dialog resumes play.
- Home remains reachable throughout gameplay and dialogs. Room details have a bordered **← Back to Rooms** navigation action.

## Room creation and discovery

- Creation follows mode → difficulty → stake → period → wallet identity → slider check → confirmation.
- Support an optional custom room name of at most 60 characters. Trim and normalize whitespace; validate on the server before consuming the creation check. An omitted name becomes `Room CODE`. Existing unnamed saved rooms retain this fallback without data migration.
- Show the name as the room title and in browser cards. Keep the shareable code separate and visible.
- Offer 1 Day, 1 Week, and Custom Duration. Valid durations are 1 minute through 365 days.
- Room cards show mode/difficulty, token, entry per participant, approximate USD, period/deadline, participant count, status, best finish, View room and Join room.
- The owner can extend an active room only while they are its sole participant. The server rechecks ownership, participants, expiry and maximum deadline on confirmation. Once another participant joins, the period is locked.
- Free competition creation must succeed after verified wallet identity and the slider check. Show server validation/storage errors visibly, and give useful errors for unreachable servers and unexpected responses. Never treat a failed request as success.

## Token identity and quotes

- Identity is the Solana mint, never a pool's symbol or name. Pin issuer-confirmed Star Atlas POLIS to `poLisWXnNRwC6oBu1vHiuKQzFjGL4XDSu4g9qjz9qVk` ([issuer API](https://galaxy.staratlas.com/tokens/polis)); pin SOL to `So11111111111111111111111111111111111111112` and Circle USDC to `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`.
- Without registry credentials, allow broad DEX Screener search filtered strictly to Solana, plus exact mint lookup. Deduplicate pools by mint and retain the liquidity/price-consistency checks. Pin the official SOL, USDC and POLIS identities and exclude their ticker/name impersonators. Label other results as market listings rather than verified identities. BTC results are tokens on Solana, not native Bitcoin; distinct mints can share a name and must remain distinguishable by address.
- Broader discovery uses Jupiter Tokens V2 with server-side `JUPITER_API_KEY`. Accept only `isVerified === true`; deduplicate by mint, reject impersonators of pinned tickers, and require exact mint lookup when multiple verified identities share a symbol. Show at most ten results.
- For local discovery, set `JUPITER_API_KEY` in the PowerShell environment before starting `npm run dev` and restart the server. For a Worker deployment, use a server secret binding with the same name. No credential was supplied or configured in this update; optional verified registry discovery was tested with mocked responses. Broad public Solana search works without a key and BTC lookup/selection was also tested live in the browser.
- Fetch prices only for accepted mints. Use the most liquid supported Solana base-token pool with at least $10,000 reported liquidity. Suppress quotes if substantial alternative pools differ by more than 10%. This is a consistency filter, not a guarantee against manipulated market data.
- Quotes are market estimates refreshed every 30 seconds, with a checked timestamp. Never substitute a price of zero or an old quote as a valid new price after failure.
- Preserve the provider's full decimal price string. Token → USD multiplication uses decimal integer arithmetic. USD → token division rounds only the final result to 24 decimal places; recurring divisions cannot be represented exactly.
- Formatting is separate from calculation. Examples: `$198.42`, `$1.24`, `$0.01284`, `$0.00003482`. Derived input fields retain calculation precision instead of copying the shortened display price.
- Label presets with amount and symbol, plus approximate USD. Support token and USD inputs; the most recently edited input remains authoritative during quote refreshes.

## Competition integrity

- Everyone in a room receives the same generated grid. Each wallet gets **one timed attempt**, with no restart or repeat attempt.
- Reopening the room or reconnecting the same wallet resumes the same board and server start time. Leaving the page does not pause a leaderboard attempt.
- No fixed participant limit. Entries remain open until the deadline. Rankings are based on the server-verified elapsed time of correct completions and remain provisional until closure. Equal elapsed times share rank.
- The slider checks room creation interaction; it is not proof that a player has not used a Sudoku solver. Wallet identity prevents repeats for that wallet, not multiple wallets belonging to one person.

## Funded competitions: remaining work

The Create Room error in the supplied screenshot was caused by requesting a paid leaderboard room against an escrow that supports only two-player test-token races. Removing that validation would create false funded-room expectations.

The updated flow explains this before wallet/slider confirmation and provides **Switch to free competition**, preserving the current name, difficulty and period. The server still rejects unsupported paid room requests. Free rooms have no deposits or payouts.

Before enabling paid leaderboard rooms, implement and verify a multi-participant escrow with supported mint/token-program checks, exact mint-decimal stake units, join deposit confirmation, immutable entry terms, deadline settlement, claims/refunds, retry recovery, and wallet transaction previews. Configure and verify the intended network and deploy the matching program. The existing deposit hold also needs its underlying wallet warning investigated.

Payout allocation, equal-time prize handling, no-finish refunds, and cancellation rules still need an explicit product decision. “Fastest finish wins” establishes ranking; it does not specify the distribution of the entry pool. Paid creation must remain unavailable until those rules and the escrow implementation agree.

## Verification and source references

- Build: `npm run build`.
- Unit suite: `npm test` (212 passing, four service/tooling-dependent tests skipped at verification).
- Browser coverage: `scripts/laptop-check.mjs`, `scripts/competition-check.mjs`, and `scripts/refinement-check.mjs`, using a separate QA store so existing local rooms are preserved.
- Verification passed 20 browser checks across those scripts, including live SOL/USDC lookup (POLIS lookup and conversion also verified after restoration), named room creation, three participants, duration locking, single-attempt persistence and completion, saved-game return, all four theme states, responsive layouts, and visible injected server errors.
- Jupiter registry requirements: https://developers.jup.ag/docs/tokens/token-information and https://verified.jup.ag/apis.
- Price API: https://docs.dexscreener.com/api/reference.
- USDC identity: https://www.circle.com/multi-chain-usdc/solana.
- SOL native mint: https://solana.com/docs/tokens/basics/sync-native.

The production build and local browser verification do not constitute a funded-contract deployment, security audit, live registry verification without credentials, or native-store release.
