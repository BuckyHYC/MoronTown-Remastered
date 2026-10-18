import { expect, test } from '@playwright/test';

type GameWindow = {
  __RE__?: {
    start: () => void;
    teleport: (x: number, z: number) => void;
    tasks: () => { x: number; z: number; layoutIndex: number; label: string }[];
  };
};

/** 任务点：自由漫游开到圆环即弹出对应赛道的竞速设置 */
test('任务点：进入圆环打开竞速设置并预选赛道', async ({ page }) => {
  await page.goto('/?quality=low');
  await page.waitForFunction(() => !!(window as unknown as GameWindow).__RE__, null, { timeout: 60_000 });
  await page.waitForTimeout(800);

  const tasks = await page.evaluate(() => (window as unknown as GameWindow).__RE__!.tasks());
  expect(tasks.length).toBe(3);

  await page.evaluate(() => (window as unknown as GameWindow).__RE__!.start());
  await page.waitForTimeout(600);
  await page.evaluate(
    ([x, z]) => (window as unknown as GameWindow).__RE__!.teleport(x, z),
    [tasks[1].x, tasks[1].z],
  );

  await expect(page.locator('.race-setup')).toBeVisible({ timeout: 10_000 });
  const activeLayout = await page.locator('[data-layouts] button.active').innerText();
  expect(activeLayout).toBe('城市巡回');
});
