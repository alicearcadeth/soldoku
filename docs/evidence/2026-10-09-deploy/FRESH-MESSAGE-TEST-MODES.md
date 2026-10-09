# How to get a fresh competition message on Seeker

We are **not** inventing a new product auth mode. We only need `identity()` to call Seed Vault / MWA **message** sign because `sudoku.competitionSession` is missing or expired for the **connected wallet address**.

## What went wrong before

| Mistake | Why it failed |
|---------|----------------|
| Tap **Phantom → Get wallet ↗** | Opens download / `connect.phantom.app`. Ignores installed `app.phantom`. UI bug (fixed in git `a907d1a`, not live until deploy). |
| Reconnect same chip `E3DQ…` | Same address → same day-long competition session → Join skips message. |

## Correct connect path (always)

1. Soldoku → **Connect wallet**
2. Tap **Mobile Wallet Adapter · Detected · connect** only  
   Do **not** tap Get wallet / download links.
3. System MWA sheet → pick **Seed Vault** or **Phantom** (whichever account you want) → approve Connect (PIN/biometrics).
4. Home chip must be the address you intend to test.

## Mode A — Same wallet after natural expiry (simplest)

| Item | Value |
|------|--------|
| Wallet | Keep `E3DQ…DpJn` |
| When | After **~2026-10-10 14:05 ICT** |
| Probe | `node scripts/seeker-session-probe.mjs` → want `readyForFreshMessage: true` |
| Then | Free room Join → approve **MESSAGE** → Start challenge (`seeker-fresh-message.mjs`) |

No account switch. No Phantom. No storage clear.

## Mode B — Another wallet address now (same phone)

Competition session is keyed by **wallet address**, not by “which app icon you like”.

### B1. Second Seed Vault account

1. Open **Solana Mobile Wallet / Seed Vault** → switch to a **different** account (different pubkey).
2. Soldoku → Disconnect if still on `E3DQ…`.
3. Connect via **MWA** → approve that account.
4. Confirm Home chip is **not** `E3DQ…`.
5. Compete → Create free room **or** Join a free room that wallet has never joined → approve **MESSAGE**.

### B2. Phantom as the MWA wallet

1. Do **not** use Get wallet.
2. Connect → **Mobile Wallet Adapter** → in the **system** picker choose **Phantom** (installed app) → approve.
3. Home chip = Phantom address (not E3DQ).
4. Create/Join free room → approve **MESSAGE**.

If the system picker never lists Phantom, use B1 or Mode A. That is an OS/MWA association issue, not Soldoku inventing a second connect button.

## Mode C — After deploy of `a907d1a`

Hosted site drops misleading Phantom/Solflare/Backpack download rows when MWA is present. Same Modes A/B; sheet is just less confusing.

## Success criteria (fresh message)

- Seed Vault or MWA **message** sheet observed (not only Connect).
- Return to Soldoku without Verify hang.
- Participant +1 (Join) or create gate → room (Create).
- Free room only (stake 0). No deposit tx.

## What we will not do

- Clear app/browser/wallet storage to force expiry.
- Shorten production `DAY_MS`.
- Build a “clear competition session” feature only for this test.
- Treat Connect approval as message authorization.
