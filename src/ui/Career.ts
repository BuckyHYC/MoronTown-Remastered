import type { SaveData } from '../core/SaveStore';
import { achievementProgress, checkInReady, dailyQuests, nextCheckIn } from '../meta/Progress';

export interface CareerHandlers {
  onClaimCheckIn(): void;
  onClaimQuest(id: string): void;
  onClose(): void;
}

/** 生涯：签到 / 每日任务 / 成就 / 统计 */
export class Career {
  private readonly root: HTMLDivElement;
  private save: SaveData | null = null;

  constructor(
    container: HTMLElement,
    private readonly handlers: CareerHandlers,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'career hidden';
    this.root.innerHTML = `
      <div class="career-panel">
        <div class="garage-head">
          <div><span>CAREER</span><b>生涯</b></div>
          <button class="race-ghost" data-act="close">返回</button>
        </div>
        <div class="career-grid">
          <section class="career-card" data-checkin></section>
          <section class="career-card" data-quests></section>
          <section class="career-card career-stats" data-stats></section>
          <section class="career-card career-achievements" data-achievements></section>
        </div>
      </div>
    `;
    container.appendChild(this.root);
    this.root.querySelector('[data-act="close"]')?.addEventListener('click', () => {
      this.hide();
      this.handlers.onClose();
    });
  }

  show(save: SaveData): void {
    this.save = save;
    this.root.classList.remove('hidden');
    this.render();
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  get visible(): boolean {
    return !this.root.classList.contains('hidden');
  }

  private render(): void {
    const save = this.save;
    if (!save) return;

    const checkin = this.root.querySelector('[data-checkin]');
    if (checkin) {
      const ready = checkInReady(save);
      const next = nextCheckIn(save);
      checkin.innerHTML = `
        <h4>每日签到</h4>
        <div class="career-big">${save.daily.checkInStreak}<span>天连续</span></div>
        <button class="race-go" data-checkin ${ready ? '' : 'disabled'}>
          ${ready ? `领取第 ${next.streak} 天 · ◈ ${next.reward}` : '今日已签到'}
        </button>
      `;
      checkin.querySelector('[data-checkin]')?.addEventListener('click', () => this.handlers.onClaimCheckIn());
    }

    const questsEl = this.root.querySelector('[data-quests]');
    if (questsEl) {
      const quests = dailyQuests(save);
      questsEl.innerHTML = `
        <h4>今日任务</h4>
        ${quests
          .map(
            (q) => `
          <div class="quest">
            <div class="quest-top"><b>${q.name}</b><span>${q.progress}/${q.target}</span></div>
            <div class="quest-desc">${q.desc}</div>
            <div class="bar"><i style="width:${(q.progress / q.target) * 100}%"></i></div>
            <button class="race-ghost" data-quest="${q.id}" ${q.done && !q.claimed ? '' : 'disabled'}>
              ${q.claimed ? '已领取' : q.done ? `领取 ◈ ${q.reward}` : '进行中'}
            </button>
          </div>`,
          )
          .join('')}
      `;
      questsEl.querySelectorAll<HTMLButtonElement>('[data-quest]').forEach((btn) => {
        btn.addEventListener('click', () => this.handlers.onClaimQuest(btn.dataset.quest ?? ''));
      });
    }

    const statsEl = this.root.querySelector('[data-stats]');
    if (statsEl) {
      const s = save.stats;
      statsEl.innerHTML = `
        <h4>生涯统计</h4>
        <div class="career-kv">
          <div><span>累计里程</span><b>${s.distanceKm.toFixed(1)} km</b></div>
          <div><span>竞速场次</span><b>${s.races}</b></div>
          <div><span>夺冠次数</span><b>${s.raceWins}</b></div>
          <div><span>极速纪录</span><b>${Math.round(s.topSpeedKmh)} km/h</b></div>
          <div><span>行驶时长</span><b>${Math.round(s.playSeconds / 60)} 分钟</b></div>
          <div><span>累计赚取</span><b>◈ ${s.coinsEarned}</b></div>
          <div><span>行人撞击</span><b>${s.pedestrianKills}</b></div>
          <div><span>金币余额</span><b>◈ ${save.coins}</b></div>
        </div>
      `;
    }

    const achEl = this.root.querySelector('[data-achievements]');
    if (achEl) {
      const list = achievementProgress(save);
      achEl.innerHTML = `
        <h4>成就 ${list.filter((a) => a.unlocked).length}/${list.length}</h4>
        <div class="ach-list">
          ${list
            .map(
              (a) => `
            <div class="ach ${a.unlocked ? 'done' : ''}">
              <span class="ach-icon">${a.def.icon}</span>
              <div class="ach-body">
                <b>${a.def.name}</b>
                <span>${a.def.desc}</span>
              </div>
              <span class="ach-reward">${a.unlocked ? '已解锁' : `◈ ${a.def.reward}`}</span>
            </div>`,
            )
            .join('')}
        </div>
      `;
    }
  }
}
