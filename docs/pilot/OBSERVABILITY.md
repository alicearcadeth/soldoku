# Lightweight pilot observability

## Existing (prefer these)

| Signal | Where | Use |
|--------|-------|-----|
| Release commit | `GET /api/release` | Tie reports to deployed web |
| APK identity | Device package + `APK-IDENTITY.md` | Distinguish shell vs web |
| Player-facing errors | UI `role="alert"` / banners | Quote exact string in feedback |
| Room code | Competition UI + share link | Correlate multi-player issues |
| Explorer tx (funded only) | Receipt links when present | Chain disputes |

## Support ask (players)

When reporting a problem, include: **release commit or About note**, **mode** (Classic / Practice / Compete), **room code** if any, **last button tapped**, **exact error text**. Do not send seed phrases or Seed Vault PIN screens.

## Not added

No new analytics SDK, device fingerprinting, or logging of session tokens / signatures. Agent testing logs under `docs/evidence/` are internal only and are not external validation.
