import { RACE_LAYOUTS, type RaceLayout } from '../race/Layouts';
import type { Difficulty, RaceResult } from '../gameplay/RaceManager';

export interface RaceSetup {
  layout: RaceLayout;
  laps: number;
  opponents: number;
  difficulty: Difficulty;
}

const DIFF_LABEL: Record<Difficulty, string> = { easy: '简单', normal: '普通', hard: '困难' };

/** 竞速设置 / 倒计时 / 结算 三块 UI */
export class RaceUi {
  private readonly setup: HTMLDivElement;
  private readonly countdown: HTMLDivElement;
  private readonly results: HTMLDivElement;
  private layoutIndex = 0;
  private laps = 2;
  private opponents = 3;
  private difficulty: Difficulty = 'normal';
  private onStart: ((setup: RaceSetup) => void) | null = null;
  private onRestart: (() => void) | null = null;
  private onExit: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.setup = document.createElement('div');
    this.setup.className = 'race-setup hidden';
    this.setup.innerHTML = `
      <div class="race-panel">
        <div class="race-head"><span>RACE SETUP</span><b>竞速设置</b></div>
        <div class="race-row" data-row="layout"><label>赛道</label><div class="race-options" data-layouts></div></div>
        <div class="race-row" data-row="laps"><label>圈数</label><div class="race-options" data-laps></div></div>
        <div class="race-row" data-row="opponents"><label>对手</label><div class="race-options" data-opponents></div></div>
        <div class="race-row" data-row="difficulty"><label>难度</label><div class="race-options" data-difficulty></div></div>
        <div class="race-actions">
          <button class="race-ghost" data-act="cancel">取消</button>
          <button class="race-go" data-act="start">开始比赛</button>
        </div>
      </div>
    `;
    container.appendChild(this.setup);

    this.countdown = document.createElement('div');
    this.countdown.className = 'race-countdown hidden';
    container.appendChild(this.countdown);

    this.results = document.createElement('div');
    this.results.className = 'race-results hidden';
    container.appendChild(this.results);

    this.buildOptions();
    this.setup.querySelector('[data-act="cancel"]')?.addEventListener('click', () => this.hideSetup());
    this.setup.querySelector('[data-act="start"]')?.addEventListener('click', () => {
      this.hideSetup();
      this.onStart?.({
        layout: RACE_LAYOUTS[this.layoutIndex],
        laps: this.laps,
        opponents: this.opponents,
        difficulty: this.difficulty,
      });
    });
  }

  private buildOptions(): void {
    const layouts = this.setup.querySelector('[data-layouts]');
    if (layouts) {
      RACE_LAYOUTS.forEach((layout, index) => {
        const btn = document.createElement('button');
        btn.textContent = layout.name;
        btn.dataset.value = String(index);
        btn.addEventListener('click', () => {
          this.layoutIndex = index;
          this.refresh();
        });
        layouts.appendChild(btn);
      });
    }
    const laps = this.setup.querySelector('[data-laps]');
    if (laps) {
      [1, 2, 3].forEach((n) => {
        const btn = document.createElement('button');
        btn.textContent = `${n} 圈`;
        btn.dataset.value = String(n);
        btn.addEventListener('click', () => {
          this.laps = n;
          this.refresh();
        });
        laps.appendChild(btn);
      });
    }
    const opponents = this.setup.querySelector('[data-opponents]');
    if (opponents) {
      [1, 3, 5].forEach((n) => {
        const btn = document.createElement('button');
        btn.textContent = `${n} 台`;
        btn.dataset.value = String(n);
        btn.addEventListener('click', () => {
          this.opponents = n;
          this.refresh();
        });
        opponents.appendChild(btn);
      });
    }
    const difficulty = this.setup.querySelector('[data-difficulty]');
    if (difficulty) {
      (['easy', 'normal', 'hard'] as Difficulty[]).forEach((level) => {
        const btn = document.createElement('button');
        btn.textContent = DIFF_LABEL[level];
        btn.dataset.value = level;
        btn.addEventListener('click', () => {
          this.difficulty = level;
          this.refresh();
        });
        difficulty.appendChild(btn);
      });
    }
    this.refresh();
  }

  private refresh(): void {
    const mark = (selector: string, active: string): void => {
      this.setup.querySelectorAll<HTMLButtonElement>(`${selector} button`).forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.value === active);
      });
    };
    mark('[data-layouts]', String(this.layoutIndex));
    mark('[data-laps]', String(this.laps));
    mark('[data-opponents]', String(this.opponents));
    mark('[data-difficulty]', this.difficulty);
  }

  showSetup(start: (setup: RaceSetup) => void, exit: () => void): void {
    this.onStart = start;
    this.onExit = exit;
    this.setup.classList.remove('hidden');
  }

  hideSetup(): void {
    this.setup.classList.add('hidden');
    this.onExit?.();
  }

  get setupVisible(): boolean {
    return !this.setup.classList.contains('hidden');
  }

  showCountdown(value: number): void {
    const label = value > 0 ? String(Math.ceil(value)) : 'GO';
    this.countdown.textContent = label;
    this.countdown.dataset.state = value > 0 ? 'count' : 'go';
    this.countdown.classList.remove('hidden');
  }

  hideCountdown(): void {
    this.countdown.classList.add('hidden');
  }

  showResults(
    result: RaceResult,
    reward: number,
    best: boolean,
    onRestart: () => void,
    onExit: () => void,
    onFreeRoam: () => void,
  ): void {
    this.onRestart = onRestart;
    this.onExit = onExit;
    const medal = result.position === 1 ? '冠军' : result.position === 2 ? '亚军' : result.position === 3 ? '季军' : '完赛';
    this.results.innerHTML = `
      <div class="result-card">
        <div class="result-kicker">${result.layoutName} · ${DIFF_LABEL[result.difficulty]} · ${result.laps} 圈</div>
        <div class="result-rank"><b>${result.position}</b><span>/ ${result.totalRacers}</span></div>
        <div class="result-medal">${medal}${best ? ' · 刷新纪录' : ''}</div>
        <div class="result-grid">
          <div><span>总用时</span><b>${fmt(result.totalMs)}</b></div>
          <div><span>最佳圈</span><b>${fmt(result.bestLapMs)}</b></div>
          <div><span>奖励</span><b>◈ ${reward}</b></div>
        </div>
        <div class="result-actions">
          <button class="race-ghost" data-act="free">自由漫游</button>
          <button class="race-ghost" data-act="exit">返回菜单</button>
          <button class="race-go" data-act="again">再来一局</button>
        </div>
      </div>
    `;
    this.results.classList.remove('hidden');
    this.results.querySelector('[data-act="again"]')?.addEventListener('click', () => {
      this.hideResults();
      this.onRestart?.();
    });
    this.results.querySelector('[data-act="exit"]')?.addEventListener('click', () => {
      this.hideResults();
      this.onExit?.();
    });
    this.results.querySelector('[data-act="free"]')?.addEventListener('click', () => {
      this.hideResults();
      onFreeRoam();
    });
  }

  hideResults(): void {
    this.results.classList.add('hidden');
  }

  get resultsVisible(): boolean {
    return !this.results.classList.contains('hidden');
  }
}

function fmt(ms: number): string {
  if (!ms) return '--:--.---';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const t = Math.floor(ms % 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(t).padStart(3, '0')}`;
}
