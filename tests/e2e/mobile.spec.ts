import { expect, test } from '@playwright/test';

type WheelInfo = { name: string; steer: number; caliperFixed: boolean };

type GameWindow = {
  __RE__?: {
    stats: () => { touch: boolean; camera: string };
    game: {
      vehicle: {
        wheels: { name: string; steer: { rotation: { y: number }; children: { name: string }[] } }[];
      };
      input: { setTouch: (s: number, t: number, b: number, h: boolean) => void };
    };
    text: () => string;
  };
};

/** 手机端：触屏暂停键 → 返回主菜单；前轮卡钳不随轮毂旋转 */
test('手机端：暂停键可返回主菜单', async ({ page }) => {
  await page.goto('/?touch=1&quality=low&autostart=1');
  await page.waitForFunction(() => !!(window as unknown as GameWindow).__RE__, null, { timeout: 60_000 });
  await page.waitForTimeout(1200);

  await page.locator('.touch-pause').click();
  await expect(page.locator('.pause')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('.pause [data-act="menu"]')).toBeVisible();

  await page.locator('.pause [data-act="menu"]').click();
  await expect(page.locator('.menu')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('.pause')).toBeHidden();
});

test('前轮：卡钳固定在转向节上，只转向不滚转', async ({ page }) => {
  await page.goto('/?touch=1&quality=low&autostart=1');
  await page.waitForFunction(() => !!(window as unknown as GameWindow).__RE__, null, { timeout: 60_000 });
  await page.waitForTimeout(1200);

  await page.evaluate(() => (window as unknown as GameWindow).__RE__!.game.input.setTouch(1, 0, 0, false));
  await page.waitForTimeout(900);
  const wheels: WheelInfo[] = await page.evaluate(() =>
    (window as unknown as GameWindow)
      .__RE__!.game.vehicle.wheels.map((w) => ({
        name: w.name,
        steer: w.steer.rotation.y,
        caliperFixed: w.steer.children.some((c) => /BrakePad/i.test(c.name)),
      })),
  );
  const front = wheels.find((w) => w.name === 'WheelFrontL');
  expect(front).toBeTruthy();
  expect(front!.caliperFixed).toBe(true);
  expect(front!.steer).toBeGreaterThan(0.05);
});

