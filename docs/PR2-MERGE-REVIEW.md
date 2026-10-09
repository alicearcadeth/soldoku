# PR #2 merge review — `seeker-product-2026-10-09`

**PR:** https://github.com/alicearcadeth/soldoku/pull/2  
**Base:** `main` @ `5ead4e6`  
**Do not merge without explicit owner authorization.**

## What changed (product)

1. **Funded pause surface** — `/api/competitions/config` exposes `paused`; create UI disables For-tokens create while paused; copy states claims/refunds/settlement still work; free rooms remain.
2. **walletCall hang fix (Seeker / MWA)** — After Seed Vault, `focus` may never fire and `hasFocus()` may stay false. Clear sheet coverage on `pageshow` / `visibilitychange` visible, and ignore stale unfocused state once the page is foregrounded again so the grace timeout can unblock “Verify your wallet identity…”.
3. **Copy** — Join vs Start clarified; finish next-step hint; timeout mentions approve **or cancel**.
4. **Evidence** — Seeker physical/scripted artifacts under `docs/evidence/2026-10-09-seeker/`.

## Environment affected by hang fix

| Environment | Effect |
|-------------|--------|
| Seeker WebView + MWA / Seed Vault | Primary; deployed `f4619a4` still lacks this until deploy |
| Desktop browsers | Harmless; pageshow/visibility already normal |
| Server / chain / escrow | Unchanged |

## Safety checks

| Check | Result |
|-------|--------|
| Pause notices match API | Yes — create/deposit blocked when paused; claims path not gated by same create pause |
| Claims/refunds/recovery still available | Intended; worker tests cover paused create/deposit refusal |
| Loading/cancel cannot trap forever | Hang fix + grace; busy cleared in `action` finally |
| No provider / card activation | Card remains disabled-production |
| No financial regression in free path | Free join/play verified on device against live |

## Unrelated churn

Most of the PR byte weight is Seeker evidence images/XML. Product code delta is small (`funded.ts`, `Competitions.tsx`, `walletCall.ts` + tests, App copy).

## Merge recommendation

**Recommend merge** after owner skim of this note, then **separately authorize deploy** so Seeker gets the hang fix and pause UI.  
**Do not** treat merge as deploy. Live remains `f4619a4` until an authorized release.

### Suggested post-merge deploy checks (when authorized)

1. `/api/release` new commit  
2. `/api/competitions/config` includes `paused: true`  
3. For-tokens create disabled with pause banner  
4. Seeker: Join free room → approve message → Join enables / Start appears within seconds (no 10‑min Verify hang)
