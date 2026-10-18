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
await page.waitForTimeout(1000);

// 把相机抬高并抬头看天空（绕过 rig 每帧覆盖）
await page.evaluate(() => {
  const g = window.__RE__.game;
  g.rig.update = () => {};
  g.camera.position.set(300, 3, 450);
  g.camera.lookAt(300, 60, 460);
  g.camera.fov = 70;
  g.camera.updateProjectionMatrix();
});
await page.waitForTimeout(900);
await page.screenshot({ path: 'docs/screenshots/sky-only.png' });

await page.evaluate(() => {
  const g = window.__RE__.game;
  g.scene.fog = null;
});
await page.waitForTimeout(900);
await page.screenshot({ path: 'docs/screenshots/sky-nofog.png' });

const info = await page.evaluate(() => {
  const g = window.__RE__.game;
  const sky = g.sky.sky;
  const u = sky.material.uniforms;
  return {
    visible: sky.visible,
    scale: sky.scale.x,
    sunPos: u.sunPosition.value.toArray().map((n) => +n.toFixed(3)),
    turbidity: u.turbidity.value,
    rayleigh: u.rayleigh.value,
    mie: u.mieCoefficient.value,
    exposure: g.engine.renderer.toneMappingExposure,
    envIntensity: g.scene.environmentIntensity,
    fog: g.scene.fog ? { type: g.scene.fog.constructor.name } : null,
    background: g.scene.background,
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
