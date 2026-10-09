# Seeker validation checklist

Physical Seeker / Seed Vault testing status. Do not treat mock wallets or browser adapters as Seeker evidence. Serials redacted in committed artifacts.

Evidence: `docs/evidence/2026-10-09-seeker/` (deployed web `f4619a4` via APK). APK identity: `APK-IDENTITY.md`.

## Identity and launch

- [x] Verified — APK `com.sudoku.game` `0.1.0` / `1`, SHA-256 `bf427627…` matches recovery `soldoku-clockin.apk`
- [x] Verified — Shell URL `https://soldoku.com/`; hosted release `f4619a4`
- [x] Verified — App launches; Home / Compete load (cold restore may open Continue game)
- [ ] Unverified — Post–lock-screen session (device currently PIN-locked mid continuation)

## Wallet session

- [x] Verified — MWA discovery “Detected · connect”
- [x] Verified — MWA handoff to Solana Mobile Wallet bottom sheet; return showed truncated wallet
- [ ] Unverified — Message proof for competition session authorize (**owner signing**)
- [ ] Unverified — User cancels connect/sign; app recovers without stuck busy
- [ ] Unverified — Account switch
- [x] Verified — Background / foreground and process kill → Classic pause/continue recovery
- [ ] Unverified — Pending deposit recovery after interrupt (no funded deposit this pass)

## Controlled Devnet competition (pause policy applies)

- [ ] Unverified — Deposit of TEST (requires authorized brief unpause)
- [ ] Unverified — Settlement / claim / refund / duplicate protection on device journey
- [ ] Unverified — Pending transaction recovery after interrupt

## Notes

Keep `SUDOKU_COMPETITION_PAUSED=1` unless the owner opens a controlled window. Do not reset wallet data or bypass security warnings. Product fix (unreleased): expose `paused` on `/api/competitions/config` — PR #2.
