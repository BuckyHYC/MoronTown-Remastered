/**
 * 极简类型化事件总线：跨系统单向通知（输入 → 玩法 → 表现）。
 * 不承载状态，只做广播；禁止监听方回调触发新一轮广播（防环）。
 */

export type GameEventMap = {
  'mode:changed': { from: string; to: string };
  'time:changed': { id: string; instant: boolean };
  'quality:changed': { tier: string };
  'quality:auto': { tier: string };
  'race:phase': { phase: string; value?: number };
  'race:lap': { lap: number; bestLapMs: number };
  'race:finish': { position: number; totalMs: number; bestLapMs: number };
  'vehicle:shift': { gear: number };
  'vehicle:collide': { intensity: number; x: number; z: number };
  'coins:changed': { coins: number; delta: number };
  'toast': { text: string; tone?: 'info' | 'good' | 'warn' };
  'hud:mission': { text: string | null };
};

type Handler<K extends keyof GameEventMap> = (payload: GameEventMap[K]) => void;

export class EventBus {
  private handlers = new Map<keyof GameEventMap, Set<Handler<never>>>();

  on<K extends keyof GameEventMap>(type: K, handler: Handler<K>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as Handler<never>);
    return () => set!.delete(handler as Handler<never>);
  }

  emit<K extends keyof GameEventMap>(type: K, payload: GameEventMap[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const handler of [...set]) (handler as Handler<K>)(payload);
  }

  clear(): void {
    this.handlers.clear();
  }
}

export const bus = new EventBus();
