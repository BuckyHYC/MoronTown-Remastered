export interface TouchHandlers {
  onCamera(): void;
}

/**
 * 触屏操作：左侧虚拟摇杆（转向）+ 右侧踏板（油门/刹车）+ 漂移键。
 * 只在触屏设备或 ?touch=1 时挂载；键盘输入仍然可用（摇杆有输入时优先）。
 */
export class TouchControls {
  private readonly root: HTMLDivElement;
  private readonly knob: HTMLElement;
  private steer = 0;
  private throttle = 0;
  private brake = 0;
  private handbrake = false;
  private stickPointer: number | null = null;
  private readonly pedals = new Map<number, 'gas' | 'brake' | 'handbrake'>();
  private readonly radius = 54;

  constructor(
    container: HTMLElement,
    private readonly handlers: TouchHandlers,
    private readonly onInput: (steer: number, throttle: number, brake: number, handbrake: boolean) => void,
    onRelease: () => void,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'touch-ui';
    this.root.innerHTML = `
      <div class="touch-stick" data-stick>
        <div class="touch-stick-ring"></div>
        <div class="touch-knob" data-knob></div>
      </div>
      <div class="touch-side">
        <button class="touch-btn touch-cam" data-act="camera">视角</button>
        <button class="touch-btn touch-drift" data-act="handbrake">漂移</button>
        <div class="touch-pedals">
          <button class="touch-btn touch-brake" data-act="brake">刹车</button>
          <button class="touch-btn touch-gas" data-act="gas">油门</button>
        </div>
      </div>
    `;
    container.appendChild(this.root);
    const q = <T extends Element>(sel: string): T => {
      const el = this.root.querySelector(sel);
      if (!el) throw new Error(`touch element missing: ${sel}`);
      return el as T;
    };
    this.knob = q('[data-knob]');
    const stick = q<HTMLDivElement>('[data-stick]');

    const emit = (): void => this.onInput(this.steer, this.throttle, this.brake, this.handbrake);

    stick.addEventListener('pointerdown', (event) => {
      if (this.stickPointer !== null) return;
      this.stickPointer = event.pointerId;
      stick.setPointerCapture(event.pointerId);
      this.moveStick(event);
      event.preventDefault();
    });
    stick.addEventListener('pointermove', (event) => {
      if (event.pointerId !== this.stickPointer) return;
      this.moveStick(event);
      event.preventDefault();
    });
    const endStick = (event: PointerEvent): void => {
      if (event.pointerId !== this.stickPointer) return;
      this.stickPointer = null;
      this.steer = 0;
      this.knob.style.transform = 'translate(-50%, -50%)';
      emit();
      onRelease();
    };
    stick.addEventListener('pointerup', endStick);
    stick.addEventListener('pointercancel', endStick);

    const press = (act: 'gas' | 'brake' | 'handbrake') => (event: PointerEvent): void => {
      this.pedals.set(event.pointerId, act);
      this.applyPedal(act, true);
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      emit();
      event.preventDefault();
    };
    const release = (event: PointerEvent): void => {
      const act = this.pedals.get(event.pointerId);
      if (!act) return;
      this.pedals.delete(event.pointerId);
      if (![...this.pedals.values()].includes(act)) this.applyPedal(act, false);
      emit();
      onRelease();
    };
    for (const act of ['gas', 'brake', 'handbrake'] as const) {
      const btn = q<HTMLButtonElement>(`[data-act="${act}"]`);
      btn.addEventListener('pointerdown', press(act));
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
    }
    q('[data-act="camera"]').addEventListener('click', () => this.handlers.onCamera());
  }

  private applyPedal(act: 'gas' | 'brake' | 'handbrake', down: boolean): void {
    if (act === 'gas') this.throttle = down ? 1 : 0;
    else if (act === 'brake') this.brake = down ? 1 : 0;
    else this.handbrake = down;
  }

  private moveStick(event: PointerEvent): void {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const clampedX = Math.max(-this.radius, Math.min(this.radius, dx));
    const clampedY = Math.max(-this.radius, Math.min(this.radius, dy));
    this.knob.style.transform = `translate(calc(-50% + ${clampedX}px), calc(-50% + ${clampedY}px))`;
    this.steer = clampedX / this.radius;
    this.onInput(this.steer, this.throttle, this.brake, this.handbrake);
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle('hidden', !visible);
    if (!visible) {
      this.steer = 0;
      this.throttle = 0;
      this.brake = 0;
      this.handbrake = false;
      this.pedals.clear();
      this.stickPointer = null;
      this.knob.style.transform = 'translate(-50%, -50%)';
    }
  }

  get active(): boolean {
    return !this.root.classList.contains('hidden');
  }
}

/** 触屏判定：粗指针设备（手机/平板）或显式 ?touch=1 */
export function isTouchDevice(): boolean {
  const params = new URLSearchParams(location.search);
  if (params.get('touch') === '1') return true;
  if (params.get('touch') === '0') return false;
  if (navigator.maxTouchPoints > 0 && window.matchMedia('(pointer: coarse)').matches) return true;
  return window.matchMedia('(pointer: coarse)').matches;
}
