import * as THREE from 'three';

export interface BuildingFootprint {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
}

const SIGNS = [
  { text: '城市酒馆', tone: '#ff4d6d' },
  { text: '24H 便利店', tone: '#37e0c8' },
  { text: '拉面 · 面馆', tone: '#ffb545' },
  { text: '电机维修', tone: '#4aa8ff' },
  { text: '环城旅馆', tone: '#b06bff' },
  { text: '冷饮 · 咖啡', tone: '#ff8a2a' },
  { text: '夜行书店', tone: '#5cf28a' },
  { text: '加油站', tone: '#ffd166' },
];

function signTexture(text: string, tone: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 512, 128);
    ctx.fillStyle = 'rgba(8,10,14,0.88)';
    ctx.beginPath();
    ctx.roundRect(4, 4, 504, 120, 10);
    ctx.fill();
    ctx.strokeStyle = tone;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.font = '700 62px "Microsoft YaHei", "PingFang SC", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = tone;
    ctx.shadowBlur = 26;
    ctx.fillStyle = '#fff6ea';
    ctx.fillText(text, 256, 68);
    ctx.shadowBlur = 8;
    ctx.fillStyle = tone;
    ctx.globalAlpha = 0.55;
    ctx.fillText(text, 256, 68);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

interface Placement {
  position: THREE.Vector3;
  yaw: number;
  width: number;
  height: number;
}

/**
 * 临街霓虹招牌：每栋楼在「朝 X 的立面」和「朝 Z 的立面」各挂一块，
 * 保证任意视角都能看到招牌；夜间自发光，白天为暗色板。
 */
export class Signage {
  readonly group = new THREE.Group();
  private readonly materials: THREE.MeshBasicMaterial[] = [];

  constructor(
    private readonly buildings: BuildingFootprint[],
    private readonly blockLength = 150,
  ) {
    this.group.name = 'signage';
    const transform = new THREE.Object3D();
    const buckets: THREE.Matrix4[][] = SIGNS.map(() => []);

    this.buildings.forEach((building, index) => {
      if (building.h < 9) return;
      const placements = this.placeSigns(building, index);
      placements.forEach((placement, k) => {
        transform.position.copy(placement.position);
        transform.rotation.set(0, placement.yaw, 0);
        transform.scale.set(placement.width, placement.height, 1);
        transform.updateMatrix();
        buckets[(index + k * 3) % SIGNS.length].push(transform.matrix.clone());
      });

      // 高楼屋顶广告牌，拉开天际线层次
      if (building.h > 34) {
        transform.position.set(building.x, building.h + 2.6, building.z);
        transform.rotation.set(0, 0.22 + (index % 4) * 0.16, 0);
        transform.scale.set(9.5, 2.7, 1);
        transform.updateMatrix();
        buckets[(index + 5) % SIGNS.length].push(transform.matrix.clone());
      }
    });

    SIGNS.forEach((sign, index) => {
      const material = new THREE.MeshBasicMaterial({
        map: signTexture(sign.text, sign.tone),
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
        color: new THREE.Color(0.24, 0.24, 0.26),
      });
      material.name = `sign-${index}`;
      this.materials.push(material);

      const matrices = buckets[index];
      if (matrices.length === 0) return;
      const geometry = new THREE.PlaneGeometry(1, 1);
      const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
      mesh.name = `signage-${index}`;
      mesh.frustumCulled = false;
      matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
      mesh.instanceMatrix.needsUpdate = true;
      this.group.add(mesh);
    });
  }

  /** 返回最多两块招牌：分别贴在与道路相邻的两个立面上 */
  private placeSigns(b: BuildingFootprint, seed: number): Placement[] {
    const B = this.blockLength;
    const bx = Math.floor(b.x / B) * B;
    const nearX = Math.abs(b.x - bx) < Math.abs(b.x - (bx + B)) ? bx : bx + B;
    const bz = Math.floor(b.z / B) * B;
    const nearZ = Math.abs(b.z - bz) < Math.abs(b.z - (bz + B)) ? bz : bz + B;
    const dirX = Math.sign(nearX - b.x) || 1;
    const dirZ = Math.sign(nearZ - b.z) || 1;

    const baseWidth = 6.4 + ((seed * 37) % 26) / 10;
    const out: Placement[] = [];

    const yX = Math.min(b.h - 2.2, 5.0 + ((seed * 53) % 55) / 10);
    if (yX > 4.4) {
      out.push({
        position: new THREE.Vector3(b.x + dirX * (b.w / 2 + 0.34), yX, b.z),
        yaw: dirX > 0 ? Math.PI / 2 : -Math.PI / 2,
        width: baseWidth,
        height: baseWidth * 0.26,
      });
    }

    const yZ = Math.min(b.h - 2.2, 6.2 + ((seed * 71) % 60) / 10);
    if (yZ > 5.0) {
      out.push({
        position: new THREE.Vector3(b.x, yZ, b.z + dirZ * (b.d / 2 + 0.34)),
        yaw: dirZ > 0 ? 0 : Math.PI,
        width: baseWidth * 0.86,
        height: baseWidth * 0.86 * 0.26,
      });
    }
    return out;
  }

  /** 夜间强度 0..1.2 */
  setNight(value: number): void {
    const level = 0.2 + value * 2.1;
    for (const material of this.materials) {
      material.color.setScalar(level);
    }
  }
}
