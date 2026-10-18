import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu','--use-angle=d3d11','--force_high_performance_gpu','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
page.on('pageerror', (e) => console.log('[pageerror] ' + e.message));
await page.goto('http://localhost:5174/?quality=medium&autostart=1', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__RE__, { timeout: 60000 });
await page.waitForTimeout(2000);
const out = await page.evaluate(() => {
  const g = window.__RE__.game;
  const shirt = g.peds.group.getObjectByName('pedestrian-shirt');
  const m = shirt.instanceMatrix.array;
  const i = 7;
  const o = i * 16;
  const geo = shirt.geometry;
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  return {
    instance: [m[o + 12], m[o + 13], m[o + 14]],
    scale: [m[o], m[o + 5], m[o + 10]],
    expected: g.peds.position(7),
    bbox: [bb.min.toArray(), bb.max.toArray()],
    verts: geo.attributes.position.count,
    hasColor: !!geo.attributes.color,
    sphere: shirt.boundingSphere ? { c: shirt.boundingSphere.center.toArray(), r: shirt.boundingSphere.radius } : null,
    visible: shirt.visible,
    culled: shirt.frustumCulled,
  };
});
console.log(JSON.stringify(out));
await browser.close();
