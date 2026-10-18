import type { DriveInput } from './Dynamics';

export type ActionId = 'camera' | 'reset' | 'time' | 'pause' | 'confirm' | 'back';

/**
 * 输入：键盘 + 鼠标右键环绕（触屏与手柄后续接入同一结构）。
 * 持续量放 state，离散动作用 consume()。
 */
export class InputSystem {
  readonly state: DriveInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  private readonly keys = new Set<string>();
  private readonly pending = new Set<ActionId>();
  private orbitDelta = 0;
  private dragging = false;
  private lastPointerX = 0;
  private detach: (() => void)[] = [];

  attach(canvas: HTMLCanvasElement): void {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.repeat) {
        this.syncKeys();
        return;
      }
      this.keys.add(event.code);
      const action = keyToAction(event.code);
      if (action) {
        this.pending.add(action);
        event.preventDefault();
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
        event.preventDefault();
      }
      this.syncKeys();
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      this.keys.delete(event.code);
      this.syncKeys();
    };
    const onBlur = (): void => {
      this.keys.clear();
      this.syncKeys();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    this.detach.push(() => window.removeEventListener('keydown', onKeyDown));
    this.detach.push(() => window.removeEventListener('keyup', onKeyUp));
    this.detach.push(() => window.removeEventListener('blur', onBlur));

    const onPointerDown = (event: PointerEvent): void => {
      if (event.button !== 2) return;
      this.dragging = true;
      this.lastPointerX = event.clientX;
      canvas.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent): void => {
      if (!this.dragging) return;
      this.orbitDelta += (event.clientX - this.lastPointerX) * 0.006;
      this.lastPointerX = event.clientX;
    };
    const onPointerUp = (event: PointerEvent): void => {
      if (event.button !== 2 && event.type !== 'pointercancel') return;
      this.dragging = false;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };
    const onContextMenu = (event: Event): void => event.preventDefault();

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('contextmenu', onContextMenu);
    this.detach.push(() => canvas.removeEventListener('pointerdown', onPointerDown));
    this.detach.push(() => canvas.removeEventListener('pointermove', onPointerMove));
    this.detach.push(() => canvas.removeEventListener('pointerup', onPointerUp));
    this.detach.push(() => canvas.removeEventListener('pointercancel', onPointerUp));
    this.detach.push(() => canvas.removeEventListener('contextmenu', onContextMenu));
  }

  private syncKeys(): void {
    const k = this.keys;
    const forward = k.has('KeyW') || k.has('ArrowUp');
    const back = k.has('KeyS') || k.has('ArrowDown');
    const left = k.has('KeyA') || k.has('ArrowLeft');
    const right = k.has('KeyD') || k.has('ArrowRight');
    this.state.throttle = forward ? 1 : 0;
    this.state.brake = back ? 1 : 0;
    this.state.steer = (right ? 1 : 0) - (left ? 1 : 0);
    this.state.handbrake = k.has('Space');
  }

  setTouch(steer: number, throttle: number, brake: number, handbrake: boolean): void {
    this.state.steer = steer;
    this.state.throttle = throttle;
    this.state.brake = brake;
    this.state.handbrake = handbrake;
  }

  consume(action: ActionId): boolean {
    if (!this.pending.has(action)) return false;
    this.pending.delete(action);
    return true;
  }

  consumeOrbitDelta(): number {
    const value = this.orbitDelta;
    this.orbitDelta = 0;
    return value;
  }

  dispose(): void {
    for (const fn of this.detach) fn();
    this.detach = [];
  }
}

function keyToAction(code: string): ActionId | null {
  switch (code) {
    case 'KeyC':
      return 'camera';
    case 'KeyR':
      return 'reset';
    case 'KeyT':
      return 'time';
    case 'Escape':
      return 'pause';
    case 'Enter':
      return 'confirm';
    case 'Backspace':
      return 'back';
    default:
      return null;
  }
}
