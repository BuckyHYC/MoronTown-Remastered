import './styles/base.css';
import './styles/menu.css';
import './styles/race.css';
import * as THREE from 'three';
// 调试期暴露（供 tools/diag.mjs 计算包围盒）
(window as unknown as Record<string, unknown>).THREE = THREE;
import { RenderEngine } from './render/Renderer';
import { SkySystem } from './render/Sky';
import { PlanarReflector } from './render/Reflector';
import { Signage } from './world/Signage';
import { CityWorld, type Aabb } from './world/CityWorld';
import { VehicleModel } from './vehicle/Vehicle';
import { VehicleDynamics } from './gameplay/Dynamics';
import { CameraRig } from './gameplay/CameraRig';
import { InputSystem } from './gameplay/Input';
import { Traffic } from './gameplay/Traffic';
import { AiRacers } from './gameplay/AiRacers';
import { TaskPoints } from './gameplay/TaskPoints';
import { RaceManager, type RaceResult } from './gameplay/RaceManager';
import { RACE_LAYOUTS } from './race/Layouts';
import { RaceUi, type RaceSetup } from './ui/RaceUi';
import { Garage } from './ui/Garage';
import { Pause } from './ui/Pause';
import { TouchControls, isTouchDevice } from './ui/TouchControls';
import { AudioSystem } from './audio/AudioSystem';
import { Pedestrians } from './gameplay/Pedestrians';
import { GroundFx } from './fx/GroundFx';
import { RainSystem } from './fx/RainSystem';
import { Career } from './ui/Career';
import { achievementProgress, dailyQuests, checkInReady, nextCheckIn } from './meta/Progress';
import './styles/screens.css';
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
  readonly signage: Signage;
  readonly traffic: Traffic;
  readonly raceUi: RaceUi;
  readonly audio: AudioSystem;
  readonly garage: Garage;
  readonly career: Career;
  readonly peds: Pedestrians;
  readonly tasks: TaskPoints;
  readonly fx: GroundFx;
  readonly rain: RainSystem | null = null;
  private rainOn = false;
  private readonly wheelWorld: { x: number; y: number; z: number; axle: 'front' | 'rear'; side: 'L' | 'R' }[] = [];
  private readonly tmpWheel = new THREE.Vector3();
  private pendingKm = 0;
  private saveTimer = 0;
  private adaptiveTimer = 0;
  private renderScale = 1;
  private adaptiveEnabled = true;
  readonly pause: Pause;
  readonly touch: TouchControls | null = null;
  private paused = false;
  private race: RaceManager | null = null;
  private aiRacers: AiRacers | null = null;
  private lastSetup: RaceSetup | null = null;
  readonly reflector: PlanarReflector | null = null;
  readonly vehicle: VehicleModel;
  readonly dynamics: VehicleDynamics;
  readonly rig: CameraRig;
  readonly input = new InputSystem();
  readonly hud: Hud;
  readonly clock: GameClock;
  readonly save = new SaveStore();
  readonly uiRoot: HTMLElement;
  timeId: TimeId = 'day';
  private mode: 'menu' | 'drive' | 'race' = 'menu';
  private elapsed = 0;
  private raceTimeMs = 0;
  private readonly colliders: Aabb[] = [];
  private readonly carPos = new THREE.Vector3(WORLD.SPAWN_X, 0, WORLD.SPAWN_Z);
  private photo: { angle: number; radius: number; height: number } | null = null;
  private menu: Menu | null = null;
  private menuAngle = 2.15;
  private headlights: THREE.SpotLight[] = [];
  private readonly lampLights: THREE.PointLight[] = [];
  private invertSteer = false;
  private cockpitLight: THREE.PointLight | null = null;
  private heroLight: THREE.PointLight | null = null;
  private heroFill: THREE.PointLight | null = null;
  private lampTimer = 0;

  constructor(container: HTMLElement, tier: QualityTier) {
    this.engine = new RenderEngine(container, this.scene, this.camera, tier);
    this.sky = new SkySystem(this.engine.renderer, this.scene);
    this.sky.setShadowDistance(this.engine.quality.shadowDistance || 60);

    this.world = new CityWorld();
    this.world.build(this.scene);
    this.colliders.push(...this.world.colliders);

    this.signage = new Signage(this.world.footprints, 150);
    this.scene.add(this.signage.group);
    this.traffic = new Traffic(this.scene, WORLD.GRID_SIZE, 48);

    if (this.world.roadGeometry && this.engine.quality.reflection !== 'off') {
      const half = this.engine.quality.reflection === 'half' ? 0.5 : 0.4;
      this.reflector = new PlanarReflector(this.world.roadGeometry, half);
      this.scene.add(this.reflector.mesh);
    }

    const spec = VEHICLES[0];
    this.vehicle = new VehicleModel(spec);
    this.dynamics = new VehicleDynamics(spec);
    this.rig = new CameraRig(this.camera);

    const ui = document.getElementById('ui') ?? container;
    this.uiRoot = ui;
    this.hud = new Hud(ui);
    this.raceUi = new RaceUi(ui);
    this.audio = new AudioSystem(
      this.save.data.audio.muted,
      this.save.data.audio.bgm,
      this.save.data.audio.sfx,
    );
    this.garage = new Garage(
      ui,
      {
        coins: this.save.data.coins,
        owned: this.save.data.car.owned,
        currentId: this.save.data.car.id,
        currentColor: this.save.data.car.color,
      },
      {
        onBuy: (id, price) => this.buyVehicle(id, price),
        onEquip: (id, color) => this.equipVehicle(id, color),
        onClose: () => this.menu?.show(),
      },
    );
    this.career = new Career(ui, {
      onClaimCheckIn: () => this.claimCheckIn(),
      onClaimQuest: (id) => this.claimQuest(id),
      onClose: () => this.menu?.show(),
    });
    this.peds = new Pedestrians(this.scene, WORLD.GRID_SIZE, 72);
    this.tasks = new TaskPoints([
      { x: 300, z: 300, layoutIndex: 0, label: '城市环路' },
      { x: 750, z: 450, layoutIndex: 1, label: '城市巡回' },
      { x: 1050, z: 750, layoutIndex: 2, label: '山地纵贯' },
    ]);
    this.scene.add(this.tasks.group);
    this.fx = new GroundFx(this.scene, this.engine.quality.particleBudget);
    this.scene.add(this.fx.group);
    if (this.engine.quality.particleBudget > 0) {
      this.rain = new RainSystem(7000);
      this.scene.add(this.rain.group);
      this.rainOn = this.save.data.video.rain;
      this.rain.setEnabled(this.rainOn);
    }
    this.pause = new Pause(ui, {
      onResume: () => this.setPaused(false),
      onRestart: () => this.restartMode(),
      onMenu: () => this.exitToMenu(),
      onTime: (id) => this.setTime(id, true),
      onMute: (muted) => {
        this.save.data.audio.muted = muted;
        this.save.save();
        this.audio.setMuted(muted);
      },
      onRain: (on) => this.toggleRain(on),
      onQuality: (tier) => {
        this.engine.setTier(tier);
        this.save.data.video.quality = tier;
        this.save.save();
      },
      onInvertSteer: (on) => {
        this.invertSteer = on;
        this.save.data.control.invertSteer = on;
        this.save.save();
      },
    });
    this.invertSteer = this.save.data.control.invertSteer;
    if (isTouchDevice()) {
      this.touch = new TouchControls(
        ui,
        { onCamera: () => this.cycleCamera(), onPause: () => this.setPaused(true) },
        (steer, throttle, brake, handbrake) => {
          this.input.setTouch(steer, throttle, brake, handbrake);
          if (!steer && !throttle && !brake && !handbrake) this.input.clearTouch();
        },
        () => this.input.clearTouch(),
      );
      this.touch.setVisible(false);
    }
    this.clock = new GameClock(PHYSICS.FIXED_STEP);
    this.input.attach(this.engine.canvas);

    this.setTime('day', true);
    this.engine.applyPreset(TIME_PRESETS.day);
    void bus.on('vehicle:shift', () => this.audio.playShift());
    void bus.on('vehicle:collide', (event) => this.audio.playCollision(event.intensity));
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
      onRace: () => this.openRaceSetup(),
      onGarage: () => this.openGarage(),
      onCareer: () => this.openCareer(),
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
    this.signage.setNight(preset.neon);
    this.reflector?.setWetness(Math.min(1, preset.wetness + (this.rainOn ? 0.6 : 0)));
    const headStrength = preset.lamp > 0.25 ? preset.lamp : 0;
    for (const spot of this.headlights) {
      spot.intensity = headStrength * 900;
      spot.visible = headStrength > 0.05;
    }
    if (this.heroLight) this.heroLight.intensity = preset.lamp * 62;
    if (this.heroFill) this.heroFill.intensity = preset.lamp * 28;
    if (this.mode === 'drive') {
      this.hud.toast(`${preset.label}${instant ? '' : ' · 已切换'}`, 'info');
    }
    bus.emit('time:changed', { id, instant });
  }

  private cycleTime(): void {
    const index = TIME_ORDER.indexOf(this.timeId);
    this.setTime(TIME_ORDER[(index + 1) % TIME_ORDER.length]);
  }

  /** 采样四个车轮的世界坐标，供胎痕/胎烟使用 */
  private sampleWheels(): typeof this.wheelWorld {
    this.vehicle.root.updateMatrixWorld(true);
    this.wheelWorld.length = 0;
    for (const wheel of this.vehicle.wheels) {
      wheel.roll.getWorldPosition(this.tmpWheel);
      this.wheelWorld.push({
        x: this.tmpWheel.x,
        y: this.tmpWheel.y,
        z: this.tmpWheel.z,
        axle: wheel.axle,
        side: wheel.side,
      });
    }
    return this.wheelWorld;
  }

  /** 切换视角（键盘 C / 触屏「视角」按钮共用） */
  private cycleCamera(): void {
    const mode = this.rig.cycle();
    this.hud.toast(
      mode === 'chase' ? '追尾视角' : mode === 'hood' ? '引擎盖视角' : '座舱视角',
      'info',
    );
  }

  /** 天气开关：下雨同时提高路面湿度（反射更强、颜色更深） */
  toggleRain(force?: boolean): void {
    if (!this.rain) {
      this.hud.toast('当前画质档位不支持降雨', 'warn');
      return;
    }
    const next = force ?? !this.rainOn;
    if (next === this.rainOn) return;
    this.rainOn = next;
    this.rain.setEnabled(next);
    this.rain.snap(this.camera);
    this.save.data.video.rain = next;
    this.save.save();
    const preset = TIME_PRESETS[this.timeId];
    this.reflector?.setWetness(Math.min(1, preset.wetness + (next ? 0.6 : 0)));
    this.engine.applyPreset(preset);
    this.audio.setRain(next);
    this.hud.toast(next ? '开始下雨' : '雨停了', 'info');
    bus.emit('weather:changed', { rain: next });
  }

  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const info = this.clock.begin(now);
    const dt = this.clock.stepSeconds;
    const frameDt = info.frameDt;

    if (this.mode !== 'menu' && !this.paused) {
      const locked = this.race?.phase === 'countdown';
      const raw = this.input.state;
      // 触屏/键鼠手感差异大，允许在暂停菜单里反转向
      const sign = this.invertSteer ? -1 : 1;
      const driveInput = locked
        ? { throttle: 0, brake: 0, steer: 0, handbrake: true }
        : { throttle: raw.throttle, brake: raw.brake, steer: raw.steer * sign, handbrake: raw.handbrake };
      for (let i = 0; i < info.steps; i += 1) {
        this.dynamics.step(dt, driveInput);
        this.resolveCollisions();
      }
    }

    this.updateWorld(info.alpha, Math.min(frameDt, 0.1));
    if (this.mode !== 'menu') {
      this.fx.update(frameDt, {
        drift: this.dynamics.state.driftPose,
        speed: this.dynamics.state.speed,
        lateral: this.dynamics.state.lateral,
        handbrake: this.input.state.handbrake,
        wheels: this.sampleWheels(),
      });
    }
    this.rain?.update(this.camera, frameDt);
    if (this.mode === 'drive' && !this.paused && !this.raceUi.setupVisible) {
      const entered = this.tasks.update(frameDt, this.elapsed, this.dynamics.state.x, this.dynamics.state.z);
      if (entered !== null) {
        this.hud.toast(`进入 ${RACE_LAYOUTS[entered]?.name ?? '赛道'} 竞速点`, 'good');
        this.openRaceSetup(entered);
      }
    }
    this.traffic.update(frameDt);
    this.updateRace(frameDt);
    if (!this.paused) this.peds.update(frameDt, this.elapsed);
    if (!this.paused) {
      this.audio.update(
        this.dynamics.state.speed,
        this.dynamics.rpmRatio,
        this.input.state.throttle,
        this.dynamics.state.lateral,
        this.dynamics.state.gear,
      );
    }
    this.updateLampLights(frameDt);
    this.handleActions();
    if (this.touch) {
      const showTouch = this.mode !== 'menu' && !this.paused;
      if (this.touch.active !== showTouch) this.touch.setVisible(showTouch);
    }

    const speedRatio = this.dynamics.speedRatio;
    this.engine.setSpeed(speedRatio, this.elapsed);
    this.sky.update(this.camera.position, this.elapsed);
    this.reflector?.update(this.engine.renderer, this.scene, this.camera, this.elapsed);
    this.engine.render();

    this.trackProgress(frameDt);
    // 自适应分辨率默认关闭：SwiftShader 下 composer.setPixelRatio 会导致合成器输出黑屏
    if (this.adaptiveEnabled) this.updateAdaptiveScale(frameDt);
    this.elapsed += frameDt;
    if (this.mode !== 'menu') this.raceTimeMs += frameDt * 1000;

    if (this.mode !== 'menu') {
      const race = this.race;
      this.hud.update({
        speedKmh: this.dynamics.speedKmh,
        gear: this.dynamics.state.gear,
        rpmRatio: this.dynamics.rpmRatio,
        position: race ? race.playerPosition : 1,
        totalRacers: race ? race.racers.length : 1,
        lap: race ? Math.min(race.lap, race.options.laps) : 1,
        totalLaps: race ? race.options.laps : 1,
        timeMs: race ? race.elapsedMs : this.raceTimeMs,
        bestLapMs: race?.bestLapMs,
        playerX: this.dynamics.state.x,
        playerZ: this.dynamics.state.z,
        heading: this.dynamics.state.heading,
        route: race ? race.layout.path.map(([x, z]) => ({ x, z })) : undefined,
        racers: race ? race.racers.map((r) => ({ x: r.x, z: r.z, isPlayer: r.isPlayer })) : undefined,
        mode: this.mode === 'race' ? 'race' : 'freeRoam',
        coins: this.save.data.coins,
        kills: this.save.data.stats.pedestrianKills,
        cameraMode: this.rig.mode,
        timeOfDay: TIME_PRESETS[this.timeId].label,
        fps: this.clock.fps,
      });
    }
  };

  private updateWorld(alpha: number, frameDt: number): void {
    const s = this.dynamics.state;
    // 座舱视角隐藏车外壳（保留内饰），菜单/拍照/其它视角恢复
    const cockpit = this.mode !== 'menu' && this.photo === null && this.rig.mode === 'cockpit';
    this.vehicle.setCockpit(cockpit);
    if (this.cockpitLight) this.cockpitLight.intensity = cockpit ? 9 : 0;
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
      // 车库打开时切展台机位：绕车慢转、贴近车身，露出左侧 3D 车模
      const showcase = this.garage.visible;
      // 展台补光：白天也把车身打亮，夜里沿用时段强度
      const stage = Math.max(TIME_PRESETS[this.timeId].lamp, showcase ? 0.55 : 0);
      if (this.heroLight) this.heroLight.intensity = stage * 62;
      if (this.heroFill) this.heroFill.intensity = stage * 28;
      const radius = showcase ? 10.2 : 12.8;
      const height = showcase ? 2.15 : 3.1;
      const angle = showcase
        ? this.menuAngle + this.elapsed * 0.26
        : this.menuAngle + Math.sin(this.elapsed * 0.22) * 0.12;
      const camX = x + Math.sin(angle) * radius;
      const camZ = z + Math.cos(angle) * radius;
      this.camera.position.set(camX, height, camZ);
      if (showcase) {
        // 面板占右侧：把注视点向右偏移，让车模落在左半屏
        const fx = (x - camX) / radius;
        const fz = (z - camZ) / radius;
        this.camera.lookAt(x - fz * 1.55, 0.74, z + fx * 1.55);
      } else {
        this.camera.lookAt(x, 0.92, z);
      }
      this.camera.fov = showcase ? 38 : 42;
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
      frameDt,
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
    if (this.input.consume('mute')) {
      const muted = !this.save.data.audio.muted;
      this.save.data.audio.muted = muted;
      this.save.save();
      this.audio.setMuted(muted);
      this.hud.toast(muted ? '已静音' : '声音已开启', 'info');
    }
      return;
    }
    if (this.input.consume('pause')) {
      this.setPaused(!this.paused);
      return;
    }
    if (this.input.consume('camera')) this.cycleCamera();
    if (this.input.consume('time')) this.cycleTime();
    if (this.input.consume('weather')) this.toggleRain();
    if (this.input.consume('mute')) {
      const muted = !this.save.data.audio.muted;
      this.save.data.audio.muted = muted;
      this.save.save();
      this.audio.setMuted(muted);
      this.hud.toast(muted ? '已静音' : '声音已开启', 'info');
    }
    if (this.input.consume('reset')) {
      this.dynamics.reset(WORLD.SPAWN_X, WORLD.SPAWN_Z, Math.PI * 0.5);
      this.rig.snap();
      this.hud.toast('车辆已重置', 'info');
    }
    if (this.input.consume('back')) {
      if (this.mode === 'race') {
        this.exitRace();
      } else {
        this.mode = 'menu';
        this.menu?.show();
        this.hud.setVisible(false);
        this.menuAngle = 0.6;
      }
    }
  }

  private startDrive(): void {
    void this.audio.init();
    this.mode = 'drive';
    this.menu?.hide();
    this.hud.setVisible(true);
    this.tasks.setVisible(true);
    this.rig.snap();
    this.hud.toast('WASD 驾驶 · 空格漂移 · C 视角', 'info');
  }

  /** 生涯屏 */
  private openCareer(): void {
    this.checkAchievements();
    this.menu?.hide();
    this.career.show(this.save.data);
  }

  private claimCheckIn(): void {
    if (!checkInReady(this.save.data)) return;
    const next = nextCheckIn(this.save.data);
    this.save.data.daily.checkInDate = new Date().toISOString().slice(0, 10);
    this.save.data.daily.checkInStreak = next.streak;
    this.save.data.coins += next.reward;
    this.save.data.stats.coinsEarned += next.reward;
    this.save.save();
    this.menu?.setCoins(this.save.data.coins);
    this.audio.playClick();
    this.checkAchievements();
    this.career.show(this.save.data);
    this.hud.toast(`签到成功 +◈${next.reward}`, 'good');
  }

  private claimQuest(id: string): void {
    const quest = dailyQuests(this.save.data).find((q) => q.id === id);
    if (!quest || !quest.done || quest.claimed) return;
    const today = new Date().toISOString().slice(0, 10);
    if (this.save.data.daily.date !== today) {
      this.save.data.daily.date = today;
      this.save.data.daily.done = [];
    }
    this.save.data.daily.done.push(id);
    this.save.data.coins += quest.reward;
    this.save.data.stats.coinsEarned += quest.reward;
    this.save.save();
    this.menu?.setCoins(this.save.data.coins);
    this.audio.playClick();
    this.career.show(this.save.data);
    this.hud.toast(`任务完成 +◈${quest.reward}`, 'good');
  }

  /** 成就自动解锁并发放奖励 */
  private checkAchievements(): void {
    for (const item of achievementProgress(this.save.data)) {
      if (!item.unlocked || this.save.data.achievements.includes(item.def.id)) continue;
      this.save.data.achievements.push(item.def.id);
      this.save.data.coins += item.def.reward;
      this.save.data.stats.coinsEarned += item.def.reward;
      this.hud.toast(`成就解锁：${item.def.name} +◈${item.def.reward}`, 'good');
    }
    this.save.save();
    this.menu?.setCoins(this.save.data.coins);
  }

  /** 自适应分辨率：帧率低于 50 降采样、高于 57 回升，范围 0.55~1 */
  private updateAdaptiveScale(frameDt: number): void {
    if (this.mode === 'menu') return;
    this.adaptiveTimer += frameDt;
    if (this.adaptiveTimer < 1) return;
    this.adaptiveTimer = 0;
    const fps = this.clock.fps;
    if (fps <= 0) return;
    let next = this.renderScale;
    if (fps < 50) next = Math.max(0.55, this.renderScale - 0.1);
    else if (fps > 57) next = Math.min(1, this.renderScale + 0.05);
    if (Math.abs(next - this.renderScale) < 1e-3) return;
    this.renderScale = next;
    this.engine.setRenderScale(next);
  }
  /** 里程 / 极速 / 步行统计（每 0.1km 落盘一次） */
  private trackProgress(frameDt: number): void {
    if (this.mode === 'menu' || this.paused) return;
    const s = this.dynamics.state;
    const kmh = Math.abs(s.speed) * 3.6;
    if (kmh > this.save.data.stats.topSpeedKmh) this.save.data.stats.topSpeedKmh = kmh;
    this.save.data.stats.playSeconds += frameDt;
    this.pendingKm += (Math.abs(s.speed) * frameDt) / 1000;
    if (this.pendingKm >= 0.1) {
      const km = this.pendingKm;
      this.pendingKm = 0;
      this.save.data.stats.distanceKm += km;
      const coins = Math.floor(km * 2);
      if (coins > 0) {
        this.save.data.coins += coins;
        this.save.data.stats.coinsEarned += coins;
      }
      this.save.save();
    }
    this.saveTimer += frameDt;
    if (this.saveTimer > 10) {
      this.saveTimer = 0;
      this.save.save();
    }
  }

  /** 打开车库（菜单背景保留，车辆在场景里可继续被环绕展示） */
  private openGarage(): void {
    this.menu?.hide();
    this.garage.show({
      coins: this.save.data.coins,
      owned: this.save.data.car.owned,
      currentId: this.save.data.car.id,
      currentColor: this.save.data.car.color,
    });
  }

  private buyVehicle(id: string, price: number): boolean {
    if (this.save.data.coins < price) {
      this.hud.toast('金币不足', 'warn');
      return false;
    }
    this.save.data.coins -= price;
    if (!this.save.data.car.owned.includes(id)) this.save.data.car.owned.push(id);
    this.save.save();
    this.menu?.setCoins(this.save.data.coins);
    this.audio.playClick();
    return true;
  }

  private equipVehicle(id: string, color: string): void {
    const spec = VEHICLES.find((v) => v.id === id);
    if (!spec) return;
    this.save.data.car.id = id;
    this.save.data.car.color = color;
    this.save.save();
    this.dynamics.setSpec(spec);
    this.vehicle.setPaint(color);
    this.audio.playClick();
  }

  private setPaused(paused: boolean): void {
    if (this.mode === 'menu') return;
    this.paused = paused;
    if (paused) {
      this.pause.show(this.timeId);
      this.pause.setWeather(this.rainOn);
      this.pause.setQuality(this.engine.tier);
      this.pause.setInvertSteer(this.invertSteer);
      this.audio.suspend();
    } else {
      this.pause.hide();
      this.audio.resume();
      this.clock.begin(performance.now());
    }
  }

  private restartMode(): void {
    this.setPaused(false);
    if (this.mode === 'race' && this.lastSetup) {
      this.startRace(this.lastSetup);
    } else {
      this.dynamics.reset(WORLD.SPAWN_X, WORLD.SPAWN_Z, Math.PI * 0.5);
      this.rig.snap();
    }
  }

  private exitToMenu(): void {
    this.setPaused(false);
    this.mode = 'menu';
    this.race = null;
    this.disposeAiRacers();
    this.traffic.setVisible(true);
    this.tasks.setVisible(false);
    this.raceUi.hideCountdown();
    this.raceUi.hideResults();
    this.garage.hide();
    this.menu?.show();
    this.hud.setVisible(false);
    this.dynamics.reset(WORLD.SPAWN_X, WORLD.SPAWN_Z, Math.PI * 0.5);
    this.rig.snap();
  }

  /** 打开竞速设置（不切场景，菜单背景仍可看见城市） */
  private openRaceSetup(presetLayout?: number): void {
    this.raceUi.showSetup(
      (setup) => this.startRace(setup),
      () => this.menu?.show(),
      presetLayout,
    );
  }

  private startRace(setup: RaceSetup): void {
    void this.audio.init();
    this.lastSetup = setup;
    const layout = setup.layout;
    this.mode = 'race';
    this.menu?.hide();
    this.hud.setVisible(true);
    this.raceUi.hideResults();
    this.tasks.setVisible(false);

    const [startX, startZ] = layout.path[0];
    const [nextX, nextZ] = layout.path[1];
    const heading = Math.atan2(nextX - startX, nextZ - startZ);
    this.dynamics.reset(startX, startZ, heading);
    this.rig.snap();
    this.traffic.setVisible(false);

    this.disposeAiRacers();
    this.race = new RaceManager(layout, {
      laps: setup.laps,
      opponents: setup.opponents,
      difficulty: setup.difficulty,
    });
    this.race.onFinish = (result) => this.finishRace(result);
    this.aiRacers = new AiRacers(this.scene, setup.opponents);
    this.race.start(heading);
    this.raceUi.showCountdown(3);
    this.hud.toast(`${layout.name} · ${setup.laps} 圈 · ${setup.opponents + 1} 台车`, 'info');
  }

  private updateRace(frameDt: number): void {
    const race = this.race;
    if (!race) return;
    const s = this.dynamics.state;
    race.update(frameDt, s.x, s.z, s.heading);
    if (race.phase === 'countdown') {
      this.raceUi.showCountdown(race.countdown);
    } else {
      this.raceUi.hideCountdown();
    }
    this.aiRacers?.sync(race.racers.slice(1));
  }

  private finishRace(result: RaceResult): void {
    const reward = [300, 200, 150][result.position - 1] ?? 100;
    const key = `${result.layoutName}:${result.difficulty}`;
    const previous = this.save.data.bestLaps[key] ?? 0;
    const isRecord = result.bestLapMs > 0 && (previous === 0 || result.bestLapMs < previous);

    this.save.data.coins += reward;
    this.save.data.stats.coinsEarned += reward;
    this.save.data.stats.races += 1;
    if (result.position === 1) this.save.data.stats.raceWins += 1;
    if (isRecord) this.save.data.bestLaps[key] = result.bestLapMs;
    this.save.save();
    this.menu?.setCoins(this.save.data.coins);

    this.raceUi.showResults(
      result,
      reward,
      isRecord,
      () => {
        if (this.lastSetup) this.startRace(this.lastSetup);
      },
      () => this.exitRace(),
      () => {
        this.exitRace();
        this.startDrive();
      },
    );
  }

  private exitRace(): void {
    this.mode = 'menu';
    this.race = null;
    this.disposeAiRacers();
    this.traffic.setVisible(true);
    this.tasks.setVisible(false);
    this.raceUi.hideCountdown();
    this.raceUi.hideResults();
    this.menu?.show();
    this.hud.setVisible(false);
    this.dynamics.reset(WORLD.SPAWN_X, WORLD.SPAWN_Z, Math.PI * 0.5);
    this.rig.snap();
  }

  private disposeAiRacers(): void {
    if (!this.aiRacers) return;
    this.scene.remove(this.aiRacers.group);
    this.aiRacers.group.traverse((child) => {
      if (child instanceof THREE.Mesh) child.material.dispose();
    });
    this.aiRacers = null;
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
    // 座舱补光：常驻场景（intensity=0），避免开关灯触发材质重编译
    const cabin = new THREE.PointLight(0xffd9b4, 0, 5.2, 2);
    cabin.position.set(-0.28, 1.25, 0.55);
    this.vehicle.root.add(cabin);
    this.cockpitLight = cabin;

    // 夜间「英雄光」：暖色轮廓光 + 冷色补光，让车身在暗场里仍可读（不投影）
    const hero = new THREE.PointLight(0xffcf9a, 0, 26, 2);
    hero.position.set(-2.6, 4.2, -3.4);
    this.vehicle.root.add(hero);
    this.heroLight = hero;
    const fill = new THREE.PointLight(0xa9c8ff, 0, 20, 2);
    fill.position.set(3.2, 2.4, 2.6);
    this.vehicle.root.add(fill);
    this.heroFill = fill;
  }

  private updateLampLights(dt: number): void {
    const strength = TIME_PRESETS[this.timeId].lamp;
    if (strength <= 0.05) {
      for (const light of this.lampLights) light.visible = false;
      return;
    }
    for (const light of this.lampLights) {
      light.visible = true;
      light.intensity = strength * 220;
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

    // 行人撞击：倒地 4 秒 + 金币
    const hits = this.peds.checkHits(s.x, s.z, radius, this.elapsed);
    if (hits > 0) {
      this.save.data.stats.pedestrianKills += hits;
      this.save.data.coins += hits * 5;
      this.save.data.stats.coinsEarned += hits * 5;
      this.save.save();
      this.rig.addShake(0.25);
    }

    // 与交通车辆的圆-圆推离
    for (const car of this.traffic.colliders()) {
      const dx = s.x - car.x;
      const dz = s.z - car.z;
      const minDist = radius + car.radius;
      const dist2 = dx * dx + dz * dz;
      if (dist2 >= minDist * minDist) continue;
      const dist = Math.sqrt(dist2) || 0.0001;
      const nx = dist2 > 1e-6 ? dx / dist : 1;
      const nz = dist2 > 1e-6 ? dz / dist : 0;
      const push = minDist - dist;
      s.x += nx * push;
      s.z += nz * push;
      const impact = Math.abs(s.speed);
      if (impact > 3) {
        s.speed *= 0.6;
        s.lateral *= 0.5;
        this.rig.addShake(Math.min(0.7, impact / 45));
        bus.emit('vehicle:collide', { intensity: impact, x: s.x, z: s.z });
      }
    }
  }

  resize(): void {
    this.engine.resize(window.innerWidth, window.innerHeight);
    this.reflector?.resize(
      window.innerWidth,
      window.innerHeight,
      this.engine.quality.reflection === 'half' ? 0.5 : 0.4,
    );
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
      weather: { rain: this.rainOn, drops: this.rain?.active ? this.rain.dropCount : 0 },
      fx: { skid: this.fx.skidSegments, smoke: this.fx.smokeAlive },
      cockpit: this.vehicle.cockpitHidden,
      touch: this.touch?.active ?? false,
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
      setRain: (on: boolean) => this.toggleRain(on),
      tasks: () => this.tasks.positions,
      /** 调试：调整座舱眼点并立即切到座舱视角 */
      eye: (x: number, y: number, z: number) => {
        this.rig.cockpitEye.set(x, y, z);
        this.rig.mode = 'cockpit';
        this.rig.snap();
        return this.rig.cockpitEye.toArray();
      },      weather: () => ({ rain: this.rainOn, drops: this.rain?.active ? this.rain.dropCount : 0 }),
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
  const api = (window as unknown as {
    __RE__: { setTime: (id: TimeId) => void; start: () => void; setRain: (on: boolean) => void };
  }).__RE__;
  if (time && (TIME_ORDER as string[]).includes(time)) api.setTime(time as TimeId);
  if (params.get('rain') === '1') api.setRain(true);
  if (params.get('autostart') === '1') api.start();
}

void main();








