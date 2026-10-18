import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { VehicleSpec } from '../core/Config';

export interface WheelRig {
  axle: 'front' | 'rear';
  side: 'L' | 'R';
  /** 转向枢轴（Y 轴，仅前轮使用） */
  steer: THREE.Group;
  /** 滚动枢轴（X 轴） */
  roll: THREE.Group;
}

export interface LightRig {
  head: THREE.MeshStandardMaterial[];
  drl: THREE.MeshStandardMaterial[];
  brake: THREE.MeshStandardMaterial[];
  reverse: THREE.MeshStandardMaterial[];
  turn: THREE.MeshStandardMaterial[];
}

const PAINT_PREFIX = /^Paint\s*\d/i;

/**
 * 外部高模装配：
 * 1) Z-up → Y-up，统一到米制并居中到地面；
 * 2) 把四个车轮（含轮胎/轮辋/刹车盘）重挂到「转向枢轴 → 滚动枢轴」；
 * 3) 车漆/玻璃/灯组材质替换为游戏内 PBR；
 * 4) 输出座舱相机锚点与灯组引用。
 */
export class VehicleModel {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  wheels: WheelRig[] = [];
  paint!: THREE.MeshPhysicalMaterial;
  glassMeshes: THREE.Mesh[] = [];
  lights: LightRig = { head: [], drl: [], brake: [], reverse: [], turn: [] };
  steeringWheel: THREE.Object3D | null = null;
  size = new THREE.Vector3(4.4, 1.2, 1.8);
  wheelRadius = 0.34;
  wheelBase = 2.7;
  frontAxleZ = 1.3;
  rearAxleZ = -1.3;
  seatPosition = new THREE.Vector3(-0.35, 1.05, 0.1);
  loaded = false;

  constructor(readonly spec: VehicleSpec) {
    this.root.name = 'vehicle-root';
    this.body.name = 'vehicle-body';
    this.root.add(this.body);
  }

  async load(url: string, color: string): Promise<void> {
    const gltf = await new GLTFLoader().loadAsync(url);
    const raw = gltf.scene;
    raw.updateMatrixWorld(true);
    // 资产常见两种朝向：Y-up（glTF 规范）与 Z-up（Blender 原始）。
    // 用车顶薄板的法线轴判断：薄轴为 Z 说明是 Z-up，需要转到 Y-up。
    const roof = raw.getObjectByName('BodyRoofPanel') ?? raw.getObjectByName('BodyHood');
    if (roof) {
      const rb = new THREE.Box3().setFromObject(roof).getSize(new THREE.Vector3());
      if (rb.z < rb.y * 0.6 && rb.z < rb.x * 0.6) {
        raw.rotation.x = -Math.PI / 2;
        raw.updateMatrixWorld(true);
      }
    }

    let box = new THREE.Box3().setFromObject(raw);
    const rawLength = box.max.z - box.min.z;
    const scale = rawLength > 0.1 ? this.spec.length / rawLength : 1;
    raw.scale.multiplyScalar(scale);
    raw.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(raw);
    const center = box.getCenter(new THREE.Vector3());
    raw.position.x -= center.x;
    raw.position.z -= center.z;
    raw.position.y -= box.min.y;
    raw.updateMatrixWorld(true);

    this.body.add(raw);
    this.root.updateMatrixWorld(true);

    box = new THREE.Box3().setFromObject(raw);
    this.size.set(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z);

    this.normalizeOrientation(raw);
    this.root.updateMatrixWorld(true);

    this.replaceMaterials(raw, color);
    this.rigWheels(raw);
    this.computeAnchors();
    this.applyShadows();
    this.addContactShadow();
    this.loaded = true;
  }

  /** 让车头朝向 +Z（与动力学 heading=0 的前向一致） */
  private normalizeOrientation(raw: THREE.Object3D): void {
    const head = raw.getObjectByName('BodyHeadlights') ?? raw.getObjectByName('Headlights');
    const tail = raw.getObjectByName('BodyTaillights');
    const probe = (obj: THREE.Object3D | undefined): number => {
      if (!obj) return 0;
      const b = new THREE.Box3().setFromObject(obj);
      return b.getCenter(new THREE.Vector3()).z;
    };
    const headZ = probe(head);
    const tailZ = probe(tail);
    if (head && tail && headZ < tailZ) {
      // 当前车头朝 -Z：整体绕 Y 转 180°
      this.body.rotation.y = Math.PI;
      this.body.updateMatrixWorld(true);
    }
  }

