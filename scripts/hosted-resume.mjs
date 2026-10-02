import { enterStaked, launch, loadPlayers, openPlayer } from "./hosted-browser.mjs";

const code = process.argv[2];
if (!code) throw new Error("room code required");
const { playerA } = loadPlayers();
const browser = await launch();
const page = await openPlayer(browser, playerA);
await enterStaked(page);
await page.locator("input.code").fill(code);
await page.getByRole("button", { name: "Resume with this wallet" }).click();
try {
  await page.getByText("The vault payment is confirmed on-chain.").waitFor({ timeout: 30_000 });
} catch (error) {
  console.log(JSON.stringify({ stage: "resume", page: await page.locator("body").innerText() }));
  throw error;
}
const result = await page.locator(".sheet").innerText();
const filled = await page.locator(".cell").allTextContents();
console.log(JSON.stringify({ kind: "hosted-ui-resume", code, result, filledCells: filled.filter((cell) => cell.trim()).length }));
await browser.close();
