import * as THREE from 'three';
import { buildCheckpoints, sampleRoute, type RaceLayout } from '../race/Layouts';
import { bus } from '../core/EventBus';

export type RacePhase = 'idle' | 'countdown' | 'racing' | 'finished';
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface RaceOptions {
  laps: number;
  opponents: number;
  difficulty: Difficulty;
}

export interface RacerState {
  id: string;
  name: string;
  isPlayer: boolean;
  x: number;
  z: number;
  heading: number;
  /** 沿赛道的累计进度（米），用于排名 */
  distance: number;
  lap: number;
  checkpoint: number;
  bestLapMs: number;
  lapStartMs: number;
  finished: boolean;
  totalMs: number;
}

export interface RaceResult {
  position: number;
  totalRacers: number;
  totalMs: number;
  bestLapMs: number;
  laps: number;
  difficulty: Difficulty;
  layoutName: string;
}

const DIFFICULTY = {
  easy: { speed: 0.78, corner: 0.7 },
  normal: { speed: 0.88, corner: 0.84 },
  hard: { speed: 1.0, corner: 1.0 },
} as const;

const LATERAL = [-2.2, 2.2, -1.2, 1.2, -3.2, 3.2, 0];

/**
 * 竞速管理：检查点顺序 + 圈数 + AI 沿路线行驶 + 排名 + 结算。
 * 玩家位姿由外部每帧写回，AI 在这里推进。
 */
export class RaceManager {
  phase: RacePhase = 'idle';
  countdown = 0;
  elapsedMs = 0;
  lap = 1;
  bestLapMs = 0;
  playerPosition = 1;
  readonly racers: RacerState[] = [];
  readonly route: { x: number; z: number }[];
  readonly routeLength: number;
  readonly checkpoints: { x: number; z: number }[];
  readonly layout: RaceLayout;
  readonly options: RaceOptions;
  onFinish: ((result: RaceResult) => void) | null = null;
  private readonly aiParams: number[] = [];
  private readonly aiSpeeds: number[] = [];
  private lastLapMs = 0;
  private playerLapStart = 0;
  private nextCheckpoint = 0;

  constructor(layout: RaceLayout, options: RaceOptions) {
    this.layout = layout;
    this.options = options;
    const sampled = sampleRoute(layout.path, 6);
    this.route = sampled.points;
    this.routeLength = sampled.length;
    this.checkpoints = buildCheckpoints(this.route, 8);

    this.racers.push({
      id: 'player',
      name: '你',
      isPlayer: true,
      x: layout.path[0][0],
      z: layout.path[0][1],
      heading: 0,
      distance: 0,
      lap: 1,
      checkpoint: 0,
      bestLapMs: 0,
      lapStartMs: 0,
      finished: false,
      totalMs: 0,
    });

    for (let i = 0; i < options.opponents; i += 1) {
      // 对手从起点前方依次排开，避免与玩家重叠
      this.aiParams.push(16 + i * 13);
      this.aiSpeeds.push(17 + Math.random() * 4);
      this.racers.push({
        id: `ai-${i}`,
        name: `对手 ${i + 1}`,
        isPlayer: false,
        x: 0,
        z: 0,
        heading: 0,
        distance: 0,
        lap: 1,
        checkpoint: 0,
        bestLapMs: 0,
        lapStartMs: 0,
        finished: false,
        totalMs: 0,
      });
    }
    this.resetAiPositions();
  }

  start(startHeading: number): void {
    this.phase = 'countdown';
    this.countdown = 3;
    this.elapsedMs = 0;
    this.lap = 1;
    this.nextCheckpoint = 0;
    this.playerLapStart = 0;
    this.racers[0].heading = startHeading;
    this.racers[0].checkpoint = 0;
    bus.emit('race:phase', { phase: 'countdown' });
  }

  /** 每帧：推进倒计时/计时/AI/检查点/排名 */
  update(dt: number, playerX: number, playerZ: number, playerHeading: number): void {
    if (this.phase === 'idle' || this.phase === 'finished') return;
    const player = this.racers[0];
    player.x = playerX;
    player.z = playerZ;
    player.heading = playerHeading;

    if (this.phase === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.phase = 'racing';
        this.playerLapStart = 0;
        bus.emit('race:phase', { phase: 'racing' });
      }
      return;
    }

