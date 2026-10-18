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
  const v = g.vehicle;
  const box = (obj) => {
    const b = new THREE.Box3().setFromObject(obj);
    return {
      min: b.min.toArray().map((n) => +n.toFixed(2)),
      max: b.max.toArray().map((n) => +n.toFixed(2)),
      size: b.getSize(new THREE.Vector3()).toArray().map((n) => +n.toFixed(2)),
    };
  };
  const tireMeshes = [];
  v.body.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (mats.some((m) => /tire/i.test(m?.name ?? ''))) {
      tireMeshes.push({ name: o.name || '(no name)', parent: o.parent?.name, box: box(o) });
    }
  });
  return {
    vehicleSize: v.size.toArray().map((n) => +n.toFixed(2)),
    bodyBox: box(v.body),
    wheels: v.wheels.map((w) => ({
      id: `${w.axle}-${w.side}`,
      steerPos: w.steer.position.toArray().map((n) => +n.toFixed(2)),
      rollChildren: w.roll.children.map((c) => c.name || '(mesh)'),
      rollBox: box(w.roll),
    })),
    tires: tireMeshes,
    rawChildren: v.body.children.map((c) => c.name || c.type),
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
