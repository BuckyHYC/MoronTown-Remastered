import { describe, expect, it } from 'vitest';
import { achievementProgress, checkInReady, dailyQuests, dateKey, nextCheckIn } from '../../src/meta/Progress';
import { defaultSave } from '../../src/core/SaveStore';

describe('生涯与每日任务', () => {
  it('日期键为 YYYY-MM-DD', () => {
    expect(dateKey(new Date(2026, 9, 18))).toBe('2026-10-18');
  });

  it('每日任务按日期确定性生成且目标为正', () => {
    const save = defaultSave();
    const day = new Date(2026, 9, 18);
    const a = dailyQuests(save, day);
    const b = dailyQuests(save, day);
    expect(a.length).toBe(3);
    expect(a.map((q) => q.target)).toEqual(b.map((q) => q.target));
    for (const quest of a) expect(quest.target).toBeGreaterThan(0);
  });

  it('跨天时任务目标会变化（同一天稳定）', () => {
    const save = defaultSave();
    const targets = new Set<string>();
    for (let d = 1; d <= 10; d += 1) {
      targets.add(dailyQuests(save, new Date(2026, 9, d)).map((q) => q.target).join('-'));
    }
    expect(targets.size).toBeGreaterThan(1);
  });

  it('签到连续天数与奖励封顶 300', () => {
    const save = defaultSave();
    save.daily.checkInDate = '2026-10-17';
    save.daily.checkInStreak = 5;
    const next = nextCheckIn(save, new Date(2026, 9, 18));
    expect(next.streak).toBe(6);
    expect(next.reward).toBe(300);
    expect(checkInReady(save, new Date(2026, 9, 18))).toBe(true);
  });

  it('成就进度按统计字段计算', () => {
    const save = defaultSave();
    save.stats.distanceKm = 100;
    const list = achievementProgress(save);
    const drive = list.find((a) => a.def.id === 'drive-100')!;
    expect(drive.unlocked).toBe(true);
    const endless = list.find((a) => a.def.id === 'endless-50')!;
    expect(endless.unlocked).toBe(false);
  });
});
