# Connect wallet → Phantom download despite installed app (Seeker)

## Feedback loop (red)

```text
node scripts/seeker-wallet-sheet-probe.mjs
```

Observed on device (APK `com.sudoku.game` 0.1.0, hosted `d9a182a`, packages `app.phantom` + Seed Vault installed):

| Signal | Value |
|--------|--------|
| Mobile Wallet Adapter | Detected · connect |
| Phantom row | **Get wallet ↗** → `phantom.com/download` |
| Bug | MWA present + installed Phantom still shown as download |

Artifact: `wallet-sheet-probe.json`.

## Cause

`WalletSession` always offered desktop install links for Phantom / Solflare / Backpack when those **names** were missing from Wallet Standard. On Seeker WebView, the installable path is **Mobile Wallet Adapter** (Seed Vault / MWA wallets). Installed `app.phantom` does not register as Wallet Standard name `"Phantom"`, so the sheet pushed a download page.

## Fix (source)

- `walletInstallSuggestions()` returns **no** install links when MWA is detected.
- Copy explains MWA opens Seed Vault or another installed mobile wallet (including Phantom).
- MWA ordered first in the choice list.
- Unit tests in `walletInstallSuggestions.test.ts`.

## Live status

Fix is in source / git (`a907d1a`). Seeker WebView will show it only after the hosted release is redeployed. Live remains `d9a182a` as of this review.

## Review complete

- Unit tests: **4/4 passed**.
- Pilot deploy gate: **not required** for a guided 3–5 free pilot if invitees use MWA only — see `GET-WALLET-FIX-REVIEW.md`.
