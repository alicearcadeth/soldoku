import bs58 from "bs58";
import { classicMessage } from "../match/identity";
import { signMessageWithMobileWallet } from "../solana/mwa";

/** Signs the next Classic finish for the opted-in wallet. Guest games are not uploaded. */
export async function publishClassicFinish(): Promise<void> {
  const wallet = localStorage.getItem("sudoku.classicWallet");
  if (!wallet) return;
  const at = Date.now();
  const completed = Number(localStorage.getItem("sudoku.classicSent") ?? "0") + 1;
  const signatureBytes = await signMessageWithMobileWallet(classicMessage(wallet, completed, at));
  if (!signatureBytes) return;
  const response = await fetch("/api/classic", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ wallet, completed, signature: bs58.encode(signatureBytes), at }),
  });
  if (response.ok) localStorage.setItem("sudoku.classicSent", String(completed));
}
