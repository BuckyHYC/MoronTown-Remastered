import * as THREE from 'three';
import { TIME_PRESETS, type TimeId, type TimePreset } from '../core/Config';

/** 太阳/月亮方向（仰角、方位角 → 单位向量） */
export function sunDirection(
  elevationDeg: number,
  azimuthDeg: number,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  const phi = THREE.MathUtils.degToRad(90 - elevationDeg);
  const theta = THREE.MathUtils.degToRad(azimuthDeg);
  return out.setFromSphericalCoords(1, phi, theta);
}

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vDir = normalize(wp.xyz - cameraPosition);
    gl_Position = projectionMatrix * viewMatrix * wp;
    gl_Position.z = gl_Position.w;
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uMid;
  uniform vec3 uHorizon;
  uniform vec3 uHazeColor;
  uniform vec3 uGround;
  uniform vec3 uCloud;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform float uSunGlow;
  uniform float uSunDisc;
  uniform float uHaze;
  uniform float uClouds;
  uniform float uStars;
  uniform float uTime;
  varying vec3 vDir;

  float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }

  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash13(i);
    float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
    return mix(
      mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
      mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
      f.z
    );
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.55;
    for (int i = 0; i < 4; i++) {
      value += amplitude * noise3(p);
      p *= 2.03;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec3 dir = normalize(vDir);
    float h = dir.y;
    vec3 col;

    if (h >= 0.0) {
      float t1 = smoothstep(0.0, 0.22, h);
      float t2 = smoothstep(0.16, 0.85, h);
      col = mix(uHorizon, uMid, t1);
      col = mix(col, uZenith, t2);
      col = mix(col, uHazeColor, (1.0 - smoothstep(0.0, 0.1, h)) * uHaze);
    } else {
      col = mix(uHorizon, uGround, smoothstep(0.0, -0.32, h));
    }

    if (uClouds > 0.001) {
      vec3 p = dir * 2.6 + vec3(uTime * 0.003, 0.0, uTime * 0.0012);
      float n = fbm(p * 2.4);
      float band = smoothstep(0.02, 0.3, h) * (1.0 - smoothstep(0.5, 0.95, h));
      float mask = smoothstep(0.52, 0.86, n) * band * uClouds;
      col = mix(col, uCloud, mask * 0.6);
    }

    vec3 sunDir = normalize(uSunDir);
    float sd = max(dot(dir, sunDir), 0.0);
    float disc = smoothstep(1.0 - uSunDisc, 1.0, sd);
    float glow = pow(sd, 18.0) * uSunGlow + pow(sd, 4.0) * uSunGlow * 0.18;
    col += uSunColor * (disc * 6.5 + glow);

    if (uStars > 0.001) {
      vec3 q = floor(dir * 520.0);
      float s = hash13(q);
      float star = smoothstep(0.9975, 1.0, s) * smoothstep(-0.03, 0.22, h);
      col += vec3(0.72, 0.8, 1.0) * star * uStars * 2.4;
    }

    gl_FragColor = vec4(col, 1.0);
  }
