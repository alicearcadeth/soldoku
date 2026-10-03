# Win celebration

Solved Classic grids, race wins, completed leaderboard attempts and confirmed competition wins receive a brief Solana-colored confetti burst and a badge. A leaderboard finish says **Grid complete!**; **You won!** appears only for the authenticated winner after award/payment, or first place after a free competition ends. No transactions or competition rules change.

The effect lasts 2.8 seconds and never intercepts clicks. Reduced-motion users see a static badge with no confetti or ring. Sound and vibration follow existing preferences; Classic retains its existing completion chime. Result keys are remembered locally so polling and reloads do not replay the burst.

Run `scripts/win-celebration-check.mjs` with `QA_ORIGIN` and optional `PLAYWRIGHT_CHROMIUM`. It actually solves Classic through grid input, checks the effect and cleanup, reload deduplication and reduced-motion behavior. Screenshots are saved under `output/win-celebration/`.
