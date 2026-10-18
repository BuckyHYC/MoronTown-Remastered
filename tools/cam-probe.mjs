/**
 * 视角探针：追尾 → 引擎盖 → 座舱 各截一张。
 * 用法：node tools/cam-probe.mjs [url] [prefix]
 */
import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'http://localhost:5174/?quality=high&time=day&autostart=1';
const prefix = process.argv[3] ?? 'docs/screenshots/cam';
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (err) => console.log('[pageerror]', err.message));
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => !!window.__RE__, { timeout: 45000 });
await page.waitForTimeout(3000);

const names = ['chase', 'hood', 'cockpit'];
for (const name of names) {
  await page.screenshot({ path: `${prefix}-${name}.png` });
  const text = await page.evaluate(() => window.__RE__.text());
  console.log(name + ' ' + text);
  await page.keyboard.press('KeyC');
  await page.waitForTimeout(2200);
}
await browser.close();