`;

/**
 * 程序化天空：渐变 + 太阳 + 云 + 星空，按预设切换并按需生成 PMREM 环境探针。
 * 不依赖 HDR 资源，昼夜参数完全由 Config 驱动。
 */
export class SkySystem {
  readonly dome: THREE.Mesh;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  current: TimePreset = TIME_PRESETS.day;
  private readonly material: THREE.ShaderMaterial;
  private readonly envMaterial: THREE.ShaderMaterial;
  private readonly envScene = new THREE.Scene();
  private readonly pmrem: THREE.PMREMGenerator;
  private readonly envCache = new Map<TimeId, THREE.Texture>();
  private readonly sunDir = new THREE.Vector3();
  private shadowDistance = 130;

  constructor(renderer: THREE.WebGLRenderer, private readonly scene: THREE.Scene) {
    this.material = this.createMaterial();
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), this.material);
    this.dome.scale.setScalar(9000);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -1000;
    scene.add(this.dome);

    this.envMaterial = this.createMaterial();
    const envDome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), this.envMaterial);
    envDome.scale.setScalar(1000);
    this.envScene.add(envDome);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 700;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x333333, 0.6);
    scene.add(this.hemi);

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.pmrem.compileEquirectangularShader();
  }

  private createMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      name: 'SkyDome',
      uniforms: {
        uZenith: { value: new THREE.Color() },
        uMid: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uHazeColor: { value: new THREE.Color() },
        uGround: { value: new THREE.Color() },
        uCloud: { value: new THREE.Color() },
        uSunColor: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunGlow: { value: 1 },
        uSunDisc: { value: 0.0015 },
        uHaze: { value: 0.3 },
        uClouds: { value: 0.5 },
        uStars: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      toneMapped: true,
    });
  }

  setShadowDistance(distance: number): void {
    this.shadowDistance = Math.max(20, distance);
    const cam = this.sun.shadow.camera;
    cam.left = -this.shadowDistance;
    cam.right = this.shadowDistance;
    cam.top = this.shadowDistance;
    cam.bottom = -this.shadowDistance;
    cam.updateProjectionMatrix();
  }

  setPreset(id: TimeId): void {
    const preset = TIME_PRESETS[id];
    this.current = preset;
    this.applyUniforms(this.material, preset);
    this.applyUniforms(this.envMaterial, preset);

    sunDirection(preset.sunElevationDeg, preset.sunAzimuthDeg, this.sunDir);
    this.sun.color.setHex(preset.sunColor);
    this.sun.intensity = preset.sunIntensity;
    this.sun.castShadow = preset.sunIntensity > 0.2;
    this.hemi.color.setHex(preset.hemiSky);
    this.hemi.groundColor.setHex(preset.hemiGround);
    this.hemi.intensity = preset.hemiIntensity;

    this.scene.fog = new THREE.FogExp2(preset.fogColor, preset.fogDensity);
    this.scene.environmentIntensity = preset.envIntensity;
    this.scene.environment = this.environmentFor(id);
  }

  private environmentFor(id: TimeId): THREE.Texture {
    const cached = this.envCache.get(id);
    if (cached) return cached;
    const target = this.pmrem.fromScene(this.envScene, 0, 0.1, 5000);
    this.envCache.set(id, target.texture);
    return target.texture;
  }

  private applyUniforms(material: THREE.ShaderMaterial, preset: TimePreset): void {
    const u = material.uniforms;
    (u.uZenith.value as THREE.Color).setHex(preset.skyColors.zenith);
    (u.uMid.value as THREE.Color).setHex(preset.skyColors.mid);
    (u.uHorizon.value as THREE.Color).setHex(preset.skyColors.horizon);
    (u.uHazeColor.value as THREE.Color).setHex(preset.skyColors.haze);
    (u.uGround.value as THREE.Color).setHex(preset.skyColors.ground);
    (u.uCloud.value as THREE.Color).setHex(preset.skyColors.cloud);
    (u.uSunColor.value as THREE.Color).setHex(preset.skyColors.sun);
    (u.uSunDir.value as THREE.Vector3).copy(
      sunDirection(preset.sunElevationDeg, preset.sunAzimuthDeg),
    );
    u.uSunGlow.value = preset.sunGlow;
    u.uSunDisc.value = preset.sunDisc;
    u.uHaze.value = preset.haze;
    u.uClouds.value = preset.cloudCover;
    u.uStars.value = preset.stars;
  }

  update(cameraPosition: THREE.Vector3, elapsed: number): void {
    this.dome.position.copy(cameraPosition);
    this.material.uniforms.uTime.value = elapsed;
    const dir = sunDirection(this.current.sunElevationDeg, this.current.sunAzimuthDeg, this.sunDir);
    this.sun.position.copy(cameraPosition).addScaledVector(dir, 300);
    this.sun.target.position.copy(cameraPosition);
    this.sun.target.updateMatrixWorld();
  }

  dispose(): void {
    this.pmrem.dispose();
    for (const tex of this.envCache.values()) tex.dispose();
    this.envCache.clear();
    this.material.dispose();
    this.envMaterial.dispose();
  }
}
