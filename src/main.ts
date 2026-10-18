import './styles/base.css';
import './styles/menu.css';
import * as THREE from 'three';
// 调试期暴露（供 tools/diag.mjs 计算包围盒）
(window as unknown as Record<string, unknown>).THREE = THREE;
import { RenderEngine } from './render/Renderer';
import { SkySystem } from './render/Sky';
import { CityWorld, type Aabb } from './world/CityWorld';
import { VehicleModel } from './vehicle/Vehicle';
import { VehicleDynamics } from './gameplay/Dynamics';
import { CameraRig } from './gameplay/CameraRig';
import { InputSystem } from './gameplay/Input';
import { Hud } from './ui/Hud';
import { Menu } from './ui/Menu';
import { GameClock } from './core/Clock';
import { SaveStore } from './core/SaveStore';
import { TIME_ORDER, TIME_PRESETS, VEHICLES, WORLD, PHYSICS, type QualityTier, type TimeId } from './core/Config';
import { bus } from './core/EventBus';

const TIERS: QualityTier[] = ['low', 'medium', 'high', 'ultra'];

function resolveTier(): QualityTier {
  const params = new URLSearchParams(location.search);
  const forced = params.get('quality');
  if (forced && TIERS.includes(forced as QualityTier)) return forced as QualityTier;
  if (navigator.webdriver) return 'low';
  return 'high';
}

class Game {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(66, 1, 0.15, 3200);
  readonly engine: RenderEngine;
  readonly sky: SkySystem;
  readonly world: CityWorld;
  readonly vehicle: VehicleModel;
  readonly dynamics: VehicleDynamics;
  readonly rig: CameraRig;
  readonly input = new InputSystem();
  readonly hud: Hud;
  readonly clock: GameClock;
  readonly save = new SaveStore();
  readonly uiRoot: HTMLElement;
  timeId: TimeId = 'day';
  private mode: 'menu' | 'drive' = 'menu';
  private elapsed = 0;
  private raceTimeMs = 0;
  private readonly colliders: Aabb[] = [];
  private readonly carPos = new THREE.Vector3(WORLD.SPAWN_X, 0, WORLD.SPAWN_Z);
  private photo: { angle: number; radius: number; height: number } | null = null;
  private menu: Menu | null = null;
  private menuAngle = Math.PI / 2 - 0.55;
  private headlights: THREE.SpotLight[] = [];
  private readonly lampLights: THREE.PointLight[] = [];
  private lampTimer = 0;

  constructor(container: HTMLElement, tier: QualityTier) {
    this.engine = new RenderEngine(container, this.scene, this.camera, tier);
    this.sky = new SkySystem(this.engine.renderer, this.scene);
    this.sky.setShadowDistance(this.engine.quality.shadowDistance || 60);

    this.world = new CityWorld();
    this.world.build(this.scene);
    this.colliders.push(...this.world.colliders);

    const spec = VEHICLES[0];
    this.vehicle = new VehicleModel(spec);
    this.dynamics = new VehicleDynamics(spec);
    this.rig = new CameraRig(this.camera);

    const ui = document.getElementById('ui') ?? container;
    this.uiRoot = ui;
    this.hud = new Hud(ui);
    this.clock = new GameClock(PHYSICS.FIXED_STEP);
    this.input.attach(this.engine.canvas);

    this.setTime('day', true);
    this.engine.applyPreset(TIME_PRESETS.day);
  }

