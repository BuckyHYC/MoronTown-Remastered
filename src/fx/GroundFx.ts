import * as THREE from 'three';

export interface WheelSample {
  x: number;
  y: number;
  z: number;
}

export interface FxFrame {
  /** 漂移姿态 0..1 */
  drift: number;
  /** 纵向速度 m/s */
  speed: number;
  /** 横向速度 m/s */
  lateral: number;
  handbrake: boolean;
  /** 车轮世界坐标（顺序无关，按 axle 过滤后使用） */
  wheels: (WheelSample & { axle: 'front' | 'rear'; side: 'L' | 'R' })[];
}

const SKID_WIDTH = 0.26;
const UP_AXIS = new THREE.Vector3(0, 1, 0);const SKID_LIFE = 9.5;
const SKID_FADE = 3.2;
/** 相邻胎痕点的最小间距，太密会浪费实例 */
const SKID_SPACING = 0.34;

/**
 * 地面层特效：胎痕（实例化贴地四边形）+ 漂移轮胎烟（点精灵）。
 * 两者都在 CPU 侧做环形缓冲，GPU 侧只有 2 个 draw call；low 档 particleBudget=0 时不产生烟。
 */
export class GroundFx {
  readonly group = new THREE.Group();
  private skid: THREE.InstancedMesh;
  private skidFade: THREE.InstancedBufferAttribute;
  private readonly skidAlpha: Float32Array;
  private readonly skidLife: Float32Array;
  private readonly skidPeak: Float32Array;
  private skidCursor = 0;
  private readonly lastPoint = new Map<string, THREE.Vector3>();

