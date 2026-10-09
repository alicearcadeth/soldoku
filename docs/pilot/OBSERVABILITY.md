# Lightweight pilot observability

## Existing (prefer these)

| Signal | Where | Use |
|--------|-------|-----|
| Release commit | `GET /api/release` | Tie reports to deployed web |
| Pause / cluster | `GET /api/competitions/config` | Confirm funded pause + Devnet |
| Room list / state | `GET /api/competitions`, `POST /api/competitions/state` | Participant counts, status, stake 0 |
| APK identity | Device package + `APK-IDENTITY.md` | Distinguish shell vs web |
| Player-facing errors | UI `role="alert"` / banners | Quote exact string in feedback |
| Room code | Competition UI + share link | Correlate multi-player issues |
| In-app feedback note | `POST /api/feedback` | Short text only; rejects grids; rate-limited (`src/coach/feedback.ts`) |
| Explorer tx | Funded receipts only | Out of scope while pause held |

## What is not logged

Competition authorize verifies a wallet **message** signature then discards the proof; the Worker competition path does not `console.log` request bodies, signatures, or session actor secrets. Feedback/play helpers reject payloads that include `wallet`, `room` boards, or match ids (`src/coach/note.ts`, `play.ts`).

Optional live ops: `wrangler tail` for HTTP status/route noise during a short pilot window — do not enable broad analytics or body capture.

## Support ask (players)

When reporting a problem, include: **release commit or About note**, **mode** (Classic / Practice / Compete), **room code** if any, **last button tapped**, **exact error text**. Do not send seed phrases, Seed Vault PIN screens, or session credentials.

## Visibility gap (accepted for free pilot)

There is no durable per-join failure log in production for free rooms. Diagnosis uses player feedback + room state API + release identity. That is enough to investigate auth hangs, duplicate seats, and wrong ranks without storing signatures or session tokens.

## Not added

No new analytics SDK, device fingerprinting, or logging of session tokens / signatures. Agent testing logs under `docs/evidence/` are internal only and are not external validation.
