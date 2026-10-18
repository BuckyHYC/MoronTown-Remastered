import { VEHICLES, type VehicleSpec } from '../core/Config';

export interface GarageState {
  coins: number;
  owned: string[];
  currentId: string;
  currentColor: string;
}

export interface GarageHandlers {
  /** 返回 true 表示购买成功 */
  onBuy(id: string, price: number): boolean;
  onEquip(id: string, color: string): void;
  onClose(): void;
}

/** 车库：车辆列表 + 属性条 + 涂装 + 购买/装备 */
export class Garage {
  private readonly root: HTMLDivElement;
  private state: GarageState;
  private selectedId: string;
  private selectedColor: string;

  constructor(
    container: HTMLElement,
    state: GarageState,
    private readonly handlers: GarageHandlers,
  ) {
    this.state = { ...state };
    this.selectedId = state.currentId;
    this.selectedColor = state.currentColor;

    this.root = document.createElement('div');
    this.root.className = 'garage hidden';
    this.root.innerHTML = `
      <div class="garage-panel">
        <div class="garage-head">
          <div><span>GARAGE</span><b>车库</b></div>
          <div class="garage-coins" data-coins>◈ 0</div>
        </div>
        <div class="garage-body">
          <div class="garage-list" data-list></div>
          <div class="garage-detail">
            <h3 data-name>—</h3>
            <div class="garage-sub" data-sub>—</div>
            <div class="garage-stats" data-stats></div>
            <div class="garage-colors" data-colors></div>
            <div class="garage-actions">
              <button class="race-ghost" data-act="close">返回</button>
              <button class="race-go" data-act="primary">装备</button>
            </div>
          </div>
        </div>
      </div>
    `;
    container.appendChild(this.root);

    this.root.querySelector('[data-act="close"]')?.addEventListener('click', () => {
      this.hide();
      this.handlers.onClose();
    });
    this.root.querySelector('[data-act="primary"]')?.addEventListener('click', () => this.primaryAction());

    this.render();
  }

  show(state: GarageState): void {
    this.state = { ...state };
    this.selectedId = state.currentId;
    this.selectedColor = state.currentColor;
    this.root.classList.remove('hidden');
    this.render();
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  get visible(): boolean {
    return !this.root.classList.contains('hidden');
  }

  private spec(id: string): VehicleSpec {
    return VEHICLES.find((v) => v.id === id) ?? VEHICLES[0];
  }

  private render(): void {
    const coins = this.root.querySelector('[data-coins]');
    if (coins) coins.textContent = `◈ ${this.state.coins}`;

    const list = this.root.querySelector('[data-list]');
    if (list) {
      list.innerHTML = '';
      for (const spec of VEHICLES) {
        const owned = spec.price === 0 || this.state.owned.includes(spec.id);
        const button = document.createElement('button');
        button.className = 'garage-item';
        button.classList.toggle('active', spec.id === this.selectedId);
        button.innerHTML = `
          <span class="gi-name">${spec.name}</span>
          <span class="gi-meta">${owned ? (spec.id === this.state.currentId ? '使用中' : '已拥有') : `◈ ${spec.price}`}</span>
        `;
        button.addEventListener('click', () => {
          this.selectedId = spec.id;
          this.selectedColor = spec.id === this.state.currentId ? this.state.currentColor : spec.color;
          this.render();
        });
        list.appendChild(button);
      }
    }

    const spec = this.spec(this.selectedId);
    const name = this.root.querySelector('[data-name]');
    if (name) name.textContent = spec.name;
    const sub = this.root.querySelector('[data-sub]');
    if (sub) sub.textContent = `${spec.gears} 挡 · 极速 ${Math.round(spec.topSpeedMs * 3.6)} km/h`;

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

    const colors = this.root.querySelector('[data-colors]');
    if (colors) {
      colors.innerHTML = '';
      for (const color of spec.colors) {
        const dot = document.createElement('button');
        dot.className = 'swatch';
        dot.style.background = color;
        dot.classList.toggle('active', color.toLowerCase() === this.selectedColor.toLowerCase());
        dot.addEventListener('click', () => {
          this.selectedColor = color;
          this.handlers.onEquip(this.selectedId, color);
          this.state.owned = this.state.owned.includes(this.selectedId)
            ? this.state.owned
            : [...this.state.owned, this.selectedId];
          this.render();
        });
        colors.appendChild(dot);
      }
    }

    const primary = this.root.querySelector<HTMLButtonElement>('[data-act="primary"]');
    if (primary) {
      const owned = spec.price === 0 || this.state.owned.includes(spec.id);
      if (owned) {
        primary.textContent = spec.id === this.state.currentId ? '已装备' : '使用此车';
        primary.disabled = spec.id === this.state.currentId;
      } else {
        primary.textContent = `购买并装备 ◈ ${spec.price}`;
        primary.disabled = this.state.coins < spec.price;
      }
    }
  }

  private primaryAction(): void {
    const spec = this.spec(this.selectedId);
    const owned = spec.price === 0 || this.state.owned.includes(spec.id);
    if (!owned) {
      const ok = this.handlers.onBuy(spec.id, spec.price);
      if (!ok) return;
      this.state.owned = [...this.state.owned, spec.id];
      this.state.coins -= spec.price;
    }
    this.selectedColor = spec.colors.includes(this.selectedColor) ? this.selectedColor : spec.colors[0];
    this.handlers.onEquip(spec.id, this.selectedColor);
    this.state.currentId = spec.id;
    this.state.currentColor = this.selectedColor;
    this.render();
  }
}
