import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu','--use-angle=d3d11','--force_high_performance_gpu','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
page.on('pageerror', (e) => console.log('[pageerror] ' + e.message));
await page.goto('http://localhost:5174/?quality=high&time=day&autostart=1', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__RE__, { timeout: 60000 });
await page.waitForTimeout(2000);
const spot = await page.evaluate(() => {
  const g = window.__RE__.game;
  const p = g.peds.position(7);
  window.__RE__.teleport(p.x + 3.4, p.z);
  return p;
});
await page.waitForTimeout(900);
await page.screenshot({ path: 'docs/screenshots/t-peds2.png' });
console.log(JSON.stringify(spot));
await browser.close();
