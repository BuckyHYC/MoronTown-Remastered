import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu','--use-angle=d3d11','--force_high_performance_gpu','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
page.on('pageerror', (e) => console.log('[pageerror] ' + e.message));
await page.goto('http://localhost:5174/?quality=high&time=day', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__RE__, { timeout: 60000 });
await page.waitForTimeout(2000);
await page.locator('[data-act="race"]').click();
await page.waitForTimeout(700);
await page.locator('.race-go[data-act="start"]').click();
await page.waitForTimeout(4500);
await page.screenshot({ path: 'docs/screenshots/race-ai-cars.png' });
console.log(JSON.stringify(await page.evaluate(() => window.__RE__.stats())));
await browser.close();

