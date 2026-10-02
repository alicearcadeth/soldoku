import { enterStaked, hostedRoom, launch, loadPlayers, openPlayer, url, watchDeposits } from "./hosted-browser.mjs";

const { playerA } = loadPlayers();
const browser = await launch();
const page = await openPlayer(browser, playerA);
const signatures = [];
watchDeposits(page, signatures);
await enterStaked(page);
const code = await hostedRoom(page);
await page.getByRole("button", { name: "Deposit stake" }).click();
await page.getByText("Waiting for the other deposit").waitFor({ timeout: 90_000 });
await page.waitForTimeout(620_000);
await page.getByRole("button", { name: "Refund stake" }).click();
await page.getByText("Refund confirmed on-chain.").waitFor({ timeout: 90_000 });
await page.getByRole("button", { name: "Submit refund again" }).click();
await page.getByText("This refund was already confirmed on-chain.").waitFor({ timeout: 90_000 });
const funds = await fetch(`${url}api/rooms/funds?code=${code}`).then((response) => response.json());
console.log(JSON.stringify({ kind: "hosted-ui-unmatched-refund", code, signatures, funds, page: await page.locator("body").innerText() }));
await browser.close();
