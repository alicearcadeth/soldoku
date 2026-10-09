import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const out = "docs/evidence/2026-10-09-card-funding-browser";
mkdirSync(out, { recursive: true });
const evidence = {
  browser: "Google Chrome (Playwright channel=chrome)",
  startedAt: new Date().toISOString(),
  scenarios: [],
  network: { paymentProviderHosts: [], blockedOrAbsent: true },
  passed: false,
};
const save = () => writeFileSync(`${out}/results.json`, JSON.stringify(evidence, null, 2));

const paymentHostRe = /moonpay|coinbase|crossmint|stripe|checkout\.|pay\.|banxa|transak|ramp\.network/i;
const chromePath = process.env.PLAYWRIGHT_CHROMIUM
  || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function withServer(command, args, env, readyUrl, run) {
  const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"], shell: true });
  let ready = false;
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(readyUrl);
      if (response.ok || response.status === 404) { ready = true; break; }
    } catch { /* wait */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready) {
    child.kill();
    throw new Error(`Server did not become ready at ${readyUrl}`);
  }
  try { return await run(); }
  finally { child.kill(); }
}

async function launch() {
  return chromium.launch({
    channel: process.env.PLAYWRIGHT_CHROMIUM ? undefined : "chrome",
    executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined,
    headless: true,
  });
}

async function prodScenario() {
  const origin = "http://127.0.0.1:4179/";
  return withServer("npx", ["vite", "preview", "--host", "127.0.0.1", "--port", "4179", "--strictPort"], {}, origin, async () => {
    const browser = await launch();
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const providerHits = [];
    page.on("request", (request) => {
      if (paymentHostRe.test(request.url())) providerHits.push(request.url().split("?")[0]);
    });
    await page.goto(origin);
    await page.getByRole("button", { name: /^LEADERBOARD Compete/i }).click();
    await page.getByRole("group", { name: "Competition navigation" }).getByRole("button", { name: "Create competition", exact: true }).click();
    await page.getByRole("group", { name: "Entry mode" }).getByRole("button", { name: "For tokens", exact: true }).click();
    await page.getByText(/Card funding unavailable/i).first().waitFor({ timeout: 15000 });
    const preview = page.getByRole("region", { name: "Card funding preview" });
    const previewCount = await preview.count();
    const simulate = page.getByRole("button", { name: /Simulate provider success/i });
    assert.equal(previewCount, 0, "production build must not show card funding preview");
    assert.equal(await simulate.count(), 0, "production build must not show simulation controls");
    await page.screenshot({ path: `${out}/prod-unavailable.png`, fullPage: true });
    evidence.scenarios.push({
      name: "production-unavailable",
      origin,
      unavailableCopy: true,
      previewAbsent: previewCount === 0,
      simulateAbsent: (await simulate.count()) === 0,
      providerHits,
    });
    evidence.network.paymentProviderHosts.push(...providerHits);
    await browser.close();
  });
}

