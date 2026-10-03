# PC check — 3 October 2026

Project folder: `F:\James\codex project file\Soldoku\soldoku-main`.
Extracted from `soldoku-main.zip`; original ZIP preserved. This download has no `.git` directory.
The ZIP archive comment identifies its source commit as `889944bf01b328c2aed7cb5f7464264e5ac68c6f`. Use that commit as the migration baseline when repository access is restored; do not manufacture replacement history.

## Initial migration baseline

- Node 24.14.0, npm 11.9.0, Git 2.53.0 available.
- Dependencies installed successfully with `npm ci --no-audit --no-fund`.
- `npm test`: 216 passed, 4 skipped, across 50 files. Live-service/blockchain tests skipped.
- `npm run build`: TypeScript and Vite bundle passed; release metadata step failed because Git history is absent. The full release build is therefore not verified.
- `npm start -- --host 127.0.0.1` serves the generated web bundle at http://127.0.0.1:4173/.
- Existing `scripts/laptop-check.mjs` passed Classic completion and reload at desktop and phone widths, two-player private Practice with persistence and third-player rejection, Quick Match, and no uncaught browser errors.
- Browser checks used installed Chrome with `PLAYWRIGHT_CHROMIUM`. Screenshots/results are in `output/laptop-check/`.
- Java 17 and the standard Android SDK directory are present. Android build, signing and device integration were not checked.

## Remaining setup

GitHub CLI is signed into `Kleangkao`. Both cloning and GitHub API access to the user-confirmed repository `https://github.com/alicearcadeth/soldoku` failed with repository-not-found. Sign into an account that has access, or grant the current account access, then clone the repository into a separate folder. Do not create a replacement Git history for the ZIP.

`scripts/verify-release.mjs` additionally requires GitHub access and checks a hosted deployment; it was not run.

Playwright's Chromium download timed out. Existing Chrome works:

```powershell
$env:PLAYWRIGHT_CHROMIUM = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
node scripts/laptop-check.mjs
```

The web bundle warns about size (731.61 kB), and the bigint dependency uses its JavaScript fallback. Neither prevented the tests above. Dependency security audit was not rerun; `dependency-audit.json` and `LAPTOP_CHECK.md` are historical evidence from the previous machine.

The initial migration check did not deploy or sign wallet/blockchain transactions, and did not change the legacy deposit pause. Subsequent competition work is recorded below. Android signing was not exercised.

## Subsequent competition build

The separate multi-player competition contract is now deployed on Devnet. Three-wallet browser stake, common Sudoku, ranking, settlement and full winner payout passed through both Vite and the actual local Cloudflare Worker/D1 runtime. Live refunds and session-loss recovery also passed. Public evidence and the exact build hashes are recorded in [competition verification](docs/competition-devnet-build.md).

The current automated suite passes 232 tests, with six optional integration tests skipped. TypeScript, Vite bundling, Rust state tests, actual local-validator contract tests and the Worker deployment dry run pass. Private competition identities and Artportal's reused Alchemy Devnet RPC URL remain outside the repository. Cloudflare authentication is available on this PC.

GitHub CLI access was restored as `alicearcadeth` on 3 October 2026. The remote HEAD exactly matched the original ZIP baseline, so real Git history was restored without upstream conflicts. The release must still pass clean build, push, deployment, production three-wallet testing and release parity checks.

## Run locally

Double-click `start-local.cmd`, then open http://127.0.0.1:5173/.

Or:

```powershell
Set-Location 'F:\James\codex project file\Soldoku\soldoku-main'
npm run dev -- --host 127.0.0.1
```
