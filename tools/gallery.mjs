/**
 * 基准图集：一次性抓 6 张对标 GIF 的基准截图（走独显，1080p）。
 * 用法：node tools/gallery.mjs [url] [outDir]
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5174/';
const outDir = process.argv[3] ?? 'docs/screenshots';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-gpu', '--use-angle=d3d11', '--force_high_performance_gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

const shot = async (name, wait = 1800) => {
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log('saved ' + name);
};

const load = async (query) => {
  await page.goto(base + query, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => !!window.__RE__, { timeout: 60000 });
};

// 1. 主菜单（英雄车展示）
await load('?quality=high&time=day');
await shot('menu-day', 2600);

// 2. 车库
await page.locator('[data-act="garage"]').click();
await shot('garage', 1400);
await page.locator('[data-act="close"]').click().catch(() => {});

// 3. 白天追尾
await load('?quality=high&time=day&autostart=1');
await page.keyboard.down('KeyW');
await shot('day-chase', 2600);
await page.keyboard.up('KeyW');

// 4. 夜间追尾
await load('?quality=high&time=night&autostart=1');
await shot('night-chase', 2600);

// 5. 夜间下雨
await load('?quality=high&time=night&rain=1&autostart=1');
await shot('night-rain', 3200);

// 6. 座舱
await load('?quality=high&time=dusk&autostart=1');
await page.waitForTimeout(1500);
await page.keyboard.press('KeyC');
await page.waitForTimeout(900);
await page.keyboard.press('KeyC');
await page.waitForTimeout(2000);
await shot('cockpit', 1200);

console.log(JSON.stringify(await page.evaluate(() => window.__RE__.stats())));
await browser.close();
