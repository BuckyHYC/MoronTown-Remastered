import { expect, test } from '@playwright/test';

type GameWindow = {
  __RE__?: {
    stats: () => { drawCalls: number; triangles: number; timeOfDay: string };
    setTime: (id: string) => void;
  };
};

/**
 * 渲染回归守卫：黑屏事故（合成器输出全黑但 drawcall 正常）无法靠 stats 发现，
 * 因此用截图像素量做代理断言——正常夜间画面 PNG 体积远大于纯色黑屏。
 */
test('夜间画面不是黑屏（渲染回归守卫）', async ({ page }) => {
  await page.goto('/?quality=medium&autostart=1&time=night');
  await page.waitForFunction(() => !!(window as unknown as GameWindow).__RE__, null, { timeout: 60_000 });
  await page.waitForTimeout(3500);
  const stats = await page.evaluate(() => (window as unknown as GameWindow).__RE__!.stats());
  expect(stats.triangles).toBeGreaterThan(50_000);
  expect(stats.timeOfDay).toBe('night');

  const shot = await page.screenshot();
  expect(shot.byteLength).toBeGreaterThan(60_000);
});

test('白天画面不是黑屏（渲染回归守卫）', async ({ page }) => {
  await page.goto('/?quality=medium&autostart=1');
  await page.waitForFunction(() => !!(window as unknown as GameWindow).__RE__, null, { timeout: 60_000 });
  await page.waitForTimeout(3500);
  const shot = await page.screenshot();
  expect(shot.byteLength).toBeGreaterThan(60_000);
});
