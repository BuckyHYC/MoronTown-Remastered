import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu','--use-angle=d3d11','--force_high_performance_gpu','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
await page.goto('http://localhost:5174/?quality=high&time=day&autostart=1', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__RE__, { timeout: 60000 });
await page.waitForTimeout(2000);
await page.evaluate(() => {
  const g = window.__RE__.game;
  const p = g.peds.position(9);
  window.__RE__.teleport(p.x + 2.6, p.z + 2.6);
  window.__RE__.photo(210, 6.4, 1.9);
});
await page.waitForTimeout(1200);
await page.screenshot({ path: 'docs/screenshots/t-peds3.png' });
console.log('ok');
await browser.close();
