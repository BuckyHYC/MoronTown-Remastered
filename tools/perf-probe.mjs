/**
 * 真实 GPU 性能探针：node tools/perf-probe.mjs [quality] [seconds]
 * 默认 high 档、1920×1080、行驶状态，输出平均/1% low FPS 与渲染统计。
 */
import { chromium } from '@playwright/test';

const quality = process.argv[2] ?? 'high';
const seconds = Number(process.argv[3] ?? 10);
const extra = process.argv[4] ?? '';
const url = `http://localhost:5174/?quality=${quality}&autostart=1${extra}`;

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--enable-gpu', '--use-angle=d3d11', '--force_high_performance_gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => !!window.__RE__, { timeout: 60000 });
await page.waitForTimeout(2500);
// 行驶状态下测量（油门按住，含运动模糊/反射/车流）
await page.keyboard.down('KeyW');

const result = await page.evaluate(async ({ duration, quality }) => {
  const game = window.__RE__.game;
  const gpu = (() => {
    const gl = game.engine.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
  })();
  const frames = [];
  let last = 0;
  const start = performance.now();
  await new Promise((resolve) => {
    const tick = (now) => {
      if (last > 0 && now > last) frames.push(now - last);
      last = now;
      if (now - start < duration * 1000) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
  const fps = frames.map((d) => 1000 / d);
  const sorted = [...fps].sort((a, b) => a - b);
  const avg = fps.reduce((sum, v) => sum + v, 0) / Math.max(1, fps.length);
  const p1 = sorted[Math.floor(sorted.length * 0.01)] ?? 0;
  const stats = game.stats;
  return {
    gpu,
    samples: fps.length,
    avgFps: +avg.toFixed(1),
    low1Fps: +p1.toFixed(1),
    minFps: +Math.min(...fps).toFixed(1),
    maxFps: +Math.max(...fps).toFixed(1),
    drawCalls: stats.drawCalls,
    triangles: stats.triangles,
    pixelRatio: stats.pixelRatio,
    quality,
    timeOfDay: stats.timeOfDay,
  };
}, { duration: seconds, quality });

await page.keyboard.up('KeyW');
console.log(JSON.stringify(result, null, 2));
await browser.close();



