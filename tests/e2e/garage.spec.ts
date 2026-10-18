import { expect, test } from '@playwright/test';

type GameWindow = {
  __RE__?: {
    game: {
      save: {
        data: { coins: number; car: { id: string; color: string; owned: string[] } };
        save: () => void;
      };
      menu: { setCoins: (n: number) => void };
      dynamics: { spec: { id: string } };
    };
  };
};

test('车库：购买警用车并装备后写入存档与动力学参数', async ({ page }) => {
  await page.goto('/?quality=low');
  await page.waitForFunction(() => !!(window as unknown as GameWindow).__RE__, null, { timeout: 60_000 });
  await page.evaluate(() => {
    const g = (window as unknown as GameWindow).__RE__!.game;
    g.save.data.coins = 6000;
    g.save.save();
    g.menu.setCoins(6000);
  });

  await page.getByRole('button', { name: '车库' }).click();
  await page.getByRole('button', { name: /警用拦截车/ }).click();
  await page.getByRole('button', { name: /购买并装备/ }).click();
  await page.waitForTimeout(400);

  const state = await page.evaluate(() => {
    const g = (window as unknown as GameWindow).__RE__!.game;
    return {
      coins: g.save.data.coins,
      id: g.save.data.car.id,
      owned: g.save.data.car.owned,
      spec: g.dynamics.spec.id,
    };
  });
  expect(state.coins).toBe(3200);
  expect(state.id).toBe('police');
  expect(state.owned).toContain('police');
  expect(state.spec).toBe('police');
});