async function devScenario() {
  const origin = "http://127.0.0.1:5188/?fiatSandbox=1";
  return withServer("npx", ["vite", "--host", "127.0.0.1", "--port", "5188", "--strictPort"], {}, "http://127.0.0.1:5188/", async () => {
    const browser = await launch();
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const providerHits = [];
    page.on("request", (request) => {
      if (paymentHostRe.test(request.url())) providerHits.push(request.url().split("?")[0]);
    });
    async function openCreateTokens() {
      await page.getByRole("button", { name: /^LEADERBOARD Compete/i }).click();
      await page.getByRole("group", { name: "Competition navigation" }).getByRole("button", { name: "Create competition", exact: true }).click();
      await page.getByRole("group", { name: "Entry mode" }).getByRole("button", { name: "For tokens", exact: true }).click();
    }
    await page.goto(origin);
    await openCreateTokens();
    const preview = page.getByRole("region", { name: "Card funding preview" });
    await preview.waitFor({ timeout: 20000 });
    await page.getByText(/Card funding unavailable for live play/i).waitFor();
    await page.getByRole("button", { name: "Preview card funding states", exact: true }).click();
    await page.getByText(/Lanes — payment:/i).waitFor();
    await page.screenshot({ path: `${out}/dev-preparing.png`, fullPage: true });

    await page.getByRole("button", { name: "Simulate pending/unknown payment", exact: true }).click();
    await page.getByText(/payment: pending-unknown/i).waitFor();
    await page.getByRole("button", { name: "Simulate provider success", exact: true }).click();
    await page.getByText(/payment: provider-confirmed/i).waitFor();
    await page.getByText(/delivery: pending/i).waitFor();
    await page.getByRole("button", { name: "Simulate browser return", exact: true }).click();
    await page.getByText(/Browser return does not prove payment/i).waitFor();
    await page.getByRole("button", { name: "Preview card funding states", exact: true }).click();
    await page.getByRole("button", { name: "Simulate declined card", exact: true }).click();
    await page.getByText(/payment: declined|Payment declined/i).first().waitFor();
    await page.getByRole("button", { name: "Preview card funding states", exact: true }).click();
    await page.getByRole("button", { name: "Simulate cancelled payment", exact: true }).click();
    await page.getByText(/payment: cancelled|Payment cancelled/i).first().waitFor();
    await page.getByRole("button", { name: "Preview card funding states", exact: true }).click();
    await page.getByRole("button", { name: "Simulate provider success", exact: true }).click();
    await page.getByRole("button", { name: "Simulate delivery failed", exact: true }).click();
    await page.getByText(/delivery: failed/i).waitFor();
    await page.getByRole("button", { name: "Preview card funding states", exact: true }).click();
    await page.getByRole("button", { name: "Simulate provider success", exact: true }).click();
    await page.getByRole("button", { name: "Simulate short delivery", exact: true }).click();
    await page.getByText(/delivery: insufficient-amount/i).waitFor();
    await page.getByRole("button", { name: "Preview card funding states", exact: true }).click();
    await page.getByRole("button", { name: "Simulate provider success", exact: true }).click();
    await page.getByRole("button", { name: "Simulate late delivery", exact: true }).click();
    await page.getByText(/registration closed|escrow: registration-closed/i).first().waitFor();
    await page.getByRole("button", { name: "Preview card funding states", exact: true }).click();
    await page.getByRole("button", { name: "Simulate provider refund review", exact: true }).click();
    await page.getByText(/refund-review|Provider refund or review/i).first().waitFor();
    await page.getByRole("button", { name: "Preview card funding states", exact: true }).click();
    await page.getByRole("button", { name: "Simulate provider success", exact: true }).click();
    await page.getByRole("button", { name: "Simulate asset received", exact: true }).click();
    await page.getByText(/delivery: received/i).waitFor();
    await page.getByText(/Asset received|Separate deposit approval|approval-needed/i).first().waitFor();
    await page.getByRole("button", { name: "Preview separate deposit approval", exact: true }).click();
    await page.getByText(/escrow: entry-finalized|Preview only: escrow lane/i).first().waitFor();
    await page.getByText(/Escrow stake refunds do not reverse a card charge/i).waitFor();
    await page.screenshot({ path: `${out}/dev-lanes.png`, fullPage: true });

    await page.reload();
    await openCreateTokens();
    await preview.waitFor();
    await page.getByText(/Lanes — payment:/i).waitFor();
    await page.screenshot({ path: `${out}/dev-reload.png`, fullPage: true });

    await page.getByRole("group", { name: "Competition navigation" }).getByRole("button", { name: "Browse rooms", exact: true }).click();
    await page.getByRole("heading", { name: "Competition rooms", exact: true }).waitFor();

    evidence.scenarios.push({
      name: "dev-preview-lanes",
      origin,
      previewPresent: true,
      providerHits,
      reloadRecovered: true,
      chromePath,
    });
    evidence.network.paymentProviderHosts.push(...providerHits);
    await browser.close();
  });
}

try {
  // Ensure production assets exist
  await new Promise((resolve, reject) => {
    const build = spawn("npm", ["run", "build"], { shell: true, stdio: "inherit" });
    build.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`build failed ${code}`)));
  });
  await prodScenario();
  await devScenario();
  evidence.network.blockedOrAbsent = evidence.network.paymentProviderHosts.length === 0;
  assert.equal(evidence.network.paymentProviderHosts.length, 0, "no payment-provider network requests");
  evidence.passed = true;
  evidence.finishedAt = new Date().toISOString();
  save();
  console.log(JSON.stringify({ passed: true, scenarios: evidence.scenarios.map((s) => s.name), providerHits: evidence.network.paymentProviderHosts }, null, 2));
} catch (error) {
  evidence.error = error instanceof Error ? error.message : String(error);
  evidence.finishedAt = new Date().toISOString();
  save();
  console.error(evidence.error);
  process.exitCode = 1;
}
