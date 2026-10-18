import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5174/?quality=medium';
const prefix = process.argv[3] ?? 'docs/screenshots/photo';
mkdirSync('docs/screenshots', { recursive: true });

const shots = [
  { name: 'front', deg: 90, radius: 7.5, height: 1.3 },
  { name: 'q34', deg: 135, radius: 8, height: 2.2 },
  { name: 'side', deg: 0, radius: 9, height: 1.4 },
  { name: 'rear34', deg: 300, radius: 8, height: 2.0 },
  { name: 'top', deg: 135, radius: 9, height: 7 },
];

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(base, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__RE__, { timeout: 60000 });
await page.waitForTimeout(1200);

for (const shot of shots) {
  await page.evaluate(
    ([deg, radius, height]) => window.__RE__.photo(deg, radius, height),
    [shot.deg, shot.radius, shot.height],
  );
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `${prefix}-${shot.name}.png` });
  console.log('shot', shot.name);
}
await browser.close();
