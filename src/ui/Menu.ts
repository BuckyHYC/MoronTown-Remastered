import {
  TIME_ORDER,
  TIME_PRESETS,
  type QualityTier,
  type TimeId,
  type VehicleSpec,
} from '../core/Config';

export interface MenuHandlers {
  onStart(): void;
  onRace(): void;
  onTime(id: TimeId): void;
  onQuality(tier: QualityTier): void;
  onPaint(color: string): void;
  onPlaceholder(name: string): void;
}

const QUALITY_LABEL: Record<QualityTier, string> = {
  low: '低',
  medium: '中',
  high: '高',
  ultra: '极致',
};

/** 主菜单：左侧品牌与入口，右侧车辆卡与光照面板，中央留给英雄车展示 */
export class Menu {
  private root: HTMLDivElement;
  private spec: VehicleSpec | null = null;

  constructor(
    container: HTMLElement,
    private readonly handlers: MenuHandlers,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'menu';
    this.root.innerHTML = `
      <div class="menu-scrim"></div>
      <div class="menu-left">
        <div class="brand">
          <span class="brand-mark">FZ</span>
          <span class="brand-name">FENZA ROAD<small>RE · 城市极速</small></span>
        </div>
        <h1 class="hero-title"><span>城市</span><b>极速</b><i>RE</i></h1>
        <p class="hero-kicker">CITY · TIME ATTACK · DAY / NIGHT</p>
        <p class="hero-copy">在 1200×1200 的城市里自由巡游，或闯进三张城市赛道的计时赛。<br/>昼夜自由切换，车灯、招牌与路面反射全部实时变化。</p>
        <div class="menu-actions">
          <button class="btn-primary" data-act="start"><span>开始驾驶</span><kbd>Enter</kbd></button>
          <div class="menu-links">
            <button data-act="race">竞速</button>
            <button data-act="garage">车库</button>
            <button data-act="profile">生涯</button>
            <button data-act="settings">设置</button>
            <button data-act="multiplayer">联机</button>
          </div>
        </div>
        <div class="menu-meta">
          <span data-coins>◈ 0</span>
          <span class="dot"></span>
          <span>v0.1 · 从零重构</span>
        </div>
      </div>
      <div class="menu-right">
        <div class="car-card">
          <div class="card-top"><span class="card-label">SELECTED CAR</span><span class="card-tag" data-car-class>超跑</span></div>
          <h2 data-car-name>概念跑车 VX</h2>
          <div class="card-sub" data-car-sub>7 挡 · 中置后驱</div>
          <div class="stat-list" data-stats></div>
          <div class="swatches" data-swatches></div>
          <div class="card-foot"><span>极速</span><b data-top-speed>223</b><em>km/h</em></div>
        </div>
        <div class="time-panel">
          <div class="panel-title">光照 / 时段</div>
          <div class="time-buttons" data-times></div>
          <div class="panel-title">画质</div>
          <div class="quality-buttons" data-quality></div>
        </div>
      </div>
      <div class="menu-bottom">WASD 驾驶 · Space 漂移 · C 视角 · T 昼夜 · R 重置 · Esc 暂停</div>
    `;
    container.appendChild(this.root);

    this.root.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const act = btn.dataset.act;
        if (act === 'start') this.handlers.onStart();
        else if (act === 'race') this.handlers.onRace();
        else if (act === 'garage') this.handlers.onPlaceholder('车库');
        else if (act === 'profile') this.handlers.onPlaceholder('生涯');
        else if (act === 'settings') this.handlers.onPlaceholder('设置');
        else if (act === 'multiplayer') this.handlers.onPlaceholder('联机');
      });
    });

    const times = this.root.querySelector('[data-times]');
    if (times) {
      for (const id of TIME_ORDER) {
        const btn = document.createElement('button');
        btn.textContent = TIME_PRESETS[id].label;
        btn.dataset.time = id;
        btn.addEventListener('click', () => {
          this.setActiveTime(id);
          this.handlers.onTime(id);
        });
        times.appendChild(btn);
      }
    }

    const quality = this.root.querySelector('[data-quality]');
    if (quality) {
      (['low', 'medium', 'high', 'ultra'] as QualityTier[]).forEach((tier) => {
        const btn = document.createElement('button');
        btn.textContent = QUALITY_LABEL[tier];
        btn.dataset.quality = tier;
        btn.addEventListener('click', () => {
          this.setActiveQuality(tier);
          this.handlers.onQuality(tier);
        });
        quality.appendChild(btn);
      });
    }
  }

  show(): void {
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  setCar(spec: VehicleSpec, color: string): void {
    this.spec = spec;
    const name = this.root.querySelector('[data-car-name]');
    if (name) name.textContent = spec.name;
    const sub = this.root.querySelector('[data-car-sub]');
    if (sub) sub.textContent = `${spec.gears} 挡 · ${spec.bodyClass === 'police' ? '警用' : '后驱'}`;
    const tag = this.root.querySelector('[data-car-class]');
    if (tag) tag.textContent = spec.bodyClass === 'supercar' ? '超跑' : '街车';
    const top = this.root.querySelector('[data-top-speed]');
    if (top) top.textContent = String(Math.round(spec.topSpeedMs * 3.6));

    const stats = this.root.querySelector('[data-stats]');
    if (stats) {
      const rows: [string, number][] = [
        ['极速', Math.min(1, spec.topSpeedMs / 70)],
        ['加速', Math.min(1, spec.accelMs2 / 20)],
        ['操控', Math.min(1, spec.steerRate / 4.2)],
        ['抓地', Math.min(1, spec.grip / 1.35)],
      ];
      stats.innerHTML = rows
        .map(
          ([label, value]) => `
          <div class="stat-row">
            <span>${label}</span>
            <div class="bar"><i style="width:${(value * 100).toFixed(0)}%"></i></div>
            <b>${(value * 100).toFixed(0)}</b>
          </div>`,
        )
        .join('');
    }

    const swatches = this.root.querySelector('[data-swatches]');
    if (swatches) {
      swatches.innerHTML = '';
      for (const option of spec.colors) {
        const dot = document.createElement('button');
        dot.className = 'swatch';
        dot.style.background = option;
        dot.dataset.color = option;
        if (option.toLowerCase() === color.toLowerCase()) dot.classList.add('active');
        dot.addEventListener('click', () => {
          swatches.querySelectorAll('.swatch').forEach((el) => el.classList.remove('active'));
          dot.classList.add('active');
          this.handlers.onPaint(option);
        });
        swatches.appendChild(dot);
      }
    }
  }

  setCoins(coins: number): void {
    const el = this.root.querySelector('[data-coins]');
    if (el) el.textContent = `◈ ${coins}`;
  }

  /** 菜单内轻提示（占位功能） */
  notice(text: string): void {
    let el = this.root.querySelector<HTMLElement>('.menu-notice');
    if (!el) {
      el = document.createElement('div');
      el.className = 'menu-notice';
      this.root.appendChild(el);
    }
    el.textContent = text;
    el.classList.add('show');
    window.clearTimeout(this.noticeTimer);
    this.noticeTimer = window.setTimeout(() => el?.classList.remove('show'), 1800);
  }

  private noticeTimer = 0;

  setActiveTime(id: TimeId): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-time]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.time === id);
    });
  }

  setActiveQuality(tier: QualityTier): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-quality]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.quality === tier);
    });
  }

  get carSpec(): VehicleSpec | null {
    return this.spec;
  }
}
