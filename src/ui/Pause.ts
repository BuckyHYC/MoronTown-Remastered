import { TIME_ORDER, TIME_PRESETS, type QualityTier, type TimeId } from '../core/Config';

export interface PauseHandlers {
  onResume(): void;
  onRestart(): void;
  onMenu(): void;
  onTime(id: TimeId): void;
  onMute(muted: boolean): void;
  onRain(on: boolean): void;
  onQuality(tier: QualityTier): void;
  onInvertSteer(on: boolean): void;
}

const QUALITY_LABEL: Record<QualityTier, string> = { low: '低', medium: '中', high: '高', ultra: '极致' };
const QUALITY_ORDER: QualityTier[] = ['low', 'medium', 'high', 'ultra'];

/** 暂停菜单：继续 / 重新开始 / 返回菜单 + 时段 + 声音 */
export class Pause {
  private readonly root: HTMLDivElement;
  private muted = false;
  private rain = false;
  private quality: QualityTier = 'high';
  private invert = false;

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
          <button class="race-ghost" data-act="rain">天气：晴</button>
          <button class="race-ghost" data-act="quality">画质：高</button>
          <button class="race-ghost" data-act="steer">转向：标准</button>
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
    this.root.querySelector('[data-act="rain"]')?.addEventListener('click', () => {
      this.rain = !this.rain;
      this.setWeather(this.rain);
      this.handlers.onRain(this.rain);
    });
    this.root.querySelector('[data-act="quality"]')?.addEventListener('click', (event) => {
      const index = QUALITY_ORDER.indexOf(this.quality);
      const next = QUALITY_ORDER[(index + 1) % QUALITY_ORDER.length];
      this.setQuality(next);
      this.handlers.onQuality(next);
      const btn = event.currentTarget as HTMLButtonElement;
      btn.textContent = `画质：${QUALITY_LABEL[next]}`;
    });
    this.root.querySelector('[data-act="steer"]')?.addEventListener('click', () => {
      this.invert = !this.invert;
      this.setInvertSteer(this.invert);
      this.handlers.onInvertSteer(this.invert);
    });
  }

  /** 同步画质按钮文案 */
  setQuality(tier: QualityTier): void {
    this.quality = tier;
    const btn = this.root.querySelector<HTMLButtonElement>('[data-act="quality"]');
    if (btn) btn.textContent = `画质：${QUALITY_LABEL[tier]}`;
  }

  /** 同步转向反转文案 */
  setInvertSteer(on: boolean): void {
    this.invert = on;
    const btn = this.root.querySelector<HTMLButtonElement>('[data-act="steer"]');
    if (btn) btn.textContent = on ? '转向：反向' : '转向：标准';
  }

  /** 同步天气按钮文案（外部开关雨时也要更新） */
  setWeather(on: boolean): void {
    this.rain = on;
    const btn = this.root.querySelector<HTMLButtonElement>('[data-act="rain"]');
    if (btn) btn.textContent = on ? '天气：雨' : '天气：晴';
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
