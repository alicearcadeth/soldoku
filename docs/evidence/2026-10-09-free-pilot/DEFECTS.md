# Defects observed entering / during pilot

Sanitized. Auth pass already recorded elsewhere — not re-litigated here.

| Id | Sev | Surface | Summary | Live on `d9a182a`? | Fix / mitigation |
|----|-----|---------|---------|--------------------|------------------|
| D1 | Medium | Connect sheet | Get-wallet / Phantom download shown while MWA detected | Yes | Mitigate: MWA-only briefing. Fix in git `a907d1a` — next deploy |
| D2 | Low | Ops | Create-room automation failed when APK resumed on room detail (no Home Compete) | N/A (test harness) | Script should Back-to-Rooms first; rooms assigned without new create |

No join/play/recovery/results defects from external testers yet — `FEEDBACK-LOG.md` empty until invitees report.
