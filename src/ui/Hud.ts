import { WORLD } from '../core/Config';

export interface HudData {
  speedKmh: number;
  gear: number;
  rpmRatio: number;
  position: number;
  totalRacers: number;
  lap: number;
  totalLaps: number;
  timeMs: number;
  mode: string;
  coins: number;
  kills: number;
  cameraMode: string;
  bestLapMs?: number;
  playerX?: number;
  playerZ?: number;
  heading?: number;
  route?: { x: number; z: number }[];
  racers?: { x: number; z: number; isPlayer: boolean }[];
  timeOfDay: string;
  fps: number;
}

const RING_LENGTH = 2 * Math.PI * 46;

/** 驾驶 HUD：四角信息 + 速度环 + 遥测条 + 小地图 */
export class Hud {
  private root: HTMLDivElement;
  private speedEl: HTMLElement;
  private gearEl: HTMLElement;
  private rpmEl: HTMLElement;
  private ringEl: SVGCircleElement;
  private posEl: HTMLElement;
  private totalEl: HTMLElement;
  private lapEl: HTMLElement;
  private timeEl: HTMLElement;
  private coinsEl: HTMLElement;
  private killsEl: HTMLElement;
  private cameraEl: HTMLElement;
  private toastEl: HTMLElement;
  private linesEl: HTMLElement;
  private helpEl: HTMLElement;
  private minimap: HTMLCanvasElement;
  private toastTimer = 0;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="speed-lines" data-lines></div>
      <div class="hud-corner hud-tl">
        <div class="pos-block">
          <b data-pos>1</b><span data-total>/1</span>
        </div>
        <div class="pos-label">位置</div>
      </div>
      <div class="hud-top">
        <div class="lap-block"><span data-lap>01</span><i>/</i><span data-laps>01</span></div>
        <div class="time-block" data-time>00:00.000</div>
        <div class="time-best" data-best>最佳 --:--.---</div>
      </div>
      <div class="hud-map">
        <div class="map-head"><span>城市环路</span><span data-map-mode>FREE</span></div>
        <canvas width="220" height="220"></canvas>
      </div>
      <div class="hud-speed">
        <svg viewBox="0 0 120 120" class="speed-svg">
          <circle class="ring-track" cx="60" cy="60" r="46"></circle>
          <circle class="ring-fill" cx="60" cy="60" r="46" data-ring></circle>
        </svg>
        <div class="speed-center">
          <div class="speed-num" data-speed>0</div>
          <div class="speed-unit">KM/H</div>
        </div>
        <div class="gear-badge"><span data-gear>1</span><i>挡</i></div>
      </div>
      <div class="hud-bottom">
        <div class="rpm-bar"><i data-rpm></i></div>
        <div class="hud-meta">
          <span data-coins>◈ 0</span>
          <span data-kills>撞击 0</span>
          <span data-camera>追尾</span>
          <span data-tod>白天</span>
        </div>
      </div>
      <div class="hud-toast" data-toast></div>
      <div class="hud-help">C 视角 · T 时段 · N 天气 · R 重置 · Esc 暂停</div>
    `;
    container.appendChild(this.root);

    const q = <T extends Element>(sel: string): T => {
      const el = this.root.querySelector(sel);
      if (!el) throw new Error(`HUD element missing: ${sel}`);
      return el as T;
    };
    this.speedEl = q('[data-speed]');
    this.gearEl = q('[data-gear]');
    this.rpmEl = q('[data-rpm]');
    this.ringEl = q<SVGCircleElement>('[data-ring]');
    this.posEl = q('[data-pos]');
    this.totalEl = q('[data-total]');
    this.lapEl = q('[data-lap]');
    this.timeEl = q('[data-time]');
    this.coinsEl = q('[data-coins]');
    this.killsEl = q('[data-kills]');
    this.cameraEl = q('[data-camera]');
    this.toastEl = q('[data-toast]');
    this.linesEl = q('[data-lines]');
    this.helpEl = q('.hud-help');
    this.minimap = this.root.querySelector('canvas')!;
    q('[data-laps]').textContent = '01';

    this.ringEl.style.strokeDasharray = `${RING_LENGTH}`;
    this.ringEl.style.strokeDashoffset = `${RING_LENGTH}`;
  }

  update(data: HudData): void {
    this.speedEl.textContent = String(Math.round(data.speedKmh));
    this.gearEl.textContent = data.gear === 0 ? 'R' : String(data.gear);
    const ratio = Math.min(1, data.rpmRatio);
    this.rpmEl.style.transform = `scaleX(${0.04 + ratio * 0.96})`;
    this.ringEl.style.strokeDashoffset = `${RING_LENGTH * (1 - Math.min(1, data.speedKmh / 280))}`;
    // 高速速度线：约 110km/h 起，260km/h 完全展开
    const rush = Math.min(1, Math.max(0, (data.speedKmh - 110) / 150));
    this.linesEl.style.opacity = (rush * 0.55).toFixed(3);
    this.posEl.textContent = String(data.position);
    this.totalEl.textContent = `/${data.totalRacers}`;
    this.lapEl.textContent = String(data.lap).padStart(2, '0');
    this.timeEl.textContent = formatTime(data.timeMs);
    this.coinsEl.textContent = `◈ ${data.coins}`;
    this.killsEl.textContent = `撞击 ${data.kills}`;
    this.cameraEl.textContent = data.cameraMode;
    // 座舱视角里居中提示会挡住仪表/方向盘，直接淡出
    this.helpEl.style.opacity = data.cameraMode === 'cockpit' ? '0' : '1';
    const best = this.root.querySelector('[data-best]');
    if (best) {
      best.textContent = data.bestLapMs ? `最佳 ${formatTime(data.bestLapMs)}` : '最佳 --:--.---';
    }
    const tod = this.root.querySelector('[data-tod]');
    if (tod) tod.textContent = data.timeOfDay;
    const mode = this.root.querySelector('[data-map-mode]');
    if (mode) mode.textContent = data.mode.toUpperCase();
    this.drawMinimap(data);
    if (this.toastTimer > 0) {
      this.toastTimer -= 1;
      if (this.toastTimer <= 0) this.toastEl.classList.remove('show');
    }
  }

  toast(text: string, tone: 'info' | 'good' | 'warn' = 'info'): void {
    this.toastEl.textContent = text;
    this.toastEl.dataset.tone = tone;
    this.toastEl.classList.add('show');
    this.toastTimer = 90;
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle('hidden', !visible);
  }

  private drawMinimap(data: HudData): void {
    const ctx = this.minimap.getContext('2d');
    if (!ctx) return;
    const size = this.minimap.width;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(6,10,16,0.72)';
    ctx.fillRect(0, 0, size, size);

    const pad = 12;
    const span = WORLD.BLOCK_LENGTH * WORLD.GRID_SIZE;
    const toX = (worldX: number): number => pad + (worldX / span) * (size - pad * 2);
    const toY = (worldZ: number): number => pad + (worldZ / span) * (size - pad * 2);

    ctx.strokeStyle = 'rgba(120,170,220,0.28)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i <= 4; i += 1) {
      const p = pad + (i / 4) * (size - pad * 2);
      ctx.beginPath();
      ctx.moveTo(p, pad);
      ctx.lineTo(p, size - pad);
      ctx.moveTo(pad, p);
      ctx.lineTo(size - pad, p);
      ctx.stroke();
    }

    if (data.route && data.route.length > 1) {
      ctx.strokeStyle = 'rgba(69, 200, 255, 0.85)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      data.route.forEach((p, i) => {
        const x = pad + (p.x / span) * (size - pad * 2);
        const y = pad + (p.z / span) * (size - pad * 2);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    for (const racer of data.racers ?? []) {
      if (racer.isPlayer) continue;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.arc(pad + (racer.x / span) * (size - pad * 2), pad + (racer.z / span) * (size - pad * 2), 2.4, 0, Math.PI * 2);
      ctx.fill();
    }

    const px = toX(data.playerX ?? 300);
    const py = toY(data.playerZ ?? 450);
    const heading = data.heading ?? 0;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-heading);
    ctx.fillStyle = '#ff8a2a';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.2, 5);
    ctx.lineTo(0, 2.6);
    ctx.lineTo(-4.2, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

export function formatTime(ms: number): string {
  const total = Math.max(0, ms);
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const millis = Math.floor(total % 1000);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

export const HUD_RING_LENGTH = RING_LENGTH;

