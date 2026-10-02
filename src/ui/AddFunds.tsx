import { useState } from "react";
import { fiatRestore, fiatSnapshot, fiatStatusLabel, noteChainDelivery, noteEscrowVault, requestDepositApproval, approveFiatDeposit, applyProviderEvent, createFiatSession, type FiatRecord } from "../solana/fiatFunding";
import { MAINNET_USDC } from "../solana/dflow";

const STORAGE = "sudoku.fiatSandbox";

function readSaved(): FiatRecord | null {
  const saved = localStorage.getItem(STORAGE);
  if (!saved) return null;
  try {
    return fiatRestore(saved);
  } catch {
    return null;
  }
}

/** Developer-only preview. A production build does not render this, and it cannot mark a public match funded. */
export function AddFunds({ stakeAtomic, wallet }: { stakeAtomic: string; wallet: string | null }) {
  const [record, setRecord] = useState<FiatRecord | null>(readSaved);
  const [note, setNote] = useState(() => {
    const saved = readSaved();
    return saved ? fiatStatusLabel(saved.status) : "Card funding is a sandbox preview. It does not pay the stake.";
  });

  function save(next: FiatRecord) {
    localStorage.setItem(STORAGE, fiatSnapshot(next));
    setRecord(next);
  }

  function start() {
    const destination = wallet ?? "JCVsKd4TMg1fvEs7rjf5YgLYbJfNC8Dwb4x1PchFkGM7";
    save(createFiatSession({
      existing: record,
      provider: "moonpay",
      matchId: "sandbox",
      wallet: destination,
      assetMint: MAINNET_USDC,
      expectedAtomic: BigInt(stakeAtomic),
    }));
    setNote(wallet
      ? "Sandbox checkout would buy USDC into this wallet. The match is not funded."
      : "Preview wallet only. Connect a wallet before a real sandbox checkout. The match is not funded.");
  }

  function provider(kind: "provider-completed" | "declined" | "cancelled" | "kyc" | "expired") {
    if (!record) return;
    const next = applyProviderEvent(record, { id: `${kind}-${record.seenEvents.length}`, kind, orderId: "sandbox-order" });
    save(next.state);
    setNote(fiatStatusLabel(next.state.status));
  }

  function deliver() {
    if (!record) return;
    save(noteChainDelivery(record, { wallet: record.wallet, mint: MAINNET_USDC, amount: BigInt(stakeAtomic), signature: "sandbox-delivery" }));
    setNote("USDC received in the wallet. The match is still unfunded.");
  }

  function deposit(vaultCovers: boolean) {
    if (!record) return;
    const ready = record.status === "usdc-received" ? requestDepositApproval(record) : record;
    const confirming = approveFiatDeposit(ready, "sandbox-deposit");
    const settled = noteEscrowVault(confirming, vaultCovers);
    save(settled);
    setNote(fiatStatusLabel(settled.status));
  }

  const label = record ? fiatStatusLabel(record.status) : "Add funds";
  return (
    <section className="stack">
      <p className="choice-note">Sandbox only. Buy USDC with a card, then deposit it. {label}.</p>
      <div className="tools">
        <button type="button" className="secondary" onClick={start}>Buy USDC with card</button>
        <button type="button" className="text" onClick={() => provider("provider-completed")} disabled={!record}>Simulate provider success</button>
        <button type="button" className="text" onClick={() => provider("declined")} disabled={!record}>Simulate declined card</button>
        <button type="button" className="text" onClick={() => provider("cancelled")} disabled={!record}>Simulate cancelled payment</button>
        <button type="button" className="text" onClick={() => provider("kyc")} disabled={!record}>Simulate KYC</button>
        <button type="button" className="text" onClick={() => provider("expired")} disabled={!record}>Simulate expiry</button>
        <button type="button" className="text" onClick={deliver} disabled={!record}>Simulate USDC arrival</button>
        <button type="button" className="secondary" onClick={() => deposit(false)} disabled={record?.status !== "usdc-received" && record?.status !== "deposit-approval-needed"}>Deposit was rejected</button>
        <button type="button" className="primary" onClick={() => deposit(true)} disabled={record?.status !== "usdc-received" && record?.status !== "deposit-approval-needed"}>Deposit into match</button>
      </div>
      <p className="choice-note">{note}</p>
    </section>
  );
}
