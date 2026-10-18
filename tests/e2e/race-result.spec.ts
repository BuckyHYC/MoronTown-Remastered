import { expect, test } from '@playwright/test';

type GameWindow = {
  __RE__?: {
    game: {
      save: { data: { coins: number; stats: { races: number; raceWins: number } }; save: () => void };
      finishRace: (result: {
        position: number;
        totalRacers: number;
        totalMs: number;
        bestLapMs: number;
        laps: number;
        difficulty: string;
        layoutName: string;
      }) => void;
      race: { phase: string } | null;
    };
  };
};

test('竞速：完赛结算发放奖励并写入统计', async ({ page }) => {
  await page.goto('/?quality=low');
  await page.waitForFunction(() => !!(window as unknown as GameWindow).__RE__, null, { timeout: 60_000 });
  await page.evaluate(() => {
    const g = (window as unknown as GameWindow).__RE__!.game;
    g.save.data.coins = 0;
    g.save.data.stats.races = 0;
    g.save.data.stats.raceWins = 0;
    g.save.save();
  });

  await page.getByRole('button', { name: '竞速' }).click();
  await page.getByRole('button', { name: '开始比赛' }).click();
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    (window as unknown as GameWindow).__RE__!.game.finishRace({
      position: 1,
      totalRacers: 4,
      totalMs: 96_000,
      bestLapMs: 31_000,
      laps: 2,
      difficulty: 'normal',
      layoutName: '城市环路',
    });
  });
  await page.waitForTimeout(500);

  const state = await page.evaluate(() => {
    const g = (window as unknown as GameWindow).__RE__!.game;
    return { coins: g.save.data.coins, races: g.save.data.stats.races, wins: g.save.data.stats.raceWins };
  });
  expect(state.coins).toBe(300);
  expect(state.races).toBe(1);
  expect(state.wins).toBe(1);
  await expect(page.getByRole('button', { name: '再来一局' })).toBeVisible();
});
