# Current release

Checkout branch `release/clock-in-final`.

The hosted application was built from commit `812581ec1e850c0d80658eb737369ecb766de34a`. Later commits on this branch that only change documentation, scripts, or portability do not change the hosted bundle until a new deploy. Confirm the live page before treating a later commit as the deployed client.

Hosted application: `https://sudoku.jamesbitarcade.workers.dev`

Worker: `a392e0c8-fc10-4db9-9cab-de7cfb507974`

Rollback worker: `9e228a8e-0961-4e89-803a-a17638d68f39`

Hosted client assets from that deploy: `assets/index-BO7DSemp.js` and `assets/index-Z6rSqkAq.css`

## Submission artifacts

| File | Role | SHA-256 |
|---|---|---|
| `submission/sudoku-clockin.apk` | Accepted release APK. Package `com.sudoku.game`, versionName `0.1.0`, versionCode `1`. Certificate SHA-256 `28e197708d1dc9de80f1e23939352bcd6a80e1171717055205f5394a622c5553`. The APK loads the hosted URL. | `79529045f97ad9867ab6dc6207a06d038600966c0b687dfd7ba53406e2b0d954` |
| `submission/sudoku-clockin-final.mp4` | CLOCK IN demo | `b8c67a978010387932b9a551a06ec208f336cbe61b54ad64ed9fa32cea530227` |
| `submission/pitch.html` | Pitch. The hash is the file with LF line endings. | `641d7a4bab8db80c64a055fcfce1075da6355790be7e28f940142c58138937c6` |

`submission/sudoku-clockin.mp4` is an earlier short clip, SHA-256 `068b4079b5bd8f2ea2dd8b0b3bfdb5244487319be3f62c2c52f8350b91a24fcc`. It is not the CLOCK IN demo.

## Financial safety

New deposits stay paused in the public UI (`NEW_DEPOSITS_HELD` in `src/ui/depositHold.ts`). That pause is in the page. A server-wide refusal of new paid rooms also requires `SUDOKU_FUNDING_PAUSED=1`. Refunds for an already funded room stay available.

The physical Seeker wallet warning “Scam site detected” is unresolved. Do not treat a Devnet deposit or refund on that device as completed.

Mainnet stays disabled. Do not point Devnet keys or the Devnet mint at Mainnet USDC.

Public Devnet escrow program: `937BAWXVCW58oEKkA1FijkSXXtdgGEytUyPRV2Roge22`.
