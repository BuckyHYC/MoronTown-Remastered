import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu','--use-angle=d3d11','--force_high_performance_gpu','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
page.on('pageerror', (e) => console.log('[pageerror] ' + e.message));
await page.goto('http://localhost:5174/?quality=high&time=day&autostart=1', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__RE__, { timeout: 60000 });
await page.waitForTimeout(2500);
// 找一辆交通车，把玩家放到它后面 6m 观察
const car = await page.evaluate(() => {
  const list = window.__RE__.game.traffic.colliders();
  return list[3];
});
await page.evaluate(([x, z]) => window.__RE__.teleport(x - 9, z), [car.x, car.z]);
await page.waitForTimeout(1500);
await page.screenshot({ path: 'docs/screenshots/traffic-car.png' });
console.log(JSON.stringify(car));
await browser.close();
