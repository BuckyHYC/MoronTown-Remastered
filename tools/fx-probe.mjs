/**
 * 特效探针：加速 → 手刹转向漂移，验证胎痕/胎烟是否产生。
 * 用法：node tools/fx-probe.mjs [url]
 */
import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'http://localhost:5174/?quality=high&time=day&autostart=1';
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const logs = [];
page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => !!window.__RE__, { timeout: 45000 });
await page.waitForTimeout(2500);

const press = async (keys, ms) => {
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  for (const k of keys) await page.keyboard.up(k);
};

await press(['KeyW'], 2600);
const before = await page.evaluate(() => window.__RE__.stats());
await press(['KeyW', 'KeyA', 'Space'], 1800);
await page.waitForTimeout(200);
const after = await page.evaluate(() => window.__RE__.stats());
await page.screenshot({ path: 'docs/screenshots/fx-drift.png' });
console.log('before=' + JSON.stringify(before.fx) + ' speed=' + before.speedKmh);
console.log('after=' + JSON.stringify(after.fx) + ' speed=' + after.speedKmh);
console.log(logs.slice(0, 15).join('\n'));
await browser.close();
