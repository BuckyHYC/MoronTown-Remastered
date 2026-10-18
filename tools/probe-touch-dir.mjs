import { chromium, devices } from '@playwright/test';
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu','--use-angle=d3d11','--force_high_performance_gpu','--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ ...devices['iPhone 12'], viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror] ' + e.message));
await page.goto('http://localhost:5174/?quality=medium&autostart=1', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__RE__, { timeout: 60000 });
await page.waitForTimeout(2500);
console.log('touch=' + await page.evaluate(() => window.__RE__.stats().touch));
// 用 CDP 触摸事件拖摇杆向右
const box = await page.locator('.touch-stick').boundingBox();
const cx = Math.round(box.x + box.width / 2), cy = Math.round(box.y + box.height / 2);
const cdp = await ctx.newCDPSession(page);
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
const before = await page.evaluate(() => ({ h: window.__RE__.game.dynamics.state.heading, s: window.__RE__.game.dynamics.state.steerAngle }));
await touch('touchStart', cx, cy);
await touch('touchMove', cx + 46, cy);
await page.waitForTimeout(600);
const mid = await page.evaluate(() => ({ steer: window.__RE__.game.dynamics.state.steerAngle, input: window.__RE__.game.input.state.steer }));
// 同时踩油门
const gas = await page.locator('.touch-gas').boundingBox();
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx + 46, y: cy, id: 1 }, { x: Math.round(gas.x + gas.width/2), y: Math.round(gas.y + gas.height/2), id: 2 }] });
await page.waitForTimeout(2200);
const after = await page.evaluate(() => ({ h: window.__RE__.game.dynamics.state.heading, speed: window.__RE__.stats().speedKmh }));
await touch('touchEnd', 0, 0);
console.log(JSON.stringify({ before, mid, after }));
await page.screenshot({ path: 'docs/screenshots/mobile-drive.png' });
await browser.close();
