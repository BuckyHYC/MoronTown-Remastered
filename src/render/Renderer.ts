import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { QUALITY, type QualitySettings, type QualityTier, type TimePreset } from '../core/Config';

/** 径向运动模糊（HDR 空间，按速度驱动） */
const MotionBlurShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uAmount: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uAmount;
    varying vec2 vUv;
    void main() {
      vec2 dir = vUv - 0.5;
      vec3 sum = vec3(0.0);
      float total = 0.0;
      for (int i = 0; i < 10; i++) {
        float t = float(i) / 9.0;
        float w = 1.0 - t * 0.72;
        sum += texture2D(tDiffuse, vUv - dir * uAmount * t).rgb * w;
        total += w;
      }
      gl_FragColor = vec4(sum / total, 1.0);
    }
  `,
};

/** 调色：对比/饱和/暗角/颗粒/色散（显示空间，OutputPass 之后） */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uSaturation: { value: 1 },
    uContrast: { value: 1 },
    uVignette: { value: 0 },
    uGrain: { value: 0 },
    uChroma: { value: 0 },
    uLift: { value: 0 },
    uGain: { value: 1 },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uChroma;
    uniform float uLift;
    uniform float uGain;
    uniform float uTime;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      vec2 off = d * uChroma * (0.35 + r2 * 1.5);
      vec3 c;
      c.r = texture2D(tDiffuse, vUv + off).r;
      c.g = texture2D(tDiffuse, vUv).g;
      c.b = texture2D(tDiffuse, vUv - off).b;

      c = c * uGain + uLift;
      float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(luma), c, uSaturation);
      c = (c - 0.5) * uContrast + 0.5;

      float vig = smoothstep(0.98, 0.28, length(d) * 1.55);
      c *= mix(1.0, vig, uVignette);

      float n = hash(vUv * vec2(1920.0, 1080.0) + fract(uTime) * 91.7);
      c += (n - 0.5) * uGrain;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }
  `,
};

export class RenderEngine {
  readonly renderer: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  quality: QualitySettings;
  private composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private motionPass: ShaderPass | null = null;
  private gradePass: ShaderPass | null = null;
  private outputPass: OutputPass | null = null;
  private aaPass: ShaderPass | SMAAPass | null = null;
  private renderScale = 1;
  private width = 1;
  private height = 1;
  private basePixelRatio = 1;

  constructor(
    container: HTMLElement,
    private readonly scene: THREE.Scene,
    readonly camera: THREE.PerspectiveCamera,
    tier: QualityTier,
  ) {
    this.quality = QUALITY[tier];
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      alpha: false,
    });
    this.canvas = this.renderer.domElement;
    this.canvas.style.display = 'block';
    // 画布始终铺满容器：渲染分辨率由 pixelRatio/renderScale 决定，CSS 负责放大
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    container.appendChild(this.canvas);

    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x0a0e14, 1);
    this.renderer.info.autoReset = false;

    this.resize(window.innerWidth, window.innerHeight);
    this.build();
  }

  private build(): void {
    this.disposeComposer();
    const q = this.quality;
    this.renderer.shadowMap.enabled = q.shadows;
    this.basePixelRatio = Math.min(window.devicePixelRatio || 1, q.pixelRatio);

    const target = new THREE.WebGLRenderTarget(this.width, this.height, {
      type: THREE.HalfFloatType,
      samples: q.samples,
      depthBuffer: true,
      stencilBuffer: false,
    });
    const composer = new EffectComposer(this.renderer, target);
    composer.setSize(this.width, this.height);
    this.composer = composer;

    this.renderPass = new RenderPass(this.scene, this.camera);
    composer.addPass(this.renderPass);

    if (q.bloom) {
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(this.width, this.height), 0.6, 0.7, 0.9);
      composer.addPass(this.bloomPass);
    }
    if (q.motionBlur) {
      this.motionPass = new ShaderPass(MotionBlurShader);
      composer.addPass(this.motionPass);
    }
    this.outputPass = new OutputPass();
    composer.addPass(this.outputPass);
    if (q.grade) {
      this.gradePass = new ShaderPass(GradeShader);
      composer.addPass(this.gradePass);
    }
    if (q.aa === 'smaa') {
      this.aaPass = new SMAAPass();
      composer.addPass(this.aaPass);
    } else if (q.aa === 'fxaa') {
      const fxaa = new ShaderPass(FXAAShader);
      fxaa.material.uniforms.resolution.value.set(1 / this.width, 1 / this.height);
      this.aaPass = fxaa;
      composer.addPass(fxaa);
    }
    this.applyPixelRatio();
  }

  private disposeComposer(): void {
    this.composer?.dispose();
    this.composer = null;
    this.renderPass = null;
    this.bloomPass = null;
    this.motionPass = null;
    this.gradePass = null;
    this.outputPass = null;
    this.aaPass = null;
  }

  setTier(tier: QualityTier): void {
    this.quality = QUALITY[tier];
    this.build();
  }

  setRenderScale(scale: number): void {
    this.renderScale = THREE.MathUtils.clamp(scale, 0.45, 1);
    this.applyPixelRatio();
  }

  private applyPixelRatio(): void {
    const ratio = this.basePixelRatio * this.renderScale;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(this.width, this.height, false);
    if (this.composer) {
      // composer 自身 pixelRatio 固定为 1，直接用像素尺寸缩放，避免与 renderer 双重缩放
      this.composer.setPixelRatio(1);
      this.composer.setSize(Math.max(2, Math.round(this.width * ratio)), Math.max(2, Math.round(this.height * ratio)));
    }
    if (this.aaPass instanceof SMAAPass) this.aaPass.setSize(this.width, this.height);
    if (this.aaPass instanceof ShaderPass) {
      this.aaPass.material.uniforms.resolution.value.set(1 / this.width, 1 / this.height);
    }
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    // 统一走 applyPixelRatio：保持 renderScale 生效，避免 resize 后分辨率跳回全量
    this.applyPixelRatio();
  }

  applyPreset(preset: TimePreset): void {
    this.renderer.toneMappingExposure = preset.exposure;
    if (this.bloomPass) {
      this.bloomPass.threshold = preset.bloom.threshold;
      this.bloomPass.strength = preset.bloom.strength;
      this.bloomPass.radius = preset.bloom.radius;
    }
    if (this.gradePass) {
      const u = this.gradePass.material.uniforms;
      u.uSaturation.value = preset.grade.saturation;
      u.uContrast.value = preset.grade.contrast;
      u.uVignette.value = preset.grade.vignette;
      u.uGrain.value = preset.grade.grain;
      u.uChroma.value = preset.grade.ca;
      u.uLift.value = preset.grade.lift;
      u.uGain.value = preset.grade.gain;
    }
  }

  setSpeed(speedRatio: number, elapsed: number): void {
    if (this.motionPass) {
      this.motionPass.material.uniforms.uAmount.value = THREE.MathUtils.clamp(speedRatio, 0, 1) * 0.028;
    }
    if (this.gradePass) {
      this.gradePass.material.uniforms.uTime.value = elapsed;
    }
  }

  render(): void {
    this.renderer.info.reset();
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  stats(): { drawCalls: number; triangles: number; programs: number; textures: number; pixelRatio: number } {
    const info = this.renderer.info;
    return {
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      programs: info.programs?.length ?? 0,
      textures: info.memory.textures,
      pixelRatio: this.renderer.getPixelRatio(),
    };
  }
}
