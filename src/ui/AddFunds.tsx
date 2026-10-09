import { useState } from "react";
import {
  admitsCompetitionEntrant,
  applyNormalizedEvent,
  browserReturnNeverProvesPayment,
  cardFundingCapabilities,
  cardFundingStatusLabel,
  localTestAdapter,
  markDeliveryFailed,
  markDepositApproval,
  markDepositFailed,
  markDepositSubmitted,
  markPaymentUnknown,
  noteEscrowAdmission,
  observeAssetDelivery,
  type CardFundingIntent,
} from "../solana/cardFunding";

const STORAGE = "sudoku.cardFundingPreview";
const mint = "BtdrgokAvXQE4yj3zS48c4ktnMSy3TGoRkHCWD5fV8U4";

function readSaved(): CardFundingIntent | null {
  const saved = localStorage.getItem(STORAGE);
  if (!saved) return null;
  try {
    const parsed = JSON.parse(saved) as CardFundingIntent;
    if (!parsed?.intentId || parsed.externalExecutionEnabled !== false) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Developer-only preview. Production builds do not render this, and mock success cannot admit a live entrant. */
export function AddFunds({ stakeAtomic, wallet, roomCode = "sandbox" }: { stakeAtomic: string; wallet: string | null; roomCode?: string }) {
  const caps = cardFundingCapabilities("devnet");
  const [record, setRecord] = useState<CardFundingIntent | null>(readSaved);
  const [note, setNote] = useState(() => {
    const saved = readSaved();
    return saved ? cardFundingStatusLabel(saved) : caps.reason;
  });

  function save(next: CardFundingIntent) {
    localStorage.setItem(STORAGE, JSON.stringify({ ...next, externalExecutionEnabled: false }));
    setRecord(next);
    setNote(cardFundingStatusLabel(next));
  }

  function start() {
    const destination = wallet ?? "JCVsKd4TMg1fvEs7rjf5YgLYbJfNC8Dwb4x1PchFkGM7";
    const opened = localTestAdapter().createCheckout({
      existing: record,
      sessionActor: null,
      destinationWallet: destination,
      roomCode,
      cluster: "localnet",
      assetMint: mint,
      assetDecimals: 6,
      expectedBaseUnits: BigInt(stakeAtomic),
      registrationDeadlineAt: Date.now() + 60_000,
      nowMs: Date.now(),
    });
    if (!opened.ok) {
      setNote(opened.error);
      if (opened.intent) save(opened.intent);
      return;
    }
    save(opened.intent);
    setNote(wallet
      ? "Preview only. Destination wallet and expected TEST are shown below. No live checkout opens."
      : "Preview wallet only. Connect a wallet before any future real checkout. Card funding remains unavailable.");
  }

  function provider(kind: "provider-confirmed" | "declined" | "cancelled" | "verification-required" | "expired" | "refund-review") {
    if (!record) return;
    const next = applyNormalizedEvent(record, { id: `${kind}-${record.processedEventIds.length}`, kind, orderId: record.providerOrderId, observedAt: Date.now() });
    save(next.intent);
  }

  function deliver(kind: "ok" | "short" | "late" | "wrong-wallet") {
    if (!record) return;
    const nowMs = kind === "late" ? (record.registrationDeadlineAt ?? Date.now()) + 1 : Date.now();
    save(observeAssetDelivery(record, {
      wallet: kind === "wrong-wallet" ? "5Yj8tfWFSucMUyYZVdCRNFSw1QF3C1MbG7dbo8vFkkar" : record.destinationWallet,
      mint: record.assetMint,
      network: "solana-localnet",
      amountBaseUnits: kind === "short" ? BigInt(record.expectedBaseUnits) - 1n : BigInt(record.expectedBaseUnits),
      signature: `preview-delivery-${kind}`,
    }, nowMs));
  }

  function deposit(result: "approve" | "reject" | "gas" | "vault-ok" | "vault-no") {
    if (!record) return;
    if (result === "gas") {
      save(markDepositFailed(record, "insufficient-gas", Date.now()));
      return;
    }
    let next = record.escrow === "approval-needed" || record.delivery === "received" ? markDepositApproval(record, Date.now()) : record;
    if (result === "approve" || result === "vault-ok" || result === "vault-no" || result === "reject") {
      if (next.escrow === "approval-needed") next = markDepositSubmitted(next, "preview-deposit", Date.now());
      if (result === "reject") next = markDepositFailed(next, "failed", Date.now());
      if (result === "vault-ok") next = noteEscrowAdmission(next, true, Date.now());
      if (result === "vault-no") next = noteEscrowAdmission(next, false, Date.now());
    }
    save(next);
    if (admitsCompetitionEntrant(next)) {
      setNote("Preview only: escrow lane shows entry finalized. This does not admit a live competition entrant.");
    }
  }

  function browserReturn() {
    if (!record) return;
    const result = browserReturnNeverProvesPayment(record);
    setNote(result.paid ? "Unexpected paid browser return" : "Browser return does not prove payment. Provider verification is still required.");
  }

  return (
    <section className="stack" aria-label="Card funding preview">
      <p className="choice-note" role="status">Card funding unavailable for live play. {caps.reason}</p>
      <p className="choice-note">
        Destination wallet: {wallet ?? "not connected"} · Expected asset: {stakeAtomic} base units of TEST ·
        Wallet signing remains required for competition escrow.
      </p>
      <div className="tools">
        <button type="button" className="secondary" onClick={start}>Preview card funding states</button>
        <button type="button" className="text" onClick={browserReturn} disabled={!record}>Simulate browser return</button>
        <button type="button" className="text" onClick={() => provider("provider-confirmed")} disabled={!record}>Simulate provider success</button>
        <button type="button" className="text" onClick={() => provider("declined")} disabled={!record}>Simulate declined card</button>
        <button type="button" className="text" onClick={() => provider("cancelled")} disabled={!record}>Simulate cancelled payment</button>
        <button type="button" className="text" onClick={() => provider("verification-required")} disabled={!record}>Simulate verification</button>
        <button type="button" className="text" onClick={() => provider("expired")} disabled={!record}>Simulate expiry</button>
        <button type="button" className="text" onClick={() => provider("refund-review")} disabled={!record}>Simulate provider refund review</button>
        <button type="button" className="text" onClick={() => record && save(markPaymentUnknown(record, Date.now()))} disabled={!record}>Simulate pending/unknown payment</button>
        <button type="button" className="text" onClick={() => deliver("ok")} disabled={!record}>Simulate asset received</button>
        <button type="button" className="text" onClick={() => deliver("short")} disabled={!record}>Simulate short delivery</button>
        <button type="button" className="text" onClick={() => deliver("late")} disabled={!record}>Simulate late delivery</button>
        <button type="button" className="text" onClick={() => deliver("wrong-wallet")} disabled={!record}>Simulate wrong wallet</button>
        <button type="button" className="text" onClick={() => record && save(markDeliveryFailed(record, Date.now()))} disabled={!record}>Simulate delivery failed</button>
        <button type="button" className="text" onClick={() => deposit("gas")} disabled={!record}>Simulate insufficient SOL</button>
        <button type="button" className="secondary" onClick={() => deposit("vault-no")} disabled={record?.delivery !== "received" && record?.escrow !== "approval-needed" && record?.escrow !== "pending"}>Deposit rejected</button>
        <button type="button" className="primary" onClick={() => deposit("vault-ok")} disabled={record?.delivery !== "received" && record?.escrow !== "approval-needed" && record?.escrow !== "pending"}>Preview separate deposit approval</button>
      </div>
      <p className="choice-note">{note}</p>
      {record && (
        <p className="choice-note">
          Lanes — payment: {record.payment}; delivery: {record.delivery}; escrow: {record.escrow}.
          Payment confirmed is not asset delivered; asset delivered is not competition entry.
          Escrow stake refunds do not reverse a card charge.
        </p>
      )}
      <p className="choice-note">Return to competition with the Compete navigation. Preview state recovers from this browser storage only.</p>
    </section>
  );
}
