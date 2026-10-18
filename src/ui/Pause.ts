import { TIME_ORDER, TIME_PRESETS, type TimeId } from '../core/Config';

export interface PauseHandlers {
  onResume(): void;
  onRestart(): void;
  onMenu(): void;
  onTime(id: TimeId): void;
  onMute(muted: boolean): void;
}

/** 暂停菜单：继续 / 重新开始 / 返回菜单 + 时段 + 声音 */
export class Pause {
  private readonly root: HTMLDivElement;
  private muted = false;

  constructor(
    container: HTMLElement,
    private readonly handlers: PauseHandlers,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'pause hidden';
    this.root.innerHTML = `
      <div class="pause-panel">
        <div class="race-head"><span>PAUSED</span><b>已暂停</b></div>
        <div class="pause-times" data-times></div>
        <div class="pause-actions">
          <button class="race-ghost" data-act="mute">声音：开</button>
          <button class="race-ghost" data-act="menu">返回菜单</button>
          <button class="race-ghost" data-act="restart">重新开始</button>
          <button class="race-go" data-act="resume">继续驾驶</button>
        </div>
      </div>
    `;
    container.appendChild(this.root);

    const times = this.root.querySelector('[data-times]');
    if (times) {
      for (const id of TIME_ORDER) {
        const btn = document.createElement('button');
        btn.textContent = TIME_PRESETS[id].label;
        btn.dataset.time = id;
        btn.addEventListener('click', () => {
          this.handlers.onTime(id);
          this.setActiveTime(id);
        });
        times.appendChild(btn);
      }
    }

    this.root.querySelector('[data-act="resume"]')?.addEventListener('click', () => {
      this.hide();
      this.handlers.onResume();
    });
    this.root.querySelector('[data-act="restart"]')?.addEventListener('click', () => {
      this.hide();
      this.handlers.onRestart();
    });
    this.root.querySelector('[data-act="menu"]')?.addEventListener('click', () => {
      this.hide();
      this.handlers.onMenu();
    });
    this.root.querySelector('[data-act="mute"]')?.addEventListener('click', (event) => {
      this.muted = !this.muted;
      (event.currentTarget as HTMLButtonElement).textContent = this.muted ? '声音：关' : '声音：开';
      this.handlers.onMute(this.muted);
    });
  }

  show(timeId: TimeId): void {
    this.root.classList.remove('hidden');
    this.setActiveTime(timeId);
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  get visible(): boolean {
    return !this.root.classList.contains('hidden');
  }

  private setActiveTime(id: TimeId): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-time]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.time === id);
    });
  }
}