  async boot(): Promise<void> {
    await this.vehicle.load('/assets/models/car-concept.glb', VEHICLES[0].color);
    this.scene.add(this.vehicle.root);
    this.dynamics.reset(WORLD.SPAWN_X, WORLD.SPAWN_Z, Math.PI * 0.5);
    this.vehicle.root.position.set(WORLD.SPAWN_X, 0, WORLD.SPAWN_Z);
    this.rig.snap();
    this.setupLights();

    this.menu = new Menu(this.uiRoot, {
      onStart: () => this.startDrive(),
      onTime: (id: TimeId) => {
        this.setTime(id, true);
        this.menu?.setActiveTime(id);
      },
      onQuality: (tier: QualityTier) => {
        this.engine.setTier(tier);
        this.sky.setShadowDistance(this.engine.quality.shadowDistance || 60);
        this.menu?.setActiveQuality(tier);
      },
      onPaint: (color: string) => {
        this.vehicle.setPaint(color);
        this.save.data.car.color = color;
        this.save.save();
      },
      onPlaceholder: (name: string) => this.menu?.notice(`${name} 正在开发中`),
    });
    this.menu.setCar(this.vehicle.spec, this.save.data.car.color);
    this.menu.setActiveTime(this.timeId);
    this.menu.setActiveQuality(resolveTier());
    this.menu.setCoins(this.save.data.coins);
    this.hud.setVisible(false);

    const loading = document.getElementById('loading');
    if (loading) {
      loading.style.opacity = '0';
      setTimeout(() => loading.remove(), 420);
    }
    this.installDebug();
    requestAnimationFrame(this.frame);
  }

  private setTime(id: TimeId, instant = false): void {
    this.timeId = id;
    this.sky.setPreset(id);
    this.engine.applyPreset(TIME_PRESETS[id]);
    const preset = TIME_PRESETS[id];
    this.world.setNight(preset.neon);
    this.world.setLampIntensity(preset.lamp);
    const headStrength = preset.lamp > 0.25 ? preset.lamp : 0;
    for (const spot of this.headlights) {
      spot.intensity = headStrength * 70;
      spot.visible = headStrength > 0.05;
    }
    if (this.mode === 'drive') {
      this.hud.toast(`${preset.label}${instant ? '' : ' · 已切换'}`, 'info');
    }
    bus.emit('time:changed', { id, instant });
  }

  private cycleTime(): void {
    const index = TIME_ORDER.indexOf(this.timeId);
    this.setTime(TIME_ORDER[(index + 1) % TIME_ORDER.length]);
  }

  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const info = this.clock.begin(now);
    const dt = this.clock.stepSeconds;
    const frameDt = info.frameDt;

    if (this.mode === 'drive') {
      for (let i = 0; i < info.steps; i += 1) {
        this.dynamics.step(dt, this.input.state);
        this.resolveCollisions();
      }
    }

    this.updateWorld(dt, info.alpha);
    this.updateLampLights(frameDt);
    this.handleActions();

    const speedRatio = this.dynamics.speedRatio;
    this.engine.setSpeed(speedRatio, this.elapsed);
    this.sky.update(this.camera.position, this.elapsed);
    this.engine.render();

    this.elapsed += frameDt;
    if (this.mode === 'drive') this.raceTimeMs += frameDt * 1000;

