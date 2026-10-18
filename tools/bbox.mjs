import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'http://localhost:5174/?quality=low';
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__RE__, { timeout: 60000 });
await page.waitForTimeout(800);

const info = await page.evaluate(() => {
  const THREE = window.THREE;
  const g = window.__RE__.game;
  const body = g.vehicle.body;
  const probe = (name) => {
    const obj = body.getObjectByName(name);
    if (!obj) return { name, missing: true };
    const b = new THREE.Box3().setFromObject(obj);
    return {
      name,
      min: b.min.toArray().map((n) => +n.toFixed(2)),
      max: b.max.toArray().map((n) => +n.toFixed(2)),
      size: b.getSize(new THREE.Vector3()).toArray().map((n) => +n.toFixed(2)),
    };
  };
  const names = [
    'BodyUnderside',
    'BodyRoofPanel',
    'BodyHood',
    'BodyRearPanelsColor1',
    'BodyDoorLColor1',
    'BodyHeadlights',
    'BodyTaillights',
    'WheelFrontL',
    'WheelRearR',
    'InteriorFloor',
  ];
  const whole = new THREE.Box3().setFromObject(body);
  return {
    bodyBox: {
      min: whole.min.toArray().map((n) => +n.toFixed(2)),
      max: whole.max.toArray().map((n) => +n.toFixed(2)),
      size: whole.getSize(new THREE.Vector3()).toArray().map((n) => +n.toFixed(2)),
    },
    parts: names.map(probe),
    childCount: body.children.length,
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
