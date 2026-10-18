import * as THREE from 'three';

/** 画布纹理工具：所有程序化贴图统一走这里，避免散落的 canvas 代码 */
export function canvasTexture(
  size: number,
  draw: (ctx: CanvasRenderingContext2D, size: number) => void,
  repeat = 1,
  srgb = true,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 8;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return tex;
}

function noise(ctx: CanvasRenderingContext2D, size: number, amount: number, alpha: number): void {
  const img = ctx.getImageData(0, 0, size, size);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    data[i] = Math.max(0, Math.min(255, data[i] + n));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + n));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + n));
    data[i + 3] = Math.min(255, data[i + 3] * alpha + (1 - alpha) * 255);
  }
  ctx.putImageData(img, 0, 0);
}

/** 沥青：深灰底 + 骨料颗粒 + 轻微色斑 */
export function asphaltTextures(): { map: THREE.Texture; roughnessMap: THREE.Texture } {
  const map = canvasTexture(512, (ctx, size) => {
    ctx.fillStyle = '#2b2d31';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 9000; i += 1) {
      const g = 30 + Math.random() * 60;
      ctx.fillStyle = `rgba(${g},${g},${g + 4},${0.35 + Math.random() * 0.4})`;
      const r = 0.6 + Math.random() * 2.2;
      ctx.beginPath();
      ctx.arc(Math.random() * size, Math.random() * size, r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 40; i += 1) {
      ctx.fillStyle = `rgba(20,22,26,${0.05 + Math.random() * 0.08})`;
      ctx.beginPath();
      ctx.ellipse(
        Math.random() * size,
        Math.random() * size,
        20 + Math.random() * 70,
        10 + Math.random() * 40,
        Math.random() * Math.PI,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }, 60);

  const roughnessMap = canvasTexture(256, (ctx, size) => {
    ctx.fillStyle = '#b8b8b8';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 4000; i += 1) {
      const g = 130 + Math.random() * 90;
      ctx.fillStyle = `rgba(${g},${g},${g},0.5)`;
      ctx.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 3, 1 + Math.random() * 3);
    }
  }, 60, false);

  return { map, roughnessMap };
}

/** 人行道：1.2m 铺装砖 + 缝隙 */
export function sidewalkTexture(): THREE.Texture {
  return canvasTexture(512, (ctx, size) => {
    ctx.fillStyle = '#9a9b98';
    ctx.fillRect(0, 0, size, size);
    const cells = 6;
    const step = size / cells;
    for (let y = 0; y < cells; y += 1) {
      for (let x = 0; x < cells; x += 1) {
        const shade = 145 + Math.random() * 30;
        ctx.fillStyle = `rgb(${shade},${shade - 2},${shade - 8})`;
        ctx.fillRect(x * step + 2, y * step + 2, step - 4, step - 4);
      }
    }
    ctx.strokeStyle = 'rgba(60,60,58,0.55)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= cells; i += 1) {
      ctx.beginPath();
      ctx.moveTo(i * step, 0);
      ctx.lineTo(i * step, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * step);
      ctx.lineTo(size, i * step);
      ctx.stroke();
    }
    noise(ctx, size, 26, 0.85);
  }, 1);
}

/** 草地/土地：低饱和噪声 */
export function groundTexture(): THREE.Texture {
  return canvasTexture(512, (ctx, size) => {
    ctx.fillStyle = '#5d6b4c';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 6000; i += 1) {
      const g = 60 + Math.random() * 55;
      ctx.fillStyle = `rgba(${g * 0.85},${g},${g * 0.7},${0.25 + Math.random() * 0.35})`;
      ctx.fillRect(Math.random() * size, Math.random() * size, 2 + Math.random() * 5, 2 + Math.random() * 4);
    }
    noise(ctx, size, 18, 1);
  }, 80);
}

export class MaterialLibrary {
  readonly asphalt: THREE.MeshStandardMaterial;
  readonly sidewalk: THREE.MeshStandardMaterial;
  readonly ground: THREE.MeshStandardMaterial;
  readonly marking: THREE.MeshStandardMaterial;
  readonly markingYellow: THREE.MeshStandardMaterial;
  readonly curb: THREE.MeshStandardMaterial;
  readonly metal: THREE.MeshStandardMaterial;

  constructor() {
    const asphalt = asphaltTextures();
    this.asphalt = new THREE.MeshStandardMaterial({
      map: asphalt.map,
      roughnessMap: asphalt.roughnessMap,
      color: 0xffffff,
      roughness: 0.92,
      metalness: 0.02,
      envMapIntensity: 0.6,
    });
    this.sidewalk = new THREE.MeshStandardMaterial({
      map: sidewalkTexture(),
      roughness: 0.88,
      metalness: 0,
      envMapIntensity: 0.5,
    });
    this.sidewalk.map?.repeat.set(1, 6);
    this.ground = new THREE.MeshStandardMaterial({
      map: groundTexture(),
      roughness: 1,
      metalness: 0,
      envMapIntensity: 0.4,
    });
    this.marking = new THREE.MeshStandardMaterial({
      color: 0xf2f2f0,
      roughness: 0.55,
      metalness: 0,
      emissive: 0x111111,
      envMapIntensity: 0.5,
    });
    this.markingYellow = new THREE.MeshStandardMaterial({
      color: 0xf0c14a,
      roughness: 0.55,
      metalness: 0,
      emissive: 0x141007,
      envMapIntensity: 0.5,
    });
    this.curb = new THREE.MeshStandardMaterial({ color: 0xb9bab6, roughness: 0.8 });
    this.metal = new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.42, metalness: 0.85 });
  }
}
