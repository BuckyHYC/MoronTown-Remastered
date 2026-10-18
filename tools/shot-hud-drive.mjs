import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu','--use-angle=d3d11','--force_high_performance_gpu','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
await page.goto('http://localhost:5174/?quality=high&time=day&autostart=1', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__RE__, { timeout: 60000 });
await page.waitForTimeout(2000);
await page.evaluate(() => window.__RE__.game.input.setTouch(0, 1, 0, false));
await page.waitForTimeout(3200);
await page.screenshot({ path: 'docs/screenshots/t-hud-drive.png' });
const info = await page.evaluate(() => ({ speed: window.__RE__.stats().speedKmh, rpm: window.__RE__.game.dynamics.state.rpm }));
console.log(JSON.stringify(info));
await browser.close();

