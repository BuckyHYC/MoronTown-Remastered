/**
 * 截图脚本：node tools/shot.mjs [url] [outPath] [waitMs]
 * 默认复用已启动的 dev server（5174）。
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const url = process.argv[2] ?? 'http://localhost:5174/?quality=high';
const out = process.argv[3] ?? 'docs/screenshots/slice.png';
const waitMs = Number(process.argv[4] ?? 3000);
mkdirSync(dirname(out), { recursive: true });

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const logs = [];
page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));

const started = Date.now();
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page
  .waitForFunction(() => !!window.__RE__, { timeout: 45000 })
  .catch(() => console.log('WARN: __RE__ 未就绪'));
await page.waitForTimeout(waitMs);
await page.screenshot({ path: out });

const text = await page.evaluate(() => (window.__RE__ ? window.__RE__.text() : 'no __RE__'));
const stats = await page.evaluate(() => (window.__RE__ ? window.__RE__.stats() : null));
console.log('elapsed_ms=' + (Date.now() - started));
console.log('text=' + text);
console.log('stats=' + JSON.stringify(stats));
console.log(logs.slice(0, 25).join('\n'));
await browser.close();
