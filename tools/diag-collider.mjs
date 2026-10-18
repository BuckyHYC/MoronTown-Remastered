import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader','--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 600, height: 400 } });
await page.goto('http://localhost:5174/?quality=low', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__RE__, { timeout: 45000 });
await page.waitForTimeout(800);
const info = await page.evaluate(() => {
  const g = window.__RE__.game;
  const hits = [];
  g.world.colliders.forEach((b, i) => {
    if (750 > b.minX && 750 < b.maxX && 450 > b.minZ && 450 < b.maxZ) hits.push({ i, b });
  });
  return { total: g.world.colliders.length, hits: hits.slice(0, 5) };
});
console.log(JSON.stringify(info).slice(0, 1200));
await browser.close();
