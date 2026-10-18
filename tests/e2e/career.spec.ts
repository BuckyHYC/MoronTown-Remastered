import { expect, test } from '@playwright/test';

type GameWindow = {
  __RE__?: {
    game: {
      save: {
        data: {
          coins: number;
          daily: { checkInDate: string; checkInStreak: number; date: string; done: string[] };
        };
        save: () => void;
      };
    };
  };
};

test('生涯：每日签到发放奖励并累加连续天数', async ({ page }) => {
  await page.goto('/?quality=low');
  await page.waitForFunction(() => !!(window as unknown as GameWindow).__RE__, null, { timeout: 60_000 });

  await page.evaluate(() => {
    const g = (window as unknown as GameWindow).__RE__!.game;
    g.save.data.coins = 0;
    g.save.data.daily.checkInDate = '';
    g.save.data.daily.checkInStreak = 0;
    g.save.save();
  });

  await page.getByRole('button', { name: '生涯' }).click();
  await page.getByRole('button', { name: /领取第 1 天/ }).click();
  await page.waitForTimeout(400);

  const state = await page.evaluate(() => {
    const d = (window as unknown as GameWindow).__RE__!.game.save.data;
    return { coins: d.coins, streak: d.daily.checkInStreak, date: d.daily.checkInDate };
  });
  expect(state.coins).toBe(50);
  expect(state.streak).toBe(1);
  expect(state.date).not.toBe('');
});