    this.elapsedMs += dt * 1000;
    this.updatePlayerCheckpoint();
    this.updateAi(dt);
    this.updateProgress();
    this.updateRanks();
  }

  /** 玩家按序通过检查点；越过最后一个进入下一圈 */
  private updatePlayerCheckpoint(): void {
    const player = this.racers[0];
    const cp = this.checkpoints[this.nextCheckpoint];
    if (!cp) return;
    const dist = Math.hypot(player.x - cp.x, player.z - cp.z);
    if (dist > this.layout.checkpointRadius) return;

    this.nextCheckpoint += 1;
    player.checkpoint = this.nextCheckpoint;
    if (this.nextCheckpoint >= this.checkpoints.length) {
      this.nextCheckpoint = 0;
      const lapMs = this.elapsedMs - this.playerLapStart;
      if (player.bestLapMs === 0 || lapMs < player.bestLapMs) player.bestLapMs = lapMs;
      this.bestLapMs = player.bestLapMs;
      this.lastLapMs = lapMs;
      this.playerLapStart = this.elapsedMs;
      this.lap += 1;
      bus.emit('race:lap', { lap: this.lap, bestLapMs: player.bestLapMs });
      if (this.lap > this.options.laps) this.finishRace();
    }
  }

  private updateAi(dt: number): void {
    const config = DIFFICULTY[this.options.difficulty];
    const playerDistance = this.racers[0].distance;
    for (let i = 0; i < this.aiParams.length; i += 1) {
      const racer = this.racers[i + 1];
      if (racer.finished) continue;
      const speed = this.aiSpeeds[i] * config.speed;
      let param = this.aiParams[i] + speed * dt;
      if (param >= this.routeLength) {
        param -= this.routeLength;
        racer.lap += 1;
        if (racer.lap > this.options.laps) {
          racer.finished = true;
          racer.totalMs = this.elapsedMs;
        }
      }
      this.aiParams[i] = param;
      const lateral = LATERAL[i % LATERAL.length];
      const point = this.route[Math.floor(param / 6) % this.route.length];
      const next = this.route[(Math.floor(param / 6) + 1) % this.route.length];
      const heading = Math.atan2(next.x - point.x, next.z - point.z);
      racer.x = point.x + Math.cos(heading) * lateral;
      racer.z = point.z - Math.sin(heading) * lateral;
      racer.heading = heading;
      racer.distance = (racer.lap - 1) * this.routeLength + param;
      // 橡皮筋：落后太多轻微加速、领先太多轻微减速
      const gap = playerDistance - racer.distance;
      this.aiSpeeds[i] = THREE.MathUtils.clamp(
        this.aiSpeeds[i] + (gap > 0 ? 0.25 : -0.1) * dt,
        14,
        26 * config.corner,
      );
    }
  }

  private updateProgress(): void {
    const player = this.racers[0];
    player.distance = (player.lap - 1) * this.routeLength + this.nearestRouteDistance(player.x, player.z);
  }

  /** 玩家沿路线的近似累计距离 */
  private nearestRouteDistance(x: number, z: number): number {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < this.route.length; i += 2) {
      const p = this.route[i];
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = i * 6;
      }
    }
    return best;
  }

  private updateRanks(): void {
    const sorted = [...this.racers].sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      return b.distance - a.distance;
    });
    this.playerPosition = sorted.findIndex((r) => r.isPlayer) + 1;
  }

  private finishRace(): void {
    this.phase = 'finished';
    const player = this.racers[0];
    player.finished = true;
    player.totalMs = this.elapsedMs;
    this.updateRanks();
    const result: RaceResult = {
      position: this.playerPosition,
      totalRacers: this.racers.length,
      totalMs: this.elapsedMs,
      bestLapMs: player.bestLapMs,
      laps: this.options.laps,
      difficulty: this.options.difficulty,
      layoutName: this.layout.name,
    };
    bus.emit('race:finish', {
      position: result.position,
      totalMs: result.totalMs,
      bestLapMs: result.bestLapMs,
    });
    this.onFinish?.(result);
    void this.lastLapMs;
  }

  private resetAiPositions(): void {
    for (let i = 0; i < this.aiParams.length; i += 1) {
      const param = this.aiParams[i];
      const index = Math.floor(param / 6) % this.route.length;
      const point = this.route[index];
      const racer = this.racers[i + 1];
      const lateral = LATERAL[i % LATERAL.length];
      racer.x = point.x + lateral;
      racer.z = point.z;
      racer.distance = param;
    }
  }

  get currentLapMs(): number {
    return this.phase === 'racing' ? this.elapsedMs - this.playerLapStart : 0;
  }
}
