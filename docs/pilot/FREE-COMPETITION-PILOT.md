# Free-competition pilot — guide and plan

Invite-only Devnet pilot. **No cash value.** Funded rooms and card entry stay **unavailable**. Mainnet off. Do not invite testers until the owner separately authorizes invitations.

Related: `EXTERNAL-PILOT-GUIDE.md`, `FEEDBACK-TEMPLATE.md`, `OBSERVABILITY.md`.  
Deploy gate for Connect UI: `docs/evidence/2026-10-09-deploy/GET-WALLET-FIX-REVIEW.md`.

---

## Player guide (short)

### Before you start

1. Use the Soldoku APK (`com.sudoku.game`) or `https://soldoku.com/`.
2. Confirm home shows **DEVNET · TEST TOKENS · NO CASH VALUE**.
3. Funded / card entry is paused or disabled — use **free** rooms only (stake **0**).

### Connect and sign

1. Home → **Compete** (or Connect wallet from home).
2. On the Connect sheet, tap **Mobile Wallet Adapter** (**Detected · connect**). On Seeker, that opens Seed Vault or another installed mobile wallet.
3. **Do not** tap **Get wallet ↗** / Phantom download links on the current live build — those open a download page even when a wallet is already installed. (Fixed in git `a907d1a`; not required to redeploy for this small pilot if you follow step 2.)
4. On **Join room**, approve a Soldoku **message** that verifies identity. This is **not** a deposit and moves no tokens.
5. Cancel returns you to the app — try Join again. Never share seed phrases or PIN screenshots.

### Join and play a free room

1. Browse rooms or enter an 8-character code → open the room.
2. Confirm stake is **0** / free entry.
3. **Join room** → after success, **Start challenge**.
4. Your timer runs while you play. Backgrounding does **not** pause the competition timer.
5. Finish the grid to post a time. Ranks can change until the room ends.

### Return to an existing game

- Reopen Soldoku. Use **Continue challenge** / room UI if you left mid-puzzle.
- Already joined: you should see **Start challenge** (or the board), not a second Join that doubles your seat.

### Results

- Room leaderboard shows times and truncated wallets.
- When the room period ends, the board freezes for ranking.

### Report a problem (no private data)

Send: date, device, APK or browser, approx. release (`/api/release` or About), mode (Classic / Practice / Compete), room code, last button tapped, exact on-screen error.  
Do **not** send seeds, Seed Vault PINs, biometrics, or session credentials.

### Known limits (honest)

- Automated solvers and coordinated multi-device play are **not** blocked.
- Ranking is fastest correct completion checked by the server — not a fairness guarantee against cheating.
- On live `d9a182a`, desktop-style Get-wallet links may still appear beside MWA; ignore them (see Connect step 3).

---

## Owner pilot plan

### Scope

| Item | Proposal |
|------|----------|
| Participants | Cap **3–5** invited wallets (owner + trusted testers) |
| Duration | **48–72 hours** wall clock |
| Rooms | Owner-created **free** rooms only (stake 0); share codes privately |
| Modes | Free Compete primary; Classic/Practice optional smoke |
| Funded / card / Mainnet | Remain paused / disabled / off |

### Deploy before invites?

| Release | Needed for 3–5 free pilot? |
|---------|----------------------------|
| Live `d9a182a` (current) | **Sufficient** for guided free Compete |
| Git `a907d1a` Get-wallet hide | **Not required** if invitees use MWA only; **recommended** on next authorized deploy |

Do **not** deploy under this document alone. See `GET-WALLET-FIX-REVIEW.md`.

### Owner prep checklist

1. Confirm live `/api/release` tip and `paused:true` on `/api/competitions/config` (card stays disabled-production).
2. Create 1–2 free rooms (easy/medium, 1-day period) after competition-session authorize as needed.
3. Brief invitees: **Mobile Wallet Adapter** only; ignore Get-wallet on Seeker until `a907d1a` is live.
4. Share room codes + this guide; no public broadcast under this document alone.
5. Keep funded pause and card execution unchanged. No invites until separate owner go-ahead.

### Success criteria

| Area | Pass if |
|------|---------|
| Join | Tester joins free room; participant count +1 once; wallet matches truncated UI |
| Auth | Message sign (or valid cached session) completes; return without stuck “Verify…” spinner |
| Play | Start challenge → finish or intentional abandon; timer behaves across background |
| Recovery | Background/reopen returns usable board or room UI; no duplicate Join seat |
| Results | Leaderboard shows finish time/rank; room ends cleanly |
| Safety | No deposit prompts on free rooms; no Mainnet/card paths used |
| Connect UX | Testers do not get stuck on Phantom download (MWA tap or post-`a907d1a` sheet) |

### Stop conditions (pause invites / rooms)

- Repeated auth failures or stuck Verify after approve
- Lost board progress that cannot recover via Continue
- Duplicate registration of the same wallet in one room
- Incorrect or missing results after a correct finish
- Any funded/deposit UI appearing unexpectedly on free rooms
- Multiple invitees blocked by Get-wallet / download confusion (then stop and prefer deploy of `a907d1a` before continuing)

### Feedback

Use `FEEDBACK-TEMPLATE.md` (one form per session). Owner correlates with room code + `/api/release` + `OBSERVABILITY.md`.

### Evidence status entering pilot

| Check | Status |
|-------|--------|
| Existing-session physical join on `d9a182a` | Passed (`CA64EA8C`) |
| Fresh Seed Vault message on `d9a182a` | Passed (recorded; see `FRESH-MESSAGE-PASSED.md`) |
| Full free play → LB | Passed earlier on `f4619a4` (`61702E42`) |
| Get-wallet sheet on live | Still shows install links beside MWA; fix reviewed in git, not deployed |
| Funded pause / card | Live `paused:true`; card disabled-production — hold for pilot |

Limited free pilot is technically ready on current live after separate invite authorization. Deploy of the Get-wallet fix is optional for this cohort size when MWA briefing is included.
