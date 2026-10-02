# UI rollback

The promoted UI is the latest commit on `ui/seeker-polish`. The tag `ui-baseline-pre-seeker-polish` still points at the previous UI and must not be deleted.

## Pointers

- Branch: `ui/seeker-polish`
- Baseline commit: `9c6bceedfa664f60e8ef7943694c276fcfb38eb3`
- Tag: `ui-baseline-pre-seeker-polish`
- Message: `Baseline before Seeker UI UX review`
- Remote: none. Nothing was pushed.

Confirm the tag still points at that commit:

```powershell
git rev-parse ui-baseline-pre-seeker-polish
```

The old home sentence is still in that commit:

```powershell
git show ui-baseline-pre-seeker-polish:src/App.tsx
```

Look for `Play alone, or race another person.`

## Restore the old UI

From the repo root, this restores the source that the current submission APK was built from. It does not delete the tag or the promoted commit. Use a new branch so `ui/seeker-polish` stays available:

```powershell
git switch -c restore/pre-seeker-ui ui-baseline-pre-seeker-polish
```

To put only the old UI files back on the current branch:

```powershell
git checkout ui-baseline-pre-seeker-polish -- index.html src/App.tsx src/styles.css src/ui/Compete.tsx scripts/player-qa.mjs
```

`?theme=classic` restores the previous color tokens while the experimental layout is still loaded. It does not restore the old home structure. Use the git commands for a full restore.

## Files most affected

- `src/App.tsx` — home choices and compete route mode
- `src/ui/Compete.tsx` — lobby order, wallet status, deposit label, offline retry
- `src/ui/copy.ts` — labels only
- `src/styles.css` — tokens, focus, 48px text controls, sheet scrolling
- `index.html` — `?theme=classic` or `?theme=seeker`
- `scripts/player-qa.mjs` — Practice is selected explicitly
- `src/solana/walletCall.ts` — stops a wallet request that never returns
- `src/ui/boardInput.ts` — player-facing text for a failed room refresh

Escrow instructions, stake amounts, and puzzle generation were not changed.

## Theme

Two color token sets exist. The default is the slightly darker text tokens. `?theme=classic` applies the previous palette. Settings still offers Ink, Dark, Midnight, and Arcade. There is no second layout and no theme switch on the home screen.

## Promoted source

- UI commit: `b3551c0b0616334b21deab2e535751d5c4e8256e`
- Recovery commit: `5d3603a589b00771636011c7f31b7201af0576a1`
- Hosted worker: `53bc43d3-5a25-4ca1-9e15-bfa6b6d2aca9`
- Client bundle: `assets/index-DS-IQUUk.js`
- Public URL: `https://sudoku.jamesbitarcade.workers.dev`
- Cluster: Devnet
- Program: `937BAWXVCW58oEKkA1FijkSXXtdgGEytUyPRV2Roge22`

## Submission APK

The previous file was copied before the replacement.

- Archive: `submission/archive/sudoku-clockin-pre-seeker-ui.apk`
- Archived SHA-256: `e33725e8a78d7be54a9bf8dd0eb40c1241ae3a61ecb94a5363f168dd1c08aff7`
- Current file: `submission/sudoku-clockin.apk`
- Current SHA-256: `79529045f97ad9867ab6dc6207a06d038600966c0b687dfd7ba53406e2b0d954`
- Size: 2,091,487 bytes
- Package: `com.sudoku.game`, version `0.1.0`, versionCode `1`
- Certificate SHA-256: `28e197708d1dc9de80f1e23939352bcd6a80e1171717055205f5394a622c5553`
- The release build is not debuggable and opens `https://sudoku.jamesbitarcade.workers.dev/`

To put the previous APK back on a device, uninstall `com.sudoku.game` and install the archive file. That does not roll the hosted page back. Use the git commands above and redeploy that source for a full UI rollback.

## Secret scan before the baseline commit

Ignored and left unstaged:

- `config/operator.env`
- `data/`
- `.env`
- `programs/match-escrow/fixtures/test-settlement-mint.json`
- `programs/match-escrow/target/deploy/match_escrow-keypair.json`

A content scan of files git would add found no private-key blocks. `src/solana/fundingProviders.test.ts` contains the placeholder `sk_live_example`, which is a rejected-key fixture, not a live secret.

## Player feedback pass

Promoted from local branch `ux/player-feedback-pass`. The previous source is `ui/seeker-polish` at `3eaac050ce832b1799cf300841453df9b5ce38b1`.

- Hosted worker: `d977b770-10a8-453e-9c3c-9b461ec59402`
- Client bundle: `assets/index-BBGNyRlU.js`
- Styles: `assets/index-ChDsCB2q.css`
- Public URL: `https://sudoku.jamesbitarcade.workers.dev`
- Submission APK: unchanged, SHA-256 `79529045f97ad9867ab6dc6207a06d038600966c0b687dfd7ba53406e2b0d954`
- Archive of that same file: `submission/archive/sudoku-clockin-pre-player-feedback.apk`

The APK is a shell. It loads the hosted page, so it was not rebuilt. Restoring the previous screen means deploying commit `3eaac05` again. Reinstalling the APK does not bring the old page back.

```powershell
git switch ui/seeker-polish
```
