import { expect, test } from '@playwright/test';

type GameWindow = {
  __RE__?: {
    text: () => string;
    stats: () => { fps: number; mode: string; timeOfDay: string };
    start: () => void;
    setTime: (id: string) => void;
  };
};

test('启动进入主菜单且无控制台错误', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?quality=low');
  await page.waitForFunction(() => !!(window as unknown as GameWindow).__RE__, null, { timeout: 60_000 });
  await expect(page.getByRole('button', { name: '开始驾驶' })).toBeVisible();
  const text = await page.evaluate(() => (window as unknown as GameWindow).__RE__!.text());
  expect(JSON.parse(text).mode).toBe('menu');
  expect(errors).toEqual([]);
});

test('从菜单进入驾驶并产生速度', async ({ page }) => {
  await page.goto('/?quality=low');
  await page.waitForFunction(() => !!(window as unknown as GameWindow).__RE__, null, { timeout: 60_000 });
  await page.getByRole('button', { name: '开始驾驶' }).click();
  await page.keyboard.down('w');
  await page.waitForTimeout(2500);
  const state = await page.evaluate(() => JSON.parse((window as unknown as GameWindow).__RE__!.text()));
  await page.keyboard.up('w');
  expect(state.mode).toBe('drive');
  expect(state.player.speedKmh).toBeGreaterThan(5);
});

test('切换昼夜会改变时段并更新场景', async ({ page }) => {
  await page.goto('/?quality=low&autostart=1');
  await page.waitForFunction(() => !!(window as unknown as GameWindow).__RE__, null, { timeout: 60_000 });
  const before = await page.evaluate(() => (window as unknown as GameWindow).__RE__!.stats().timeOfDay);
  await page.keyboard.press('t');
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => (window as unknown as GameWindow).__RE__!.stats().timeOfDay);
  expect(after).not.toBe(before);
});

test('竞速：设置面板可开局并进入倒计时', async ({ page }) => {
  await page.goto('/?quality=low');
  await page.waitForFunction(() => !!(window as unknown as GameWindow).__RE__, null, { timeout: 60_000 });
  await page.getByRole('button', { name: '竞速' }).click();
  await expect(page.getByRole('button', { name: '开始比赛' })).toBeVisible();
  await page.getByRole('button', { name: '开始比赛' }).click();
  await page.waitForTimeout(1500);
  const phase = await page.evaluate(() => {
    const g = (window as unknown as GameWindow).__RE__ as unknown as {
      game?: { race?: { phase: string } };
    };
    return g.game?.race?.phase ?? 'none';
  });
  expect(['countdown', 'racing']).toContain(phase);
});
