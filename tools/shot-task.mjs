import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader','--use-angle=swiftshader','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('[pageerror] ' + e.message));
await page.goto('http://localhost:5174/?quality=high&time=dusk&autostart=1', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__RE__, { timeout: 60000 });
await page.waitForTimeout(2500);
await page.evaluate(() => window.__RE__.teleport(255, 300));
await page.waitForTimeout(2000);
await page.screenshot({ path: 'docs/screenshots/task-point.png' });
console.log(await page.evaluate(() => window.__RE__.text()));
await browser.close();

