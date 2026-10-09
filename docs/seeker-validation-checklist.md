# Deferred Seeker validation checklist

Physical Seeker / Seed Vault testing remains **deferred**. Each item stays **unverified** until performed on device. Do not treat mock wallets or browser adapters as Seeker evidence.

## Identity and launch

- [ ] Unverified — APK package `com.sudoku.game`, release URL `https://soldoku.com/`, certificate SHA-256 matches release record
- [ ] Unverified — App launches to home without crash; Compete route loads

## Wallet session

- [ ] Unverified — Wallet discovery / connect via mobile wallet adapter
- [ ] Unverified — Message proof for competition session authorize
- [ ] Unverified — User cancels connect/sign; app recovers without stuck busy state
- [ ] Unverified — Approval of deposit transaction and return from wallet to app
- [ ] Unverified — Account switch: previous session not reused for new wallet
- [ ] Unverified — Background / foreground, lock / unlock, process restart + pending deposit recovery

## Controlled Devnet competition (pause policy applies)

- [ ] Unverified — Deposit of TEST into a funded room (requires authorized brief unpause if still paused)
- [ ] Unverified — Observe settlement (cron or finalize) with real signature
- [ ] Unverified — Winner claim transfers expected pool once
- [ ] Unverified — Refund path where applicable; duplicate claim transfers nothing
- [ ] Unverified — Pending transaction recovery after interrupt

## Notes

Keep `SUDOKU_COMPETITION_PAUSED=1` unless the owner opens a controlled window. Do not reset wallet data or bypass security warnings to force a pass.
