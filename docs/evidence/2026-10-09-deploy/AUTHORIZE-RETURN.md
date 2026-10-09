# Free-room authorize / return — `d9a182a` (2026-10-09)

## Identities (reconfirmed before test)

| Item | Value |
|------|--------|
| Hosted release | soldoku.com + www `/api/release` = `d9a182a` `dirty:false` |
| GitHub main (evidence tip) | `b406ab6` (docs only; live remains `d9a182a`) |
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
| Approving wallet (sanitized) | Home chip `E3DQ…DpJn` after connect |
| Prior LB | `8VYT…7J8G` (unchanged #1) |

## Results

| Check | Status | Notes |
|-------|--------|-------|
| Wallet connect → MWA → owner approve → Soldoku | **passed** | `MWABottomSheetActivity` observed; chip `E3DQ…DpJn` |
| Join → Start challenge, no Verify hang | **passed** | Join gone; Start challenge; ~3s after tap |
| Participant +1 exactly | **passed** | 3 → 4 |
| Force-stop relaunch persistence | **passed** | Start challenge, Join not offered, count 4 |
| Duplicate join | **passed** | Join not offered (idempotent joined UI) |
| Background return | **passed** | Usable room UI |
| Fresh Seed Vault **message** sheet on Join | **not observed** | Join completed without `seedvault` / MWA top activity. Consistent with reuse of valid `sudoku.competitionSession` (server sessions last ~1 day). Connect-phase MWA was observed; join-phase message re-sign was not. |

## Interpretation

- **Registration + return UI on `d9a182a`:** pass (no hang, correct Start state, count +1).
- **Strict “Join → Seed Vault message approve → return” replay:** not instrumentally confirmed this run (session cache). Prior hang was specifically on that message-return path; live JS still contains the `pageshow`/`hasFocus` fix.
- Forcing a fresh message would require clearing `sudoku.competitionSession` or waiting for expiry — **not done** (no storage clear authorized).

## Verdict

| Question | Answer |
|----------|--------|
| Successful physical join + return on current release? | **Yes** |
| Remaining free-competition authorization gap closed? | **Mostly** — join/registration/no-hang closed; fresh message Seed Vault path still an optional retest |
| Small free-competition pilot technically ready for owner auth? | **Yes, limited** — with the session-reuse caveat above; no external invite under this prompt |