    if (this.mode === 'drive') {
      this.hud.update({
        speedKmh: this.dynamics.speedKmh,
        gear: this.dynamics.state.gear,
        rpmRatio: this.dynamics.rpmRatio,
        position: 1,
        totalRacers: 1,
        lap: 1,
        totalLaps: 1,
        timeMs: this.raceTimeMs,
        mode: 'freeRoam',
        coins: this.save.data.coins,
        kills: this.save.data.stats.pedestrianKills,
        cameraMode: this.rig.mode,
        timeOfDay: TIME_PRESETS[this.timeId].label,
        fps: this.clock.fps,
      });
    }
  };

  private updateWorld(dt: number, alpha: number): void {
    const s = this.dynamics.state;
    const x = s.prevX + (s.x - s.prevX) * alpha;
    const z = s.prevZ + (s.z - s.prevZ) * alpha;
    const heading = s.prevHeading + (s.heading - s.prevHeading) * alpha;
    this.carPos.set(x, 0, z);

    this.vehicle.root.position.set(x, 0, z);
    this.vehicle.root.rotation.y = heading + s.driftPose * s.steerAngle * 2.6;
    const baseYaw = this.vehicle.body.rotation.y;
    this.vehicle.body.rotation.set(s.pitch, baseYaw, s.roll + s.lateral * 0.004);
    this.vehicle.syncWheels(s.wheelRoll, s.steerAngle, s.driftPose, this.input.state.steer);
    this.vehicle.syncLights(
      this.input.state.brake > 0.05 && s.speed > 0.4,
      s.gear === 0,
      Math.abs(this.input.state.steer) > 0.3 && Math.abs(s.speed) > 4 ? 1 : 0,
      s.speed,
    );

    if (this.mode === 'menu') {
      this.menuAngle += dt * 0.1;
      const radius = 12.6;
      this.camera.position.set(
        x + Math.sin(this.menuAngle) * radius,
        3.05,
        z + Math.cos(this.menuAngle) * radius,
      );
      this.camera.lookAt(x, 0.92, z);
      this.camera.fov = 42;
      this.camera.updateProjectionMatrix();
      return;
    }

    if (this.photo) {
      const { angle, radius, height } = this.photo;
      this.camera.position.set(x + Math.sin(angle) * radius, height, z + Math.cos(angle) * radius);
      this.camera.lookAt(x, 0.72, z);
      this.camera.fov = 38;
      this.camera.updateProjectionMatrix();
      return;
    }

    this.rig.update(
      dt,
      this.carPos,
      heading + s.driftPose * s.steerAngle * 2.6,
      s,
      this.vehicle.spec,
      this.dynamics.speedRatio,
      this.input.consumeOrbitDelta(),
      this.save.data.video.speedFov,
    );
  }

  private handleActions(): void {
    if (this.mode === 'menu') {
      if (this.input.consume('confirm')) this.startDrive();
      if (this.input.consume('time')) this.cycleTime();
      return;
    }
    if (this.input.consume('camera')) {
      const mode = this.rig.cycle();
      this.hud.toast(
        mode === 'chase' ? '追尾视角' : mode === 'hood' ? '引擎盖视角' : '座舱视角',
        'info',
      );
    }
    if (this.input.consume('time')) this.cycleTime();
    if (this.input.consume('reset')) {
      this.dynamics.reset(WORLD.SPAWN_X, WORLD.SPAWN_Z, Math.PI * 0.5);
      this.rig.snap();
      this.hud.toast('车辆已重置', 'info');
    }
    if (this.input.consume('back')) {
      this.mode = 'menu';
      this.menu?.show();
      this.hud.setVisible(false);
      this.menuAngle = 0.6;
    }
  }

  private startDrive(): void {
    this.mode = 'drive';
    this.menu?.hide();
    this.hud.setVisible(true);
    this.rig.snap();
    this.hud.toast('WASD 驾驶 · 空格漂移 · C 视角', 'info');
  }

  /** 车灯 + 路灯点光池（固定数量，运行时只搬位置） */
  private setupLights(): void {
    const spec = this.vehicle.spec;
    for (const sign of [-1, 1]) {
      const spot = new THREE.SpotLight(0xfff2d6, 0, 62, 0.52, 0.42, 1.3);
      spot.position.set(sign * 0.62, 0.66, spec.length * 0.44);
      spot.target.position.set(sign * 1.6, 0.05, spec.length * 0.44 + 26);
      spot.visible = false;
      this.vehicle.root.add(spot);
      this.vehicle.root.add(spot.target);
      this.headlights.push(spot);
    }
    for (let i = 0; i < 4; i += 1) {
      const light = new THREE.PointLight(0xffcf9a, 0, 34, 2);
      light.visible = false;
      this.scene.add(light);
      this.lampLights.push(light);
    }
  }

  private updateLampLights(dt: number): void {
    const strength = TIME_PRESETS[this.timeId].lamp;
    if (strength <= 0.05) {
      for (const light of this.lampLights) light.visible = false;
      return;
    }
    for (const light of this.lampLights) {
      light.visible = true;
      light.intensity = strength * 26;
    }
    this.lampTimer -= dt;
    if (this.lampTimer > 0) return;
    this.lampTimer = 0.4;
    const lamps = this.world.lampPositions;
    const nearest = lamps
      .map((p) => ({ p, d: (p.x - this.carPos.x) ** 2 + (p.z - this.carPos.z) ** 2 }))
      .sort((a, b) => a.d - b.d)
      .slice(0, this.lampLights.length);
    nearest.forEach((entry, index) => {
      const light = this.lampLights[index];
      if (!light) return;
      light.position.set(entry.p.x, 6.4, entry.p.z);
    });
  }

  /** 圆-AABB 推离：建筑/路灯/树，撞击减速并触发震屏 */
  private resolveCollisions(): void {
    const s = this.dynamics.state;
    const spec = this.vehicle.spec;
    const radius = spec.width / 2 + 0.22;
    for (const box of this.colliders) {
      const cx = Math.max(box.minX, Math.min(s.x, box.maxX));
      const cz = Math.max(box.minZ, Math.min(s.z, box.maxZ));
      const dx = s.x - cx;
      const dz = s.z - cz;
      const dist2 = dx * dx + dz * dz;
      if (dist2 >= radius * radius) continue;
      const dist = Math.sqrt(dist2) || 0.0001;
      const nx = dist2 > 1e-6 ? dx / dist : 1;
      const nz = dist2 > 1e-6 ? dz / dist : 0;
      const push = radius - dist;
      s.x += nx * push;
      s.z += nz * push;
      const impact = Math.abs(s.speed);
      if (impact > 4) {
        s.speed *= 0.55;
        s.lateral *= 0.4;
        this.rig.addShake(Math.min(0.9, impact / 40));
        bus.emit('vehicle:collide', { intensity: impact, x: s.x, z: s.z });
      }
    }
    const bound = this.world.span + 30;
    s.x = Math.max(-30, Math.min(bound, s.x));
    s.z = Math.max(-30, Math.min(bound, s.z));
  }

  resize(): void {
    this.engine.resize(window.innerWidth, window.innerHeight);
  }

  get stats() {
    return {
      ...this.engine.stats(),
      fps: Number(this.clock.fps.toFixed(1)),
      mode: this.mode,
      timeOfDay: this.timeId,
      camera: this.rig.mode,
      city: this.world.stats(),
      speedKmh: Math.round(this.dynamics.speedKmh),
    };
  }

  private installDebug(): void {
    (window as unknown as Record<string, unknown>).__RE__ = {
      game: this,
      stats: () => this.stats,
      text: () =>
        JSON.stringify({
          mode: this.mode,
          timeOfDay: this.timeId,
          camera: this.rig.mode,
          player: {
            x: Math.round(this.dynamics.state.x),
            z: Math.round(this.dynamics.state.z),
            heading: Number(this.dynamics.state.heading.toFixed(3)),
            speedKmh: Math.round(this.dynamics.speedKmh),
            gear: this.dynamics.state.gear,
          },
          fps: Number(this.clock.fps.toFixed(1)),
        }),
      setTime: (id: TimeId) => this.setTime(id, true),
      start: () => this.startDrive(),
      menu: () => {
        this.mode = 'menu';
        this.menu?.show();
        this.hud.setVisible(false);
      },
      teleport: (x: number, z: number) => {
        this.dynamics.reset(x, z, this.dynamics.state.heading);
        this.rig.snap();
      },
      photo: (angleDeg: number, radius = 6, height = 1.7) => {
        this.photo = { angle: THREE.MathUtils.degToRad(angleDeg), radius, height };
      },
      photoOff: () => {
        this.photo = null;
        this.rig.snap();
      },
      setQuality: (tier: QualityTier) => {
        this.engine.setTier(tier);
        this.sky.setShadowDistance(this.engine.quality.shadowDistance || 60);
      },
      input: this.input,
    };
  }
}

async function main(): Promise<void> {
  const app = document.getElementById('app');
  if (!app) throw new Error('缺少 #app 容器');
  const game = new Game(app, resolveTier());
  await game.boot();
  window.addEventListener('resize', () => game.resize());

  // 开发期便捷入口：?time=night 直接进入指定时段，?autostart=1 直接开车
  const params = new URLSearchParams(location.search);
  const time = params.get('time');
  const api = (window as unknown as { __RE__: { setTime: (id: TimeId) => void; start: () => void } }).__RE__;
  if (time && (TIME_ORDER as string[]).includes(time)) api.setTime(time as TimeId);
  if (params.get('autostart') === '1') api.start();
}

void main();
