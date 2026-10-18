import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu','--use-angle=d3d11','--force_high_performance_gpu','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
page.on('pageerror', (e) => console.log('[pageerror] ' + e.message));
await page.goto('http://localhost:5174/?quality=high&time=day&autostart=1', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__RE__, { timeout: 60000 });
await page.waitForTimeout(2000);
const info = await page.evaluate(() => {
  const g = window.__RE__.game;
  const p = g.peds.position(7);
  window.__RE__.teleport(p.x, p.z - 0.15);
  g.vehicle.root.visible = false;
  g.hud.setVisible(false);
  window.__RE__.photo(0, 4.6, 1.55);
  const seen = [];
  g.peds.group.traverse((o) => { if (o.isInstancedMesh) seen.push({ name: o.name, visible: o.visible, count: o.count }); });
  return { p, seen, cam: g.camera.position.toArray() };
});
await page.waitForTimeout(350);
const live = await page.evaluate(() => {
  const g = window.__RE__.game;
  return { ped: g.peds.position(7), cam: g.camera.position.toArray(), pedVisible: g.peds.group.visible };
});
await page.screenshot({ path: 'docs/screenshots/t-peds.png' });
console.log(JSON.stringify({ info, live }));
await browser.close();
