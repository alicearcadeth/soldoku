# Free-competition pilot — guide and plan

Invite-only Devnet pilot. **No cash value.** Funded rooms and card entry stay **unavailable**. Mainnet off. Do not invite testers until the owner separately authorizes invitations.

Related: `EXTERNAL-PILOT-GUIDE.md`, `FEEDBACK-TEMPLATE.md`, `OBSERVABILITY.md`.

---

## Player guide (short)

### Before you start

1. Use the Soldoku APK (`com.sudoku.game`) or `https://soldoku.com/`.
2. Confirm home shows **DEVNET · TEST TOKENS · NO CASH VALUE**.
3. Funded / card entry is paused or disabled — use **free** rooms only (stake **0**).

### Connect and sign

1. Home → **Compete** (or Connect wallet from home).
2. Approve the wallet **connection** in Mobile Wallet Adapter / Seed Vault if asked.
3. On **Join room**, approve a Soldoku **message** that verifies identity. This is **not** a deposit and moves no tokens.
4. Cancel returns you to the app — try Join again. Never share seed phrases or PIN screenshots.

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

---

## Owner pilot plan

### Scope

| Item | Proposal |
|------|----------|
| Participants | Cap **5–8** invited wallets (owner + trusted testers) |
| Duration | **48–72 hours** wall clock |
| Rooms | Owner-created **free** rooms only (stake 0); share codes privately |
| Modes | Free Compete primary; Classic/Practice optional smoke |
| Funded / card / Mainnet | Remain paused / disabled / off |

### Owner prep checklist

1. Confirm live `/api/release` is the intended tip and `paused:true` on `/api/competitions/config`.
2. Create 1–2 free rooms (easy/medium, 1-day period) after any needed competition-session authorize.
3. Share room codes + this guide; no public broadcast under this document alone.
4. Keep funded pause and card execution unchanged.

### Success criteria

| Area | Pass if |
|------|---------|
| Join | Tester joins free room; participant count +1 once; wallet matches truncated UI |
| Auth | Message sign (or valid cached session) completes; return without stuck “Verify…” spinner |
| Play | Start challenge → finish or intentional abandon; timer behaves across background |
| Recovery | Background/reopen returns usable board or room UI; no duplicate Join seat |
| Results | Leaderboard shows finish time/rank; room ends cleanly |
| Safety | No deposit prompts on free rooms; no Mainnet/card paths used |

### Stop conditions (pause invites / rooms)

- Repeated auth failures or stuck Verify after approve
- Lost board progress that cannot recover via Continue
- Duplicate registration of the same wallet in one room
- Incorrect or missing results after a correct finish
- Any funded/deposit UI appearing unexpectedly on free rooms

### Feedback

Use `FEEDBACK-TEMPLATE.md` (one form per session). Owner correlates with room code + `/api/release` + `OBSERVABILITY.md`.

### Evidence status entering pilot

| Check | Status |
|-------|--------|
| Existing-session physical join on `d9a182a` | Passed (`CA64EA8C`) |
| Fresh Seed Vault message on `d9a182a` | Unverified (see `docs/evidence/2026-10-09-deploy/FRESH-MESSAGE-AUTH.md`) |
| Full free play → LB | Passed earlier on `f4619a4` (`61702E42`) |

Owner may still authorize a limited pilot; residual risk on fresh-message instrumentation is documented above.
