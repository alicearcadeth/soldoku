# Seeker validation checklist

Physical Seeker / Seed Vault testing status. Do not treat mock wallets or browser adapters as Seeker evidence. Serials redacted in committed artifacts.

Evidence: `docs/evidence/2026-10-09-seeker/` (deployed web `f4619a4` via APK).

## Identity and launch

- [x] Verified — APK package `com.sudoku.game` `0.1.0` / `1`, SHA-256 matches release record; loads `https://soldoku.com/`
- [x] Verified — App launches; Home / Compete routes load (cold restore may open Continue game)

## Wallet session

- [x] Verified — Wallet discovery / MWA “Detected · connect”
- [ ] Unverified — Message proof for competition session authorize (owner signing boundary)
- [ ] Unverified — User cancels connect/sign; app recovers without stuck busy state
- [x] Verified — MWA bottom sheet handoff from Soldoku; return showed truncated wallet on home
- [ ] Unverified — Account switch: previous session not reused for new wallet
- [x] Verified — Background / foreground and process kill → Classic pause/continue recovery
- [ ] Unverified — Pending deposit recovery after interrupt (no funded deposit this pass)

## Controlled Devnet competition (pause policy applies)

- [ ] Unverified — Deposit of TEST into a funded room (requires authorized brief unpause)
- [ ] Unverified — Observe settlement (cron or finalize) with real signature on device journey
- [ ] Unverified — Winner claim transfers expected pool once (device)
- [ ] Unverified — Refund path where applicable; duplicate claim transfers nothing (device)
- [ ] Unverified — Pending transaction recovery after interrupt

## Notes

Keep `SUDOKU_COMPETITION_PAUSED=1` unless the owner opens a controlled window. Do not reset wallet data or bypass security warnings to force a pass. Product fix: expose `paused` on `/api/competitions/config` and surface it in Create → For tokens (unreleased until deploy).
