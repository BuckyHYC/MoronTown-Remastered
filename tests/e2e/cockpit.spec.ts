import { expect, test } from '@playwright/test';

type Stats = {
  cockpit: boolean;
  drawCalls: number;
  triangles: number;
};
type GameWindow = {
  __RE__?: {
    stats: () => Stats;
    text: () => string;
  };
};

/**
 * 座舱视角守卫：M1 硬指标「座舱内饰可见」。
 * 断言链路：C 键切到座舱 → 车外壳被隐藏（否则相机在车壳内部，画面全黑）→ 截图不是纯色。
 */
test('座舱视角进入后隐藏车壳并渲染出内饰（非黑屏）', async ({ page }) => {
  await page.goto('/?quality=medium&autostart=1');
  await page.waitForFunction(() => !!(window as unknown as GameWindow).__RE__, null, { timeout: 60_000 });
  await page.waitForTimeout(2500);

  // 相机循环是逐个消费的：每次按键后等状态真的切过去，避免低帧率下两次按键被合并
  const camMode = async (): Promise<string> =>
    (JSON.parse(await page.evaluate(() => (window as unknown as GameWindow).__RE__!.text())) as { camera: string })
      .camera;
  for (const target of ['hood', 'cockpit']) {
    await page.keyboard.press('KeyC');
    await expect.poll(camMode, { timeout: 12_000, intervals: [400] }).toBe(target);
  }
  await page.waitForTimeout(1200);

  const text = JSON.parse(await page.evaluate(() => (window as unknown as GameWindow).__RE__!.text())) as {
    camera: string;
  };
  expect(text.camera).toBe('cockpit');

  const stats = await page.evaluate(() => (window as unknown as GameWindow).__RE__!.stats());
  expect(stats.cockpit).toBe(true);

  let bytes = 0;
  for (let i = 0; i < 5; i += 1) {
    const shot = await page.screenshot();
    bytes = Math.max(bytes, shot.byteLength);
    if (bytes > 60_000) break;
    await page.waitForTimeout(1200);
  }
  expect(bytes).toBeGreaterThan(60_000);

  // 回到追尾视角后车壳恢复可见（SwiftShader 帧率低，用轮询等状态收敛）
  await page.keyboard.press('KeyC');
  await expect
    .poll(
      async () => (await page.evaluate(() => (window as unknown as GameWindow).__RE__!.stats())).cockpit,
      { timeout: 10_000, intervals: [400] },
    )
    .toBe(false);
});
