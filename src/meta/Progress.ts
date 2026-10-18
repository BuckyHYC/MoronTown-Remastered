import type { SaveData } from '../core/SaveStore';

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  stat: keyof SaveData['stats'] | 'kills' | 'streak';
  target: number;
  reward: number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'drive-10', name: '老司机', desc: '累计驾驶 10 km', icon: '🚗', stat: 'distanceKm', target: 10, reward: 100 },
  { id: 'drive-100', name: '环城百公里', desc: '累计驾驶 100 km', icon: '🛣️', stat: 'distanceKm', target: 100, reward: 500 },
  { id: 'endless-50', name: '无尽探索者', desc: '无尽模式累计 50 km', icon: '🌌', stat: 'endlessKm', target: 50, reward: 400 },
  { id: 'race-1', name: '初登赛道', desc: '完成 1 场竞速', icon: '🏁', stat: 'races', target: 1, reward: 150 },
  { id: 'race-10', name: '赛事常客', desc: '完成 10 场竞速', icon: '🏆', stat: 'races', target: 10, reward: 400 },
  { id: 'win-1', name: '首胜', desc: '赢得 1 场竞速', icon: '🥇', stat: 'raceWins', target: 1, reward: 300 },
  { id: 'win-5', name: '五冠王', desc: '赢得 5 场竞速', icon: '👑', stat: 'raceWins', target: 5, reward: 800 },
  { id: 'speed-180', name: '追风少年', desc: '极速达到 180 km/h', icon: '💨', stat: 'topSpeedKmh', target: 180, reward: 200 },
  { id: 'speed-220', name: '极速传说', desc: '极速达到 220 km/h', icon: '🚀', stat: 'topSpeedKmh', target: 220, reward: 400 },
  { id: 'kill-5', name: '行人克星', desc: '撞倒 5 名行人', icon: '🚶', stat: 'kills', target: 5, reward: 80 },
  { id: 'kill-25', name: '街头噩梦', desc: '撞倒 25 名行人', icon: '💀', stat: 'kills', target: 25, reward: 300 },
  { id: 'earn-5000', name: '小金库', desc: '累计赚取 5000 金币', icon: '🪙', stat: 'coinsEarned', target: 5000, reward: 500 },
  { id: 'streak-3', name: '三日之约', desc: '连续签到 3 天', icon: '📅', stat: 'streak', target: 3, reward: 200 },
  { id: 'streak-7', name: '签到狂魔', desc: '连续签到 7 天', icon: '🔥', stat: 'streak', target: 7, reward: 600 },
];

export interface DailyQuest {
  id: 'drive' | 'race';
  name: string;
  desc: string;
  target: number;
  progress: number;
  reward: number;
  done: boolean;
  claimed: boolean;
}

export function dateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function yesterdayKey(date = new Date()): string {
  const copy = new Date(date);
  copy.setDate(copy.getDate() - 1);
  return dateKey(copy);
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return hash;
}

/** 每日三任务：固定「巡游 + 竞速 + 击杀」，目标值按日期确定性生成 */
export function dailyQuests(save: SaveData, date = new Date()): DailyQuest[] {
  const h = hashString(`fenza-daily-${dateKey(date)}`);
  const driveTarget = [5, 8, 12][h % 3];
  const raceTarget = [1, 2][(h >> 3) % 2];
  const killTarget = [3, 5, 8][(h >> 5) % 3];
  const done = save.daily.date === dateKey(date) ? save.daily.done : [];

  const make = (
    id: DailyQuest['id'],
    name: string,
    desc: string,
    target: number,
    progress: number,
    reward: number,
  ): DailyQuest => ({
    id,
    name,
    desc,
    target,
    progress: Math.min(progress, target),
    reward,
    done: progress >= target,
    claimed: done.includes(id),
  });

  return [
    make('drive', '城市巡游', `累计驾驶 ${driveTarget} km`, driveTarget, save.stats.distanceKm, 120),
    make('race', '竞速挑战', `完成 ${raceTarget} 场竞速`, raceTarget, save.stats.races, 160),
    make('kills' as DailyQuest['id'], '行人克星', `撞倒 ${killTarget} 名行人`, killTarget, save.stats.pedestrianKills, 150),
  ];
}

export function checkInReady(save: SaveData, date = new Date()): boolean {
  return save.daily.checkInDate !== dateKey(date);
}

/** 下次签到的连续天数与奖励 */
export function nextCheckIn(save: SaveData, date = new Date()): { streak: number; reward: number } {
  const streak = save.daily.checkInDate === yesterdayKey(date) ? save.daily.checkInStreak + 1 : 1;
  return { streak, reward: Math.min(300, streak * 50) };
}

export interface AchievementProgress {
  def: AchievementDef;
  value: number;
  unlocked: boolean;
}

export function achievementProgress(save: SaveData): AchievementProgress[] {
  return ACHIEVEMENTS.map((def) => {
    let value = 0;
    if (def.stat === 'kills') value = save.stats.pedestrianKills;
    else if (def.stat === 'streak') value = save.daily.checkInStreak;
    else value = save.stats[def.stat] ?? 0;
    return {
      def,
      value,
      unlocked: value >= def.target || save.achievements.includes(def.id),
    };
  });
}