  private smoke: THREE.Points | null = null;
  private smokePos!: Float32Array;
  private smokeAlpha!: Float32Array;
  private smokeSize!: Float32Array;
  private smokeVel!: Float32Array;
  private smokeLife!: Float32Array;
  private smokeMax!: Float32Array;
  private smokeCursor = 0;
  private smokeCapacity = 0;
  private emitDebt = 0;
  private readonly attrs: THREE.BufferAttribute[] = [];
  private readonly tmpM = new THREE.Matrix4();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpP = new THREE.Vector3();
  private readonly tmpS = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly budget: number,
  ) {
    const capacity = budget > 0 ? 620 : 260;
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.skidAlpha = new Float32Array(capacity);
    this.skidLife = new Float32Array(capacity);
    this.skidPeak = new Float32Array(capacity);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -6,
      polygonOffsetUnits: -6,
      uniforms: { uColor: { value: new THREE.Color(0x0b0c0f) } },
      vertexShader: /* glsl */ `
        attribute float aFade;
        varying vec2 vUv;
        varying float vFade;
        #include <common>
        void main() {
          vUv = uv;
          vFade = aFade;
          #ifdef USE_INSTANCING
            vec4 wp = instanceMatrix * vec4(position, 1.0);
          #else
            vec4 wp = vec4(position, 1.0);
          #endif
          gl_Position = projectionMatrix * modelViewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying vec2 vUv;
        varying float vFade;
        void main() {
          float edge = smoothstep(0.0, 0.22, vUv.y) * smoothstep(1.0, 0.78, vUv.y);
          float alpha = edge * vFade;
          if (alpha < 0.004) discard;
          gl_FragColor = vec4(uColor, alpha * 0.62);
        }
      `,
    });
    this.skid = new THREE.InstancedMesh(geo, mat, capacity);
    this.skid.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.skidFade = new THREE.InstancedBufferAttribute(this.skidAlpha, 1);
    this.skidFade.setUsage(THREE.DynamicDrawUsage);
    this.skid.geometry.setAttribute('aFade', this.skidFade);
    this.skid.count = 0;
    this.skid.frustumCulled = false;
    this.skid.renderOrder = 2;
    this.skid.name = 'skid-marks';
    this.group.add(this.skid);

    if (this.budget > 0) this.initSmoke(Math.min(280, Math.max(64, Math.round(this.budget / 30))));
  }

  private initSmoke(capacity: number): void {
    this.smokeCapacity = capacity;
    this.smokePos = new Float32Array(capacity * 3);
    this.smokeAlpha = new Float32Array(capacity);
    this.smokeSize = new Float32Array(capacity);
    this.smokeVel = new Float32Array(capacity * 3);
    this.smokeLife = new Float32Array(capacity);
    this.smokeMax = new Float32Array(capacity);
    for (let i = 0; i < capacity; i += 1) this.smokePos[i * 3 + 1] = -50;

    const geo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(this.smokePos, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    const alphaAttr = new THREE.BufferAttribute(this.smokeAlpha, 1);
    alphaAttr.setUsage(THREE.DynamicDrawUsage);
    const sizeAttr = new THREE.BufferAttribute(this.smokeSize, 1);
    sizeAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', posAttr);
    geo.setAttribute('aAlpha', alphaAttr);
    geo.setAttribute('aSize', sizeAttr);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 5000);
    this.attrs.push(posAttr, alphaAttr, sizeAttr);

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uMap: { value: smokeTexture() },
        uColor: { value: new THREE.Color(0xd8dde4) },
        uScale: { value: 260 },
      },
      vertexShader: /* glsl */ `
        attribute float aAlpha;
        attribute float aSize;
        uniform float uScale;
        varying float vAlpha;
        void main() {
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(aSize * uScale / max(1.0, -mv.z), 1.0, 220.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          float a = texture2D(uMap, gl_PointCoord).a * vAlpha;
          if (a < 0.004) discard;
          gl_FragColor = vec4(uColor, a);
        }
      `,
    });
    this.smoke = new THREE.Points(geo, mat);
    this.smoke.frustumCulled = false;
    this.smoke.renderOrder = 1;
    this.smoke.name = 'tire-smoke';
    this.group.add(this.smoke);
  }

  /** 每帧推进：按漂移强度铺胎痕、喷烟，并让旧痕迹淡出 */
  update(dt: number, frame: FxFrame): void {
    const step = Math.min(dt, 0.05);
    const slip = Math.abs(frame.lateral);
    const speed = Math.abs(frame.speed);
    const skidStrength = Math.min(
      1,
      Math.max(0, frame.drift * 0.95 + (frame.handbrake ? 0.35 : 0) + Math.max(0, slip - 2.4) * 0.1) *
        Math.min(1, speed / 6),
    );
    const rear = frame.wheels.filter((w) => w.axle === 'rear');
    if (skidStrength > 0.18 && speed > 3) {
      for (const wheel of rear) this.emitSkid(wheel, skidStrength);
      this.emitSmoke(step, rear, skidStrength, speed);
    } else {
      this.lastPoint.clear();
    }
    this.fadeSkid(step);
    this.stepSmoke(step);
  }

  private emitSkid(wheel: WheelSample & { axle: 'front' | 'rear'; side: 'L' | 'R' }, strength: number): void {
    const key = `${wheel.axle}${wheel.side}`;
    const prev = this.lastPoint.get(key);
    if (!prev) {
      this.lastPoint.set(key, new THREE.Vector3(wheel.x, 0, wheel.z));
      return;
    }
    const dx = wheel.x - prev.x;
    const dz = wheel.z - prev.z;
    const dist = Math.hypot(dx, dz);
    if (dist < SKID_SPACING) return;
    if (dist > 6) {
      prev.set(wheel.x, 0, wheel.z);
      return;
    }
    prev.set(wheel.x, 0, wheel.z);

    const index = this.skidCursor;
    this.skidCursor = (this.skidCursor + 1) % this.skidAlpha.length;
    this.skid.count = Math.min(this.skid.count + 1, this.skidAlpha.length);
    this.tmpP.set(wheel.x - dx * 0.5, 0.035, wheel.z - dz * 0.5);
    this.tmpQ.setFromAxisAngle(UP_AXIS, Math.atan2(dx, dz));
    this.tmpS.set(SKID_WIDTH, 1, dist + 0.03);
    this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS);
    this.skid.setMatrixAt(index, this.tmpM);
    this.skid.instanceMatrix.needsUpdate = true;
    this.skidLife[index] = SKID_LIFE;
    this.skidPeak[index] = 0.35 + strength * 0.5;
    this.skidAlpha[index] = this.skidPeak[index];
    this.skidFade.needsUpdate = true;
  }

  private emitSmoke(
    dt: number,
    wheels: (WheelSample & { axle: 'front' | 'rear'; side: 'L' | 'R' })[],
    strength: number,
    speed: number,
  ): void {
    if (!this.smoke || !this.smokePos) return;
    this.emitDebt += dt * Math.min(90, 18 + speed * 3.2) * strength;
    while (this.emitDebt >= 1) {
      this.emitDebt -= 1;
      const wheel = wheels[Math.floor(Math.random() * wheels.length)];
      if (!wheel) break;
      const i = this.smokeCursor;
      this.smokeCursor = (this.smokeCursor + 1) % this.smokeCapacity;
      const i3 = i * 3;
      this.smokePos[i3] = wheel.x + (Math.random() - 0.5) * 0.32;
      this.smokePos[i3 + 1] = 0.22 + Math.random() * 0.2;
      this.smokePos[i3 + 2] = wheel.z + (Math.random() - 0.5) * 0.32;
      const spread = 0.7 + Math.random() * 1.1;
      this.smokeVel[i3] = (Math.random() - 0.5) * spread;
      this.smokeVel[i3 + 1] = 0.55 + Math.random() * 0.75;
      this.smokeVel[i3 + 2] = (Math.random() - 0.5) * spread;
      const life = 1.1 + Math.random() * 0.8;
      this.smokeLife[i] = life;
      this.smokeMax[i] = life;
      this.smokeSize[i] = 0.3 + Math.random() * 0.28;
      this.smokeAlpha[i] = 0.24;
    }
  }

  private fadeSkid(dt: number): void {
    const count = this.skid.count;
    if (count === 0) return;
    let dirty = false;
    for (let i = 0; i < count; i += 1) {
      if (this.skidLife[i] <= 0) continue;
      this.skidLife[i] -= dt;
      const life = this.skidLife[i];
      const fade = life > SKID_FADE ? 1 : Math.max(0, life / SKID_FADE);
      const next = fade * this.skidPeak[i];
      if (next !== this.skidAlpha[i]) {
        this.skidAlpha[i] = next;
        dirty = true;
      }
    }
    if (dirty) this.skidFade.needsUpdate = true;
  }

  private stepSmoke(dt: number): void {
    if (!this.smoke) return;
    let dirty = false;
    for (let i = 0; i < this.smokeCapacity; i += 1) {
      if (this.smokeLife[i] <= 0) continue;
      this.smokeLife[i] -= dt;
      const t = Math.max(0, this.smokeLife[i] / this.smokeMax[i]);
      const i3 = i * 3;
      this.smokePos[i3] += this.smokeVel[i3] * dt;
      this.smokePos[i3 + 1] += this.smokeVel[i3 + 1] * dt;
      this.smokePos[i3 + 2] += this.smokeVel[i3 + 2] * dt;
      this.smokeVel[i3] *= 1 - dt * 1.4;
      this.smokeVel[i3 + 2] *= 1 - dt * 1.4;
      this.smokeVel[i3 + 1] += dt * 0.5;
      this.smokeSize[i] += dt * 1.7;
      this.smokeAlpha[i] = t * t * 0.26;
      if (this.smokeLife[i] <= 0) {
        this.smokeAlpha[i] = 0;
        this.smokePos[i3 + 1] = -50;
      }
      dirty = true;
    }
    if (dirty) for (const attr of this.attrs) attr.needsUpdate = true;
  }

  /** 已铺下的胎痕段数（e2e 判定漂移是否留下痕迹） */
  get skidSegments(): number {
    return this.skid.count;
  }

  /** 存活烟雾粒子数 */
  get smokeAlive(): number {
    if (!this.smoke) return 0;
    let alive = 0;
    for (let i = 0; i < this.smokeCapacity; i += 1) if (this.smokeLife[i] > 0) alive += 1;
    return alive;
  }

  dispose(): void {    this.scene.remove(this.group);
    this.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
  }
}

let cachedSmoke: THREE.CanvasTexture | null = null;

/** 柔边烟团贴图（径向渐变 + 少量噪声），只生成一次 */
export function smokeTexture(): THREE.CanvasTexture {
  if (cachedSmoke) return cachedSmoke;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.75, 'rgba(255,255,255,0.18)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 34;
    img.data[i + 3] = Math.max(0, Math.min(255, img.data[i + 3] + n));
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  cachedSmoke = tex;
  return tex;
}
