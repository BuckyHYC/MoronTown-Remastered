import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu','--use-angle=d3d11','--force_high_performance_gpu','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
await page.goto('http://localhost:5174/?quality=low&time=day&autostart=1', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__RE__, { timeout: 60000 });
await page.waitForTimeout(2000);
const start = await page.evaluate(() => {
  const g = window.__RE__.game;
  g.input.setTouch(0, 1, 0, false);
  return { x: g.dynamics.state.x, z: g.dynamics.state.z };
});
await page.waitForTimeout(1500);
await page.evaluate(() => window.__RE__.game.input.setTouch(1, 1, 0, false));
const a = await page.evaluate(() => {
  const g = window.__RE__.game;
  return { x: g.dynamics.state.x, z: g.dynamics.state.z, h: g.dynamics.state.heading, cam: g.camera.position.toArray(), dir: g.camera.getWorldDirection(new window.__RE__.game.camera.position.constructor()).toArray() };
});
await page.waitForTimeout(900);
const b = await page.evaluate(() => {
  const g = window.__RE__.game;
  return { x: g.dynamics.state.x, z: g.dynamics.state.z, h: g.dynamics.state.heading, speed: window.__RE__.stats().speedKmh };
});
const d = { x: b.x - a.x, z: b.z - a.z };
const len = Math.hypot(d.x, d.z) || 1;
d.x /= len; d.z /= len;
// 相机右向量 = forward × up
const f = a.dir;
const right = { x: f[2], y: 0, z: -f[0] };
const dot = d.x * right.x + d.z * right.z;
console.log(JSON.stringify({ start, a, b, dir: d, camRight: right, screenRightDot: +dot.toFixed(3), headingDelta: +(b.h - a.h).toFixed(3) }, null, 1));
await browser.close();