  private replaceMaterials(raw: THREE.Object3D, color: string): void {
    const paint = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(color),
      metalness: 0.42,
      roughness: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.055,
      envMapIntensity: 1.25,
    });
    paint.name = 'car-paint';
    this.paint = paint;

    const glass = new THREE.MeshPhysicalMaterial({
      color: 0x0b1116,
      metalness: 0.35,
      roughness: 0.05,
      transparent: true,
      opacity: 0.82,
      envMapIntensity: 1.5,
      side: THREE.DoubleSide,
      depthWrite: true,
    });
    glass.name = 'car-glass';

    const trim = new THREE.MeshStandardMaterial({
      color: 0x14161a,
      roughness: 0.55,
      metalness: 0.35,
      envMapIntensity: 0.9,
    });

    const lightCache = new Map<string, THREE.MeshStandardMaterial>();

    raw.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      const mapped = materials.map((mat) => {
        const name = mat?.name ?? '';
        if (PAINT_PREFIX.test(name)) return paint;
        if (/^Glass$/i.test(name)) {
          this.glassMeshes.push(child);
          return glass;
        }
        if (/^Headlight$/i.test(name)) return this.lightMaterial('head', 0xfff2d0, 2.6, lightCache);
        if (/^Brakelight$/i.test(name)) return this.lightMaterial('brake', 0xff2a18, 1.2, lightCache);
        if (/^Signallight$/i.test(name)) return this.lightMaterial('turn', 0xffa030, 0, lightCache);
        if (/mirror/i.test(name)) return trim;
        return mat;
      });
      child.material = Array.isArray(child.material) ? mapped : mapped[0];
    });
  }

  private lightMaterial(
    kind: keyof LightRig,
    emissive: number,
    intensity: number,
    cache: Map<string, THREE.MeshStandardMaterial>,
  ): THREE.MeshStandardMaterial {
    const key = `${kind}-${emissive}`;
    let mat = cache.get(key);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({
        color: 0x0d0f12,
        emissive,
        emissiveIntensity: intensity,
        roughness: 0.25,
        metalness: 0.1,
        toneMapped: true,
      });
      cache.set(key, mat);
      this.lights[kind].push(mat);
    }
    return mat;
  }

  /**
   * 车轮装配：把「Wheel*」节点及其轮胎/轮辋重挂到枢轴。
   * 外部资产的几何通常烘在车身坐标系里，因此枢轴放在包围盒中心。
   */
  private rigWheels(raw: THREE.Object3D): void {
    const tireNodes: THREE.Object3D[] = [];
    raw.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      if (mats.some((m) => /tire/i.test(m?.name ?? ''))) tireNodes.push(child);
    });

    const wheelNames: { name: string; axle: 'front' | 'rear'; side: 'L' | 'R' }[] = [
      { name: 'WheelFrontL', axle: 'front', side: 'L' },
      { name: 'WheelFrontR', axle: 'front', side: 'R' },
      { name: 'WheelRearL', axle: 'rear', side: 'L' },
      { name: 'WheelRearR', axle: 'rear', side: 'R' },
    ];

    this.root.updateMatrixWorld(true);
    for (const def of wheelNames) {
      const node = raw.getObjectByName(def.name);
      if (!node) continue;
      const box = new THREE.Box3().setFromObject(node);
      const centerWorld = box.getCenter(new THREE.Vector3());
      const center = this.body.worldToLocal(centerWorld.clone());

      const steer = new THREE.Group();
      steer.name = `steer-${def.name}`;
      steer.position.copy(center);
      this.body.add(steer);
      const roll = new THREE.Group();
      roll.name = `roll-${def.name}`;
      steer.add(roll);
      this.body.updateMatrixWorld(true);

      roll.attach(node);
      // 刹车卡钳固定在转向节上：只跟着打方向，不随轮毂旋转
      const calipers: THREE.Object3D[] = [];
      node.traverse((child) => {
        if (/brake\s*pad|caliper/i.test(child.name)) calipers.push(child);
      });
      for (const caliper of calipers) steer.attach(caliper);
      // 轮胎是独立节点：按包围盒中心就近归入对应车轮
      for (const tire of [...tireNodes]) {
        const tireCenter = new THREE.Box3().setFromObject(tire).getCenter(new THREE.Vector3());
        if (tireCenter.distanceTo(centerWorld) < 0.45) {
          roll.attach(tire);
          tireNodes.splice(tireNodes.indexOf(tire), 1);
        }
      }

      const radius = Math.max(0.2, (box.max.y - box.min.y) / 2);
      this.wheelRadius = radius;
      this.wheels.push({ ...def, steer, roll });
      if (def.axle === 'front') this.frontAxleZ = center.z;
      else this.rearAxleZ = center.z;
    }
    this.wheelBase = Math.abs(this.frontAxleZ - this.rearAxleZ) || this.wheelBase;
  }

  /** 座舱视角是否已隐藏外壳（e2e 断言用） */
  get cockpitHidden(): boolean {
    return this.cockpit;
  }

  /** 座舱视角：把车外壳材质的 visible 关掉（保留内饰子节点），避免相机看到车壳内壁 */
  setCockpit(on: boolean): void {
    if (this.cockpit === on) return;
    this.cockpit = on;
    this.body.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!(mesh instanceof THREE.Mesh)) return;
      if (/^Interior/i.test(mesh.name)) return;
      if (!this.shellMaterials.has(mesh)) this.shellMaterials.set(mesh, mesh.material);
      const original = this.shellMaterials.get(mesh);
      if (on) mesh.material = this.hiddenMaterial;
      else if (original) mesh.material = original;
    });
  }

  private readonly shellMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private readonly hiddenMaterial = new THREE.MeshBasicMaterial({ visible: false });
  private cockpit = false;

  private computeAnchors(): void {
    const box = new THREE.Box3().setFromObject(this.body);
    this.size.set(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z);
    // 座舱眼点：车身左侧（LHD）+ 车顶下 0.28m + 前后轴中间偏后
    this.seatPosition.set(-0.34, box.max.y - 0.34, (this.frontAxleZ + this.rearAxleZ) / 2 + 0.15);
    this.steeringWheel = this.body.getObjectByName('InteriorSteeringWheel01') ?? null;
  }

  /** 车底软阴影：不依赖阴影贴图也能保证接地感 */
  private addContactShadow(): void {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const grad = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
    grad.addColorStop(0, 'rgba(0,0,0,0.72)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0.34)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      opacity: 0.85,
      color: 0x000000,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(this.size.x * 1.5, this.size.z * 1.12), material);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = 0.03;
    plane.renderOrder = 2;
    plane.name = 'contact-shadow';
    this.root.add(plane);
  }

  private applyShadows(): void {
    this.body.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      const isGlass = mats.some((m) => m?.name === 'car-glass');
      child.castShadow = !isGlass;
      child.receiveShadow = true;
    });
  }

  setPaint(color: string): void {
    this.paint.color.set(color);
  }

  /** 车轮滚动 + 前轮转向（视觉） */
  syncWheels(wheelRoll: number, steerAngle: number, _driftPose: number, _steerInput: number): void {
    // 前轮始终跟随实际转角（不再做漂移反打，避免看起来像左右反了）
    const counterSteer = steerAngle;
    // 动力学按 0.34m 半径累计滚动角，按实际轮径换算，避免视觉打滑
    const rollScale = 0.34 / Math.max(0.2, this.wheelRadius);
    for (const wheel of this.wheels) {
      wheel.roll.rotation.x = wheelRoll * rollScale;
      if (wheel.axle === 'front') {
        wheel.steer.rotation.y = counterSteer;
      }
    }
    if (this.steeringWheel) {
      this.steeringWheel.rotation.y = -steerAngle * 2.4;
    }
  }

  setCockpitGlassVisible(visible: boolean): void {
    for (const mesh of this.glassMeshes) mesh.visible = visible;
  }

  /** 灯态：刹车 / 倒车 / 转向 */
  syncLights(brake: boolean, reversing: boolean, turning: number, speed: number): void {
    const brakeBoost = brake ? 3.4 : 0;
    for (const mat of this.lights.brake) {
      mat.emissiveIntensity = 0.9 + brakeBoost + Math.min(0.6, Math.abs(speed) * 0.02);
    }
    for (const mat of this.lights.reverse) {
      mat.emissiveIntensity = reversing ? 2.8 : 0;
    }
    for (const mat of this.lights.turn) {
      mat.emissiveIntensity = turning > 0 ? 2.4 : 0;
    }
  }

  dispose(): void {
    this.root.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose();
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const m of mats) m?.dispose?.();
      }
    });
  }
}
