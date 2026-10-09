import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Isolated real component: no wallets, providers, or chain transactions.
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [390, 1346]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.on('pageerror', error => console.error(error.message));
    page.on('console', msg => { if (msg.type() === 'error') console.error(msg.text()); });
    await page.route('**/__stake-check', route => route.fulfill({ contentType: 'text/html', body: `
      <html><head><link rel="stylesheet" href="/src/styles.css"></head><body>
      <div id="root" class="competition-page" style="max-width:492px;margin:auto"></div>
      <script type="module">
        import RefreshRuntime from '/@react-refresh';
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => type => type;
        window.__vite_plugin_react_preamble_installed__ = true;
      </script>
      <script type="module">
        import React from '/node_modules/.vite/deps/react.js';
        import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
        import {TokenStake} from '/src/ui/TokenStake.tsx';
        ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(TokenStake, {
          supportedMint:'test-mint', onChange:(_,amount)=>{window.stakeAmount=amount;}
        }));
      </script></body></html>` }));
    await page.goto('http://127.0.0.1:5187/__stake-check');
    const presets = page.locator('.stake-presets button');
    await presets.first().waitFor();
    await page.waitForFunction(() => window.stakeAmount === '1');
    assert.equal(await presets.first().locator('strong').textContent(), '1 Soldoku');
    for (const button of await presets.all()) {
      const centers = await button.evaluate(el => {
        const b = el.getBoundingClientRect(), t = el.querySelector('strong').getBoundingClientRect();
        const css = getComputedStyle(el);
        return { dx: Math.abs(b.x+b.width/2-t.x-t.width/2), justify: css.justifyContent };
      });
      assert(centers.dx < 2, `label is not horizontally centered at ${width}px`);
      assert.equal(centers.justify, 'center');
    }
    for (const value of ['3', '10', '1.000001']) {
      await page.getByRole('spinbutton', {name:'Token amount', exact:true}).fill(value);
      await page.waitForFunction(v => window.stakeAmount === v, value);
      assert.equal(await page.locator('.quote-total').textContent(), `${value} Soldoku`);
      assert.equal(await page.locator('.stake-presets [aria-pressed="true"]').count(), 0);
    }
    await presets.nth(1).click();
    await page.waitForFunction(() => window.stakeAmount === '2');
    assert.equal(await presets.nth(1).getAttribute('aria-pressed'), 'true');
    assert(await page.getByText('No cash value', {exact:true}).count() > 0);
    console.log(`PASS centered Soldoku labels and custom amounts at ${width}px`);
    await page.close();
  }
} finally { await browser.close(); }
