import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
const origin=process.env.QA_ORIGIN ?? 'http://127.0.0.1:5173/';
mkdirSync('output/win-celebration',{recursive:true});
const browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : { channel: "msedge" });
try {
  for(const reducedMotion of ['no-preference','reduce']) {
    const context=await browser.newContext({viewport:{width:390,height:900},reducedMotion});
    const page=await context.newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin);
    await page.getByRole('button',{name:/Play classic/}).click();
    await page.getByRole('button',{name:/^Easy/}).click();
    await page.getByRole('gridcell').first().waitFor();
    const save=await page.evaluate(()=>JSON.parse(localStorage.getItem('sudoku.classic')));
    const empty=save.puzzle.givens.flatMap((value,index)=>value?[]:[index]);
    for(const index of empty){ await page.getByRole('gridcell').nth(index).click(); await page.keyboard.press(String(save.puzzle.solution[index])); }
    const celebration=page.getByTestId('win-celebration');
    await celebration.waitFor();
    assert.match(await celebration.innerText(),/Soldoku solved!/);
    assert.equal(await celebration.evaluate(e=>getComputedStyle(e).pointerEvents),'none');
    if(reducedMotion==='reduce'){
      assert.equal(await page.locator('.win-badge').evaluate(e=>getComputedStyle(e).animationName),'none');
      assert.equal(await page.locator('.win-burst i').first().evaluate(e=>getComputedStyle(e).display),'none');
    }
    await page.waitForTimeout(220);
    await page.screenshot({path:`output/win-celebration/${reducedMotion}.png`,fullPage:true});
    await celebration.waitFor({state:'hidden',timeout:5000});
    await page.reload();
    await page.getByRole('dialog',{name:'Solved',exact:true}).waitFor();
    await page.waitForTimeout(150);
    assert.equal(await celebration.count(),0,'A restored solved game must not replay the celebration');
    assert.deepEqual(errors,[]);
    console.log(`PASS: real Classic finish, celebration cleanup, reload deduplication and ${reducedMotion} preferences.`);
    await context.close();
  }
} finally { await browser.close(); }