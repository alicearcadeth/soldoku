# Prioritized next release (post-pilot prep)

No deploy authorized in this phase. Order for when owner next ships:

| Priority | Item | Why |
|----------|------|-----|
| **P0** | Ship Get-wallet hide (`a907d1a` or newer tip containing it) | Live Connect sheet still offers Phantom download beside MWA; primary Seeker UX trap |
| **P1** | Re-run `seeker-wallet-sheet-probe.mjs` green on hosted tip | Close the red loop from `WALLET-INSTALL-LINK-BUG.md` |
| **P2** | Absorb pilot feedback defects (auth hang, lost Continue, wrong LB) | Only if stop conditions or FEEDBACK-LOG rows fire |
| **P3** | Optional: dedicated “Pilot Free Easy” room creator UX / longer period | Ops nicety; not a blocker |

Out of scope for next release unless separately authorized: funded pause lift, card enable, Mainnet, token moves.
