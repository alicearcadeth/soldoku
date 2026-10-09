# Cancelled claim wait recovery

After the FE65DD6D claim was left unattended in Seed Vault, its unsigned request became stale. BACK returned to Soldoku at about 14:50 UTC. The app kept the Claim button disabled and the `Approve claim in your wallet…` state through 14:52 UTC. No claim was paid; the phone remained at 18 TEST. claim-cancel-stale-wait.xml preserves the application state; no secure wallet screen was captured.

The WebShell emits a synthetic blur for wallet handoff but has no corresponding native return event. A wallet request can remain unresolved when cancellation provides neither a promise result nor focus/pageshow. The existing bounded sheet wait therefore remains active.

A regression with visible document, false hasFocus, stale blur and no return events stayed waiting before the change. After adding a capture-phase pointerdown listener on the visible page, interaction starts the existing eight-second return grace. The listener is removed on completion. It does not submit a transaction, treat timeout as payment failure, or bypass signing. While the wallet covers the app, page pointer events cannot reach this listener. Existing delayed-approval and lifecycle tests still pass.

Verification: 309 passed, 6 skipped; TypeScript/build passed. Physical retest is pending at this checkpoint. The compute-budget fix and successful physical deposits are already live on eb14d0d; this recovery change will have a separate release identity.
