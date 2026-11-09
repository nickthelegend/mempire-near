// Browser end-to-end on NEAR testnet: guest sign-in through the relayer, challenge a house, drop
// cards from the session key, wait for the on-chain referee, verify the replay. Needs the web app
// (vite preview on 5199) and the relayer running. Writes screenshots to .shots/ and evidence JSON.
//   node scripts/e2e/browser-house.mjs
import pw from '/Volumes/Extreme SSD/Projects/tasteprobe/node_modules/playwright-core/index.js';
import { writeFileSync, mkdirSync } from 'node:fs';
const { chromium } = pw;
const BASE = process.env.WEB_URL || 'http://127.0.0.1:5199';
mkdirSync('.shots', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const shot = (n) => page.screenshot({ path: `.shots/e2e-${n}.png` });
await page.goto(`${BASE}/app`, { waitUntil: 'load' });
page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/Failed to load resource|CORS/.test(m.text())) console.log('console:', m.text().slice(0, 200)); });
await page.getByRole('button', { name: 'Guest' }).click();
await page.fill('#handle', 'browser');
await page.getByRole('button', { name: /Create a guest account/ }).click();
await page.getByText('Your account').waitFor({ timeout: 90000 }).catch(async (e) => { console.log('sign-in state:', await page.locator('#signin').innerText().catch(() => '?')); throw e; });
const account = await page.locator('#signin a.addr').textContent();
console.log('signed in as', account);
await page.waitForFunction(() => !document.querySelector('.hud-chip--wif .skeleton'), null, { timeout: 60000 });
await shot('1-signed-in');
await page.getByRole('button', { name: /Challenge Kumo/ }).click();
await page.waitForURL(/\/app\/battle\/\d+/, { timeout: 120000 });
const id = page.url().split('/').pop();
console.log('match', id);
await page.waitForSelector('.hand .fcard', { timeout: 60000 });
await page.waitForFunction(() => !document.body.innerText.includes('Kick-off in'), null, { timeout: 30000 });
await shot('2-kickoff');
const canvas = page.locator('.board-wrap canvas, canvas').first();
let drops = 0;
for (let i = 0; i < 9; i++) {
  const box = await canvas.boundingBox();
  const card = page.locator('.hand button.fcard:not(.unaffordable):not([disabled])').first();
  if (i === 0) console.log('hand-bar', await page.locator('.hand-bar').evaluate((e) => ({ ...e.dataset })), await page.locator('.clock b').textContent());
  if (await card.count()) {
    await card.click();
    await page.mouse.click(box.x + box.width * (i % 2 ? 0.25 : 0.75), box.y + box.height * 0.72);
    drops++;
  }
  await page.waitForTimeout(3000);
}
await shot('3-mid-battle');
console.log('rows', await page.$$eval('.list-row .t', (e) => e.map((x) => x.textContent)));
console.log('drops', drops);
await page.waitForSelector('.cer-title', { timeout: 120000 });
await page.waitForFunction(() => /Victory|Defeat|Draw|wins/.test(document.querySelector('.cer-title')?.textContent ?? ''), null, { timeout: 180000 });
const result = await page.locator('.cer-title').textContent();
await shot('4-settled');
await page.getByRole('button', { name: /Replay & verify/ }).click();
await page.waitForSelector('.verify', { timeout: 180000 });
const verify = await page.locator('.verify b').textContent();
await shot('5-verified');
const txs = await page.$$eval('.list-row a.mono', (as) => as.map((a) => ({ label: a.closest('.list-row')?.querySelector('.t')?.textContent, url: a.href })));
const evidence = { at: new Date().toISOString(), account, match: id, drops, result, verify, txs, pageErrors: errors };
writeFileSync('docs/evidence-browser-house.json', JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({ result, verify, txs: txs.length, errors }));
await browser.close();
