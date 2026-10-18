import * as THREE from 'three';

/**
 * 雨幕：GPU 侧循环下落（顶点着色器用 mod 做时间回绕），CPU 每帧只更新 3 个 uniform。
 * 雨场以相机为中心平铺，因此不需要重建几何；低配档（particleBudget=0）不创建。
 */
export class RainSystem {
  readonly group = new THREE.Group();
  private readonly material: THREE.ShaderMaterial;
  private readonly geometry: THREE.BufferGeometry;
  private readonly count: number;
  private intensity = 0;
  private target = 0;
  private time = 0;

  constructor(count = 7000) {
    this.count = count;
    this.geometry = buildGeometry(count);
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uCenter: { value: new THREE.Vector3() },
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uColor: { value: new THREE.Color(0xc8dcf2) },
        uBox: { value: new THREE.Vector3(70, 62, 70) },
      },
      vertexShader: /* glsl */ `
        uniform vec3 uCenter;
        uniform vec3 uBox;
        uniform float uTime;
        attribute vec3 aSeed;
        attribute float aSpeed;
        attribute float aLen;
        attribute float aTip;
        varying float vFade;
        void main() {
          // 以相机为中心环绕平铺：mod 把雨滴绕回可见盒内
          vec2 rel = mod(aSeed.xz - uCenter.xz + uBox.xz * 0.5, uBox.xz) - uBox.xz * 0.5;
          float y = mod(aSeed.y - uTime * aSpeed, uBox.y);
          vec3 wp = vec3(uCenter.x + rel.x, uCenter.y - 16.0 + y, uCenter.z + rel.y);
          wp += vec3(0.18, -1.0, 0.08) * (aTip * aLen);
          vec4 mv = viewMatrix * vec4(wp, 1.0);
          float dist = -mv.z;
          vFade = smoothstep(1.0, 6.0, dist) * (1.0 - smoothstep(uBox.y * 0.62, uBox.y, y));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uIntensity;
        varying float vFade;
        void main() {
          float alpha = uIntensity * vFade * 0.34;
          if (alpha < 0.004) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
    });
    const mesh = new THREE.LineSegments(this.geometry, this.material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    mesh.name = 'rain';
    this.group.add(mesh);
    this.group.visible = false;
  }

  get active(): boolean {
    return this.group.visible;
  }

  /** 开关雨：intensity 会平滑过渡到目标值 */
  setEnabled(on: boolean): void {
    this.target = on ? 1 : 0;
    if (on) this.group.visible = true;
  }

  update(camera: THREE.PerspectiveCamera, dt: number, qualityScale = 1): void {
    if (!this.group.visible) return;
    this.time += dt;
    const goal = this.target * qualityScale;
    this.intensity += (goal - this.intensity) * Math.min(1, dt * 1.6);
    if (this.target === 0 && this.intensity < 0.01) {
      this.group.visible = false;
      this.intensity = 0;
      return;
    }
    this.material.uniforms.uIntensity.value = this.intensity;
    this.material.uniforms.uTime.value = this.time;
    (this.material.uniforms.uCenter.value as THREE.Vector3).copy(camera.position);
  }

  /** 传送/重置后立即对齐雨场，避免看到雨滴瞬移 */
  snap(camera: THREE.PerspectiveCamera): void {
    (this.material.uniforms.uCenter.value as THREE.Vector3).copy(camera.position);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }

  get dropCount(): number {
    return this.count;
  }
}

function buildGeometry(count: number): THREE.BufferGeometry {
  const seeds = new Float32Array(count * 2 * 3);
  const speeds = new Float32Array(count * 2);
  const lens = new Float32Array(count * 2);
  const tips = new Float32Array(count * 2);
  const positions = new Float32Array(count * 2 * 3);
  for (let i = 0; i < count; i += 1) {
    const sx = Math.random() * 70;
    const sy = Math.random() * 62;
    const sz = Math.random() * 70;
    const speed = 26 + Math.random() * 22;
    const len = 0.7 + Math.random() * 1.5;
    for (let v = 0; v < 2; v += 1) {
      const o = (i * 2 + v) * 3;
      seeds[o] = sx;
      seeds[o + 1] = sy;
      seeds[o + 2] = sz;
      speeds[i * 2 + v] = speed;
      lens[i * 2 + v] = len;
      tips[i * 2 + v] = v;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
  geo.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
  geo.setAttribute('aLen', new THREE.BufferAttribute(lens, 1));
  geo.setAttribute('aTip', new THREE.BufferAttribute(tips, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  return geo;
}
