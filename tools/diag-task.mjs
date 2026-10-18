import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader','--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
page.on('pageerror', (e) => console.log('[pageerror] ' + e.message));
await page.goto('http://localhost:5174/?quality=low', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__RE__, { timeout: 45000 });
await page.waitForTimeout(1000);
console.log('tasks=' + JSON.stringify(await page.evaluate(() => window.__RE__.tasks())));
await page.evaluate(() => window.__RE__.start());
await page.waitForTimeout(800);
await page.evaluate(() => window.__RE__.teleport(750, 450));
await page.waitForTimeout(1500);
const info = await page.evaluate(() => ({
  text: window.__RE__.text(),
  setup: document.querySelector('.race-setup')?.className,
  groupVisible: window.__RE__.game.tasks.group.visible,
  player: [window.__RE__.game.dynamics.state.x, window.__RE__.game.dynamics.state.z],
}));
console.log(JSON.stringify(info));
await browser.close();
