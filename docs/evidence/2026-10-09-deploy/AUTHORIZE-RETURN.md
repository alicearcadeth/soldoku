# Free-room authorize / return — `d9a182a` (2026-10-09)

## Corrected result (authoritative)

**Physical joining with an existing session passed; fresh physical message authorization on this release remains unverified.**

Do not treat the `CA64EA8C` join as proof that a Seed Vault **message** signature occurred on live `d9a182a`. No wallet message sheet was observed during Join.

## Identities (reconfirmed)

| Item | Value |
|------|--------|
| Hosted release | soldoku.com + www `/api/release` = `d9a182a` `dirty:false` |
| GitHub tip (docs) | `83c3901` (and later evidence commits); live Worker remains `d9a182a` |
| APK | `com.sudoku.game` 0.1.0 (loads hosted site) |
| Pause / card / Mainnet | paused · card disabled · Devnet only |
| Script | `scripts/seeker-authorize-return.mjs` |
| Artifact | `authorize-return.json` |

## Room

| Field | Value |
|-------|--------|
| Code | `CA64EA8C` |
| Stake / token | `0` / `null` (free) |
| Join path copy | “Join verifies your wallet with a **message signature** (no deposit…)” |
| Participants before | **3** (API + UI) |
| Participants after | **4** (API + UI) |
| Wallet (sanitized) | Home chip `E3DQ…DpJn` after connect |
| Prior LB | `8VYT…7J8G` (unchanged #1) |

## Results

| Check | Status | Notes |
|-------|--------|-------|
| Wallet connect → MWA → owner approve → Soldoku | **passed** | `MWABottomSheetActivity`; chip `E3DQ…DpJn` |
| Join with **existing** `sudoku.competitionSession` → Start challenge | **passed** | Join gone; Start challenge; ~3s; no Verify hang |
| Participant +1 exactly | **passed** | 3 → 4 |
| Force-stop relaunch persistence | **passed** | Start challenge; Join not offered; count 4 |
| Duplicate join | **passed** | Join not offered |
| Background return | **passed** | Usable room UI |
| Fresh Seed Vault **message** on Join (this release) | **unverified** | Join completed without `seedvault` / MWA as top activity |

## Why Join skipped Seed Vault

`Competitions.identity()` reuses `localStorage.sudoku.competitionSession` when `wallet` matches and `expires > now + 5s` (`src/ui/Competitions.tsx`). Server sessions last `DAY_MS` (~24h) after `/api/competitions/authorize` (`src/competition/store.ts`). Disconnect clears the play-wallet connection only — **not** the competition session (see `FRESH-MESSAGE-AUTH.md`).

## Verdict

| Question | Answer |
|----------|--------|
| Existing-session physical join + return on `d9a182a`? | **Passed** |
| Fresh physical message approval + return on `d9a182a`? | **Unverified** |
| Small free-competition pilot technically ready? | **Limited yes** — join/persistence proven with session cache; fresh-message path still open; no invites under this prompt |
