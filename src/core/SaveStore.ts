/**
 * 存档：localStorage 版本化 + 逐字段防御式解析。
 * 旧版 key 不读取（新游戏新存档）。
 */

export const SAVE_KEY = 'fenza-re-save-v1';

export interface SaveData {
  schemaVersion: 1;
  car: { id: string; color: string; paint: 'gloss' | 'matte' | 'metallic'; owned: string[] };
  coins: number;
  stats: {
    distanceKm: number;
    endlessKm: number;
    races: number;
    raceWins: number;
    topSpeedKmh: number;
    playSeconds: number;
    coinsEarned: number;
    pedestrianKills: number;
  };
  bestLaps: Record<string, number>;
  daily: { date: string; done: string[]; checkInDate: string; checkInStreak: number };
  achievements: string[];
  titles: number;
  audio: { muted: boolean; bgm: number; sfx: number };
  control: { mode: 'desktop' | 'mobile'; density: 'low' | 'medium' | 'high'; invertSteer: boolean };
  video: {
    quality: 'auto' | 'low' | 'medium' | 'high' | 'ultra';
    timeOfDay: string;
    rain: boolean;
    hudScale: number;
    shake: boolean;
    speedFov: boolean;
  };
}

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const str = (v: unknown, fallback: string): string => (typeof v === 'string' && v ? v : fallback);
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

export function defaultSave(): SaveData {
  return {
    schemaVersion: 1,
    car: { id: 'coupe', color: '#c8102e', paint: 'gloss', owned: ['coupe'] },
    coins: 0,
    stats: {
      distanceKm: 0,
      endlessKm: 0,
      races: 0,
      raceWins: 0,
      topSpeedKmh: 0,
      playSeconds: 0,
      coinsEarned: 0,
      pedestrianKills: 0,
    },
    bestLaps: {},
    daily: { date: '', done: [], checkInDate: '', checkInStreak: 0 },
    achievements: [],
    titles: 0,
    audio: { muted: false, bgm: 0.5, sfx: 0.7 },
    control: { mode: 'desktop', density: 'medium', invertSteer: false },
    video: { quality: 'high', timeOfDay: 'day', rain: false, hudScale: 1, shake: true, speedFov: true },
  };
}

export function parseSave(raw: unknown): SaveData {
  const base = defaultSave();
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Record<string, unknown>;
  const car = (o.car ?? {}) as Record<string, unknown>;
  const stats = (o.stats ?? {}) as Record<string, unknown>;
  const daily = (o.daily ?? {}) as Record<string, unknown>;
  const audio = (o.audio ?? {}) as Record<string, unknown>;
  const control = (o.control ?? {}) as Record<string, unknown>;
  const video = (o.video ?? {}) as Record<string, unknown>;

  const bestLaps: Record<string, number> = {};
  if (o.bestLaps && typeof o.bestLaps === 'object') {
    for (const [k, v] of Object.entries(o.bestLaps as Record<string, unknown>)) {
      const ms = num(v, Number.NaN);
      if (Number.isFinite(ms) && ms > 0) bestLaps[k] = ms;
    }
  }

  return {
    schemaVersion: 1,
    car: {
      id: str(car.id, base.car.id),
      color: str(car.color, base.car.color),
      paint: (['gloss', 'matte', 'metallic'] as const).includes(car.paint as never)
        ? (car.paint as SaveData['car']['paint'])
        : 'gloss',
      owned: Array.isArray(car.owned) ? car.owned.filter((v): v is string => typeof v === 'string') : base.car.owned,
    },
    coins: Math.max(0, Math.round(num(o.coins, 0))),
    stats: {
      distanceKm: Math.max(0, num(stats.distanceKm, 0)),
      endlessKm: Math.max(0, num(stats.endlessKm, 0)),
      races: Math.max(0, Math.round(num(stats.races, 0))),
      raceWins: Math.max(0, Math.round(num(stats.raceWins, 0))),
      topSpeedKmh: Math.max(0, num(stats.topSpeedKmh, 0)),
      playSeconds: Math.max(0, num(stats.playSeconds, 0)),
      coinsEarned: Math.max(0, Math.round(num(stats.coinsEarned, 0))),
      pedestrianKills: Math.max(0, Math.round(num(stats.pedestrianKills, 0))),
    },
    bestLaps,
    daily: {
      date: str(daily.date, ''),
      done: Array.isArray(daily.done) ? daily.done.filter((v): v is string => typeof v === 'string') : [],
      checkInDate: str(daily.checkInDate, ''),
      checkInStreak: Math.max(0, Math.round(num(daily.checkInStreak, 0))),
    },
    achievements: Array.isArray(o.achievements)
      ? o.achievements.filter((v): v is string => typeof v === 'string')
      : [],
    titles: Math.max(0, Math.round(num(o.titles, 0))),
    audio: {
      muted: bool(audio.muted, false),
      bgm: Math.min(1, Math.max(0, num(audio.bgm, 0.5))),
      sfx: Math.min(1, Math.max(0, num(audio.sfx, 0.7))),
    },
    control: {
      mode: control.mode === 'mobile' ? 'mobile' : 'desktop',
      density: (['low', 'medium', 'high'] as const).includes(control.density as never)
        ? (control.density as SaveData['control']['density'])
        : 'medium',
      invertSteer: bool(control.invertSteer, false),
    },
    video: {
      quality: (['auto', 'low', 'medium', 'high', 'ultra'] as const).includes(video.quality as never)
        ? (video.quality as SaveData['video']['quality'])
        : 'high',
      timeOfDay: str(video.timeOfDay, 'day'),
      rain: bool(video.rain, false),
      hudScale: Math.min(1.4, Math.max(0.7, num(video.hudScale, 1))),
      shake: bool(video.shake, true),
      speedFov: bool(video.speedFov, true),
    },
  };
}

export class SaveStore {
  data: SaveData;

  constructor(private readonly storage: Storage | null = safeStorage()) {
    this.data = this.load();
  }

  private load(): SaveData {
    try {
      const raw = this.storage?.getItem(SAVE_KEY);
      return raw ? parseSave(JSON.parse(raw)) : defaultSave();
    } catch {
      return defaultSave();
    }
  }

  save(): void {
    try {
      this.storage?.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch {
      /* 隐私模式/配额满：静默失败，不打断游戏 */
    }
  }

  patch(patch: Partial<SaveData>): void {
    this.data = { ...this.data, ...patch };
    this.save();
  }
}

function safeStorage(): Storage | null {
  try {
    const probe = '__re_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

