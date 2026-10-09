import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
const out = 'docs/evidence/2026-10-09-stake-release';
mkdirSync(out, {recursive:true});
const results = [];
const browser = await chromium.launch({channel:'chrome',headless:true});
try {
  for (const host of ['soldoku.com','www.soldoku.com']) {
    const page = await browser.newPage({viewport:{width:390,height:844}});
    const response = await page.goto(`https://${host}/`);
    assert.match(response.headers()['content-security-policy'], /script-src 'self'/);
    await page.getByRole('button',{name:/^LEADERBOARD Compete/i}).click();
    await page.getByRole('group',{name:'Competition navigation'}).getByRole('button',{name:'Create competition',exact:true}).click();
    await page.getByRole('group',{name:'Entry mode'}).getByRole('button',{name:'For tokens',exact:true}).click();
    await page.locator('.token-picker').click();
    await page.getByRole('button',{name:'Soldoku Token (Devnet) · available',exact:true}).click();
    const presets = page.locator('.stake-presets button');
    await page.waitForFunction(()=>document.querySelector('.stake-presets strong')?.textContent==='1 Soldoku').catch(async error=>{
      console.error((await page.locator('body').innerText()).slice(-3500)); throw error;
    });
    for (const button of await presets.all()) {
      const aligned = await button.evaluate(el => {
        const b=el.getBoundingClientRect(),t=el.querySelector('strong').getBoundingClientRect();
        return Math.abs(b.x+b.width/2-t.x-t.width/2)<2 && getComputedStyle(el).justifyContent==='center';
      });
      assert(aligned);
    }
    for (const value of ['3','10']) {
      await page.getByRole('spinbutton',{name:'Token amount',exact:true}).fill(value);
      await page.waitForFunction(v=>document.querySelector('.quote-total').textContent===`${v} Soldoku`,value);
    }
    assert(await page.getByRole('button',{name:'Funded rooms paused',exact:true}).isDisabled());
    assert.equal(await page.getByRole('button',{name:/Simulate provider success/i}).count(),0);
    await page.screenshot({path:`${out}/${host}-stake.png`,fullPage:true});
    const config=await page.request.get(`https://${host}/api/competitions/config`).then(r=>r.json());
    assert.equal(config.paused,true); assert.equal(config.cluster,'devnet');
    const card=await page.request.post(`https://${host}/api/funding/card`,{data:{}});
    assert.equal(card.status(),403);
    results.push({host,passed:true,customAmounts:['3','10'],paused:true,cardStatus:403,csp:response.headers()['content-security-policy']});
    await page.close();
  }
  writeFileSync(`${out}/browser.json`,JSON.stringify(results,null,2));
  console.log(JSON.stringify(results));
} finally {await browser.close();}
