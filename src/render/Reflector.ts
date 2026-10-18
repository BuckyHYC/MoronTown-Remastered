import * as THREE from 'three';

const REFLECT_VERTEX = /* glsl */ `
  uniform mat4 uTextureMatrix;
  varying vec4 vReflectUv;
  varying vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vReflectUv = uTextureMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const REFLECT_FRAGMENT = /* glsl */ `
  uniform sampler2D tReflect;
  uniform float uWetness;
  uniform float uTime;
  varying vec4 vReflectUv;
  varying vec3 vWorldPos;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    vec2 uv = vReflectUv.xy / max(vReflectUv.w, 0.0001);
    vec2 ripple = vec2(
      sin(vWorldPos.x * 3.1 + uTime * 1.3) + sin(vWorldPos.z * 2.3 - uTime * 1.1),
      cos(vWorldPos.z * 2.7 + uTime * 1.5) + cos(vWorldPos.x * 1.9 + uTime * 0.9)
    ) * 0.0009;
    vec3 refl = texture2D(tReflect, clamp(uv + ripple, 0.002, 0.998)).rgb;

    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float fresnel = pow(1.0 - clamp(viewDir.y, 0.0, 1.0), 3.0);
    float grain = hash(floor(vWorldPos.xz * 1.7));
    float alpha = uWetness * (0.05 + 0.42 * fresnel) * (0.7 + grain * 0.55);
    gl_FragColor = vec4(refl, clamp(alpha, 0.0, 0.86));
  }
`;

/**
 * 平面反射：把场景按 y=0 镜像重绘到半分辨率 RT，再用屏幕投影 UV 贴回路面。
 * 只作用于路面几何（由 CityWorld 提供），因此草地/屋顶不会被误照亮。
 */
export class PlanarReflector {
  readonly mesh: THREE.Mesh;
  private readonly target: THREE.WebGLRenderTarget;
  private readonly virtualCamera = new THREE.PerspectiveCamera();
  private readonly textureMatrix = new THREE.Matrix4();
  private readonly material: THREE.ShaderMaterial;
  private readonly normal = new THREE.Vector3(0, 1, 0);
  private readonly reflectorPos = new THREE.Vector3();
  private readonly cameraPos = new THREE.Vector3();
  private readonly rotation = new THREE.Matrix4();
  private readonly lookAt = new THREE.Vector3();
  private readonly targetPos = new THREE.Vector3();
  private readonly view = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private wetness = 0;
  enabled = true;

  constructor(geometry: THREE.BufferGeometry, half = 0.5) {
    const width = Math.max(2, Math.floor(window.innerWidth * half));
    const height = Math.max(2, Math.floor(window.innerHeight * half));
    this.target = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType,
      depthBuffer: true,
      stencilBuffer: false,
    });
    this.target.texture.colorSpace = THREE.LinearSRGBColorSpace;

    this.material = new THREE.ShaderMaterial({
      name: 'PlanarReflection',
      uniforms: {
        tReflect: { value: this.target.texture },
        uTextureMatrix: { value: this.textureMatrix },
        uWetness: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: REFLECT_VERTEX,
      fragmentShader: REFLECT_FRAGMENT,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = 'road-reflection';
    this.mesh.position.y = 0.028;
    this.mesh.renderOrder = 1;
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.updateMatrix();
    this.mesh.updateMatrixWorld(true);
  }

  setWetness(value: number): void {
    this.wetness = THREE.MathUtils.clamp(value, 0, 1);
    this.material.uniforms.uWetness.value = this.wetness;
    this.mesh.visible = this.enabled && this.wetness > 0.02;
  }

  resize(width: number, height: number, half = 0.5): void {
    this.target.setSize(Math.max(2, Math.floor(width * half)), Math.max(2, Math.floor(height * half)));
  }

  /** 反射相机的构造与 three 官方 Reflector 一致：镜像位置 + 镜像目标 + 镜像 up */
  update(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, elapsed: number): void {
    this.material.uniforms.uTime.value = elapsed;
    if (!this.mesh.visible) return;

    this.mesh.getWorldPosition(this.reflectorPos);
    camera.getWorldPosition(this.cameraPos);
    this.rotation.extractRotation(this.mesh.matrixWorld);
    this.normal.set(0, 1, 0).applyMatrix4(this.rotation).normalize();

    this.view.subVectors(this.reflectorPos, this.cameraPos);
    if (this.view.dot(this.normal) > 0) return;
    this.view.reflect(this.normal).negate().add(this.reflectorPos);

    this.lookAt.set(0, 0, -1).applyMatrix4(this.rotation).add(this.reflectorPos);
    this.targetPos.subVectors(this.reflectorPos, this.lookAt);
    this.targetPos.reflect(this.normal).negate().add(this.reflectorPos);

    this.virtualCamera.position.copy(this.view);
    this.up.set(0, 1, 0).applyMatrix4(this.rotation).reflect(this.normal);
    this.virtualCamera.up.copy(this.up);
    this.virtualCamera.lookAt(this.targetPos);
    this.virtualCamera.far = camera.far;
    this.virtualCamera.updateMatrixWorld();
    this.virtualCamera.projectionMatrix.copy(camera.projectionMatrix);

    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(this.virtualCamera.projectionMatrix);
    this.textureMatrix.multiply(this.virtualCamera.matrixWorldInverse);
    this.textureMatrix.multiply(this.mesh.matrixWorld);

    this.mesh.visible = false;
    const previousTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, this.virtualCamera);
    renderer.setRenderTarget(previousTarget);
    this.mesh.visible = true;
  }

  dispose(): void {
    this.target.dispose();
    this.material.dispose();
  }
}
