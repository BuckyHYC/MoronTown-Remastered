import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu','--use-angle=d3d11','--force_high_performance_gpu','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
page.on('pageerror', (e) => console.log('[pageerror] ' + e.message));
await page.goto('http://localhost:5174/?quality=high&time=day&autostart=1', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__RE__, { timeout: 60000 });
await page.waitForTimeout(2200);
// 打满右舵
await page.evaluate(() => window.__RE__.game.input.setTouch(1, 0, 0, false));
await page.waitForTimeout(1200);
const info = await page.evaluate(() => {
  const v = window.__RE__.game.vehicle;
  const sw = v.steeringWheel;
  const wheels = v.wheels.map((w) => ({ name: w.name, steerY: +w.steer.rotation.y.toFixed(3), rollX: +w.roll.rotation.x.toFixed(2), children: w.steer.children.map((c) => c.name) }));
  const box = sw ? new (window.THREE_BOX3 || Object)() : null;
  return { wheels, steerAngle: +window.__RE__.game.dynamics.state.steerAngle.toFixed(3), wheelRadius: v.wheelRadius, swName: sw?.name ?? null, wheelsLen: v.wheels.length, box };
});
console.log(JSON.stringify(info, null, 1).slice(0, 2000));
await page.evaluate(() => window.__RE__.photo(0, 6.5, 1.1));
await page.waitForTimeout(1200);
await page.screenshot({ path: 'docs/screenshots/t-wheel-front.png' });
await page.evaluate(() => window.__RE__.photo(35, 7, 1.4));
await page.waitForTimeout(1000);
await page.screenshot({ path: 'docs/screenshots/t-wheel-34.png' });
await browser.close();
