/**
 * 座舱眼点扫描：逐个候选位置截图，用于挑出「能看到仪表/方向盘且不被车壳遮挡」的眼点。
 * 用法：node tools/eye-sweep.mjs [url]
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:5174/?quality=medium&time=day&autostart=1';
mkdirSync('docs/screenshots/eyes', { recursive: true });

const candidates = [
  { name: 'a', x: -0.34, y: 1.14, z: 0.1 },
  { name: 'b', x: -0.34, y: 1.1, z: 0.5 },
  { name: 'c', x: -0.34, y: 1.18, z: 0.35 },
  { name: 'd', x: -0.34, y: 1.22, z: -0.1 },
];

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
page.on('pageerror', (err) => console.log('[pageerror]', err.message));
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => !!window.__RE__, { timeout: 45000 });
await page.waitForTimeout(2500);

for (const c of candidates) {
  await page.evaluate(([x, y, z]) => window.__RE__.eye(x, y, z), [c.x, c.y, c.z]);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `docs/screenshots/eyes/eye-${c.name}.png` });
  console.log(`eye-${c.name} x=${c.x} y=${c.y} z=${c.z}`);
}
await browser.close();
