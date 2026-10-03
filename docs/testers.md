# Test funds for new players

Soldoku competitions on https://soldoku.com/ use Devnet. SOL pays network fees. TEST is the only stake the competition accepts. Neither token has cash value.

TEST mint: `BtdrgokAvXQE4yj3zS48c4ktnMSy3TGoRkHCWD5fV8U4`.

## In the app

1. Open https://soldoku.com/ and choose Compete.
2. Connect a Devnet wallet. Connecting signs an identity message. It does not transfer tokens.
3. Choose **Get Devnet SOL and TEST**. The same control is on the room list, on For tokens, and inside a funded room.
4. Each wallet can receive one grant per day:
   - 1 SOL, when the wallet has under 0.05 SOL.
   - 20 TEST, when the wallet has under 5 TEST.
5. Join or create a funded room only after both balances show in the wallet.

If Devnet refuses the SOL airdrop, request SOL for the same wallet at https://faucet.solana.com and then use **Get Devnet SOL and TEST** again for TEST.

The screen says TEST minting is not enabled when the server secret `SUDOKU_COMPETITION_FAUCET_KEY` is missing. SOL requests still run. The key is the TEST mint authority and stays outside Git. Set it with:

```powershell
npx.cmd wrangler secret put SUDOKU_COMPETITION_FAUCET_KEY --config wrangler.soldoku.jsonc
```

Paste the mint-authority JSON from `~/.config/solana/soldoku-competition-test-mint.json`. Do not commit it. The competition authority pays the mint fee. That authority wallet needs a little Devnet SOL.

## What this does not do

- It does not send Mainnet SOL or USDC.
- It does not fund a room by itself. The player still approves the stake transaction.
- A second grant inside 24 hours is refused. If the send fails and the server saves the cleared reservation, the same wallet can request again immediately.
