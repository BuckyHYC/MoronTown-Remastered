import { expect, test } from '@playwright/test';

type GameWindow = {
  __RE__?: {
    stats: () => { speedKmh: number; touch: boolean };
    input: { state: { steer: number; throttle: number } };
  };
};

/** 触屏：?touch=1 强制挂载虚拟摇杆与踏板 */
test('触屏：油门踏板可驱动车辆，摇杆产生转向输入', async ({ page }) => {
  await page.goto('/?touch=1&quality=low&autostart=1');
  await page.waitForFunction(() => !!(window as unknown as GameWindow).__RE__, null, { timeout: 60_000 });
  await page.waitForTimeout(1500);

  const touchActive = await page.evaluate(() => (window as unknown as GameWindow).__RE__!.stats().touch);
  expect(touchActive).toBe(true);
  await expect(page.locator('.touch-ui')).toBeVisible();

  const gas = await page.locator('.touch-gas').boundingBox();
  expect(gas).not.toBeNull();
  await page.mouse.move(gas!.x + gas!.width / 2, gas!.y + gas!.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(2600);
  const speed = await page.evaluate(() => (window as unknown as GameWindow).__RE__!.stats().speedKmh);
  await page.mouse.up();
  expect(speed).toBeGreaterThan(15);

  // 摇杆右推 → steer > 0
  const stick = await page.locator('.touch-stick').boundingBox();
  const cx = stick!.x + stick!.width / 2;
  const cy = stick!.y + stick!.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 44, cy);
  await page.waitForTimeout(400);
  const steer = await page.evaluate(() => (window as unknown as GameWindow).__RE__!.input.state.steer);
  await page.mouse.up();
  expect(steer).toBeGreaterThan(0.5);
});
