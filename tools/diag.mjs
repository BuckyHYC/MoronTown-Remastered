import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'http://localhost:5174/?quality=low';
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__RE__, { timeout: 60000 });
await page.waitForTimeout(1500);
const info = await page.evaluate(() => {
  const g = window.__RE__.game;
  const v = g.vehicle;
  const cam = g.camera;
  const s = g.dynamics.state;
  return {
    cam: cam.position.toArray().map((n) => +n.toFixed(2)),
    camQuat: cam.quaternion.toArray().map((n) => +n.toFixed(2)),
    fov: cam.fov,
    car: v.root.position.toArray().map((n) => +n.toFixed(2)),
    carRotY: +v.root.rotation.y.toFixed(2),
    bodyRot: [v.body.rotation.x, v.body.rotation.y, v.body.rotation.z].map((n) => +n.toFixed(2)),
    size: v.size.toArray().map((n) => +n.toFixed(2)),
    wheelBase: +v.wheelBase.toFixed(2),
    wheelRadius: +v.wheelRadius.toFixed(3),
    wheels: v.wheels.map((w) => ({ axle: w.axle, side: w.side, pos: w.steer.position.toArray().map((n) => +n.toFixed(2)) })),
    state: { x: +s.x.toFixed(2), z: +s.z.toFixed(2), h: +s.heading.toFixed(2) },
    rigMode: g.rig.mode,
    seat: v.seatPosition.toArray().map((n) => +n.toFixed(2)),
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
