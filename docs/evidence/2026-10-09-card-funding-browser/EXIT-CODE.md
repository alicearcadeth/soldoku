# Original run exit code (preserved)

File `results.json` from the first Chrome pass is unchanged.

## Observed

- Scenarios finished with `"passed": true` at `2026-10-09T05:08:24.527Z` (~27s after start).
- Outer shell recorded `exit_code: 4294967295` (~120s wall clock).
- Stderr showed Node `[DEP0190]` because the runner used `spawn(..., { shell: true })`.

## Attribution (verified)

1. **Tee-Object + stderr does not alone set a non-zero exit.** A probe that writes to stderr and exits 0 still leaves `$LASTEXITCODE = 0` after `2>&1 | Tee-Object`. PowerShell may print `NativeCommandError` for stderr lines; that is display noise, not the scenario verdict.
2. **The process hung after success.** Wall clock (~120s) exceeded scenario completion (~27s). `child.kill()` on a `shell: true` `npx`/`vite` tree on Windows does not reliably stop the process tree, so Node can stay alive until an outer harness kills it. Unsigned kill/status **-1** appears as **4294967295**.
3. **Scenario assertions were not hidden.** `results.json` already recorded both scenarios and `providerHits: []` before the hang.

## Repair

`scripts/card-funding-browser.mjs` now: spawns without `shell`, kills the Windows process tree via `taskkill /T /F`, closes browsers in `finally`, and calls `process.exit` with 0/1. Clean reruns write to a separate evidence directory so this original run stays intact.
