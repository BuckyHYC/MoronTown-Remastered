/**
 * 固定步长时钟：物理 1/60s 累加，渲染帧读取插值系数 alpha。
 * 上限保护：单帧 dt 超过 0.25s（切后台回来）时丢弃积压，避免瞬移。
 */
export const MAX_FRAME_DT = 0.25;

export interface StepInfo {
  alpha: number;
  steps: number;
  frameDt: number;
}

export class GameClock {
  private accumulator = 0;
  private last = 0;
  private started = false;
  fps = 0;
  private fpsAccum = 0;
  private fpsFrames = 0;

  constructor(private readonly step: number) {}

  /** 返回本次渲染帧需要执行的物理步数；由调用方循环 stepPhysics() */
  begin(nowMs: number): StepInfo {
    if (!this.started) {
      this.started = true;
      this.last = nowMs;
      return { alpha: 0, steps: 0, frameDt: 0 };
    }
    let frameDt = (nowMs - this.last) / 1000;
    this.last = nowMs;
    if (frameDt > MAX_FRAME_DT) frameDt = MAX_FRAME_DT;
    this.accumulator += frameDt;

    this.fpsAccum += frameDt;
    this.fpsFrames += 1;
    if (this.fpsAccum >= 0.5) {
      this.fps = this.fpsFrames / this.fpsAccum;
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }

    let steps = 0;
    while (this.accumulator >= this.step) {
      this.accumulator -= this.step;
      steps += 1;
    }
    return { alpha: this.accumulator / this.step, steps, frameDt };
  }

  get stepSeconds(): number {
    return this.step;
  }
}
