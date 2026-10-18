import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu','--use-angle=d3d11','--force_high_performance_gpu','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
await page.goto('http://localhost:5174/?quality=low&autostart=1', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__RE__, { timeout: 60000 });
await page.waitForTimeout(1500);
const out = await page.evaluate(() => {
  const g = window.__RE__.game;
  const v = g.vehicle;
  const rim = [];
  v.wheels.forEach((w) => {
    w.steer.rotation.y = 0;
    w.roll.rotation.x = 0;
    v.body.updateMatrixWorld(true);
    const roll = w.steer.children.find((c) => c.name.startsWith('roll-'));
    const rimMesh = roll.getObjectByName(w.name + 'Rim');
    const disc = roll.getObjectByName(w.name + 'BrakeDisc');
    const measure = (mesh) => {
      if (!mesh) return null;
      const box3 = new mesh.constructor().geometry.boundingBox;
      return null;
    };
    // 用关卡盒工具：直接遍历顶点求世界包围盒
    const worldBox = (obj) => {
      let min = [Infinity, Infinity, Infinity];
      let max = [-Infinity, -Infinity, -Infinity];
      obj.updateMatrixWorld(true);
      obj.traverse((child) => {
        const geo = child.geometry;
        if (!geo) return;
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i += 7) {
          const p = new child.geometry.attributes.position.constructor === undefined ? null : null;
          void p;
        }
        geo.computeBoundingBox();
        const bb = geo.boundingBox;
        const corners = [
          [bb.min.x, bb.min.y, bb.min.z], [bb.max.x, bb.min.y, bb.min.z],
          [bb.min.x, bb.max.y, bb.min.z], [bb.max.x, bb.max.y, bb.min.z],
          [bb.min.x, bb.min.y, bb.max.z], [bb.max.x, bb.min.y, bb.max.z],
          [bb.min.x, bb.max.y, bb.max.z], [bb.max.x, bb.max.y, bb.max.z],
        ];
        for (const c of corners) {
          const vec = new child.position.constructor(c[0], c[1], c[2]);
          vec.applyMatrix4(child.matrixWorld);
          min = [Math.min(min[0], vec.x), Math.min(min[1], vec.y), Math.min(min[2], vec.z)];
          max = [Math.max(max[0], vec.x), Math.max(max[1], vec.y), Math.max(max[2], vec.z)];
        }
      });
      return { min, max, center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2] };
    };
    const pivotWorld = w.steer.getWorldPosition(new w.steer.position.constructor());
    const rimBox = rimMesh ? worldBox(rimMesh) : null;
    const discBox = disc ? worldBox(disc) : null;
    rim.push({ name: w.name, pivot: pivotWorld.toArray().map((n) => +n.toFixed(3)), rimCenter: rimBox?.center.map((n) => +n.toFixed(3)), discCenter: discBox?.center.map((n) => +n.toFixed(3)) });
  });
  return rim;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
