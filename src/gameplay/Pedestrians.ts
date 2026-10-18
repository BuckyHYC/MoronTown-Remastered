import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WORLD } from '../core/Config';

interface Ped {
  axis: 'x' | 'z';
  line: number;
  side: 1 | -1;
  t: number;
  dir: 1 | -1;
  speed: number;
  downUntil: number;
}

const COLORS = [0x3f5d8a, 0x8c4444, 0x4f6b45, 0x8a6b45, 0x38424f, 0x6a4f7a, 0xb0563f, 0x7f8892];
const SKIN = 0xd8a37a;
const PANTS = 0x3a4150;
const SHOE = 0x121419;
const HAIR = 0x241c16;

/** 给几何体写入顶点色，便于把皮肤/裤子/鞋并进同一个 InstancedMesh */
function tint(geo: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const color = new THREE.Color(hex);
  const count = geo.attributes.position.count;
  const data = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    data[i * 3] = color.r;
    data[i * 3 + 1] = color.g;
    data[i * 3 + 2] = color.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(data, 3));
  return geo;
}

/** 行人：人行道上的循环行走体，被撞后倒地 4 秒再复活 */
export class Pedestrians {
  readonly group = new THREE.Group();
  /** 衣服（实例色可染）+ 皮肤/裤腿/鞋（顶点色固定）两套实例网格 */
  private readonly shirt: THREE.InstancedMesh;
  private readonly skin: THREE.InstancedMesh;
  private readonly hair: THREE.InstancedMesh;
  private readonly peds: Ped[] = [];
  private readonly transform = new THREE.Object3D();
  private readonly span: number;
  private readonly blockLength = WORLD.BLOCK_LENGTH;
  private readonly sidewalkOffset = WORLD.ROAD_WIDTH / 2 + 1.9;
  private hitCount = 0;
  private clock = 0;

  constructor(scene: THREE.Scene, blocks = 4, count = 72, seed = 7717) {
    this.span = blocks * this.blockLength;
    this.group.name = 'pedestrians';

    // —— 衣服：肩宽腰窄的躯干 + 胸廓 + 两条手臂 ——
    const torso = new THREE.CylinderGeometry(0.185, 0.15, 0.52, 10);
    torso.scale(1, 1, 0.66);
    torso.translate(0, 1.14, 0);
    const chest = new THREE.SphereGeometry(0.16, 10, 8);
    chest.scale(1.12, 0.52, 0.78);
    chest.translate(0, 1.33, 0);
    const armGeo = new THREE.CapsuleGeometry(0.05, 0.46, 2, 6);
    const armL = armGeo.clone();
    armL.rotateZ(0.1);
    armL.translate(-0.205, 1.11, 0);
    const armR = armGeo.clone();
    armR.rotateZ(-0.1);
    armR.translate(0.205, 1.11, 0);
    const shirtGeo = mergeGeometries([torso, chest, armL, armR], false)!;

    // —— 皮肤/裤子/鞋：头 + 手 + 髋 + 腿 + 鞋 ——
    const head = new THREE.SphereGeometry(0.105, 12, 10);
    head.scale(1, 1.18, 1.02);
    head.translate(0, 1.63, 0);
    const hair = new THREE.SphereGeometry(0.111, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.52);
    hair.scale(1, 1.04, 1.04);
    hair.translate(0, 1.655, -0.004);
    const neck = new THREE.CylinderGeometry(0.05, 0.058, 0.1, 8);
    neck.translate(0, 1.51, 0);
    const handL = new THREE.SphereGeometry(0.046, 8, 6);
    handL.translate(-0.212, 0.88, 0);
    const handR = handL.clone();
    handR.translate(0.424, 0, 0);
    const hips = new THREE.BoxGeometry(0.24, 0.15, 0.16);
    hips.translate(0, 0.9, 0);
    const legGeo = new THREE.CapsuleGeometry(0.062, 0.64, 2, 8);
    const legL = legGeo.clone();
    legL.translate(-0.095, 0.43, 0);
    const legR = legGeo.clone();
    legR.translate(0.095, 0.43, 0);
    const shoe = new THREE.BoxGeometry(0.095, 0.07, 0.21);
    shoe.translate(0, 0.035, 0.03);
    const shoeL = shoe.clone();
    shoeL.translate(-0.095, 0, 0);
    const shoeR = shoe.clone();
    shoeR.translate(0.19, 0, 0);
    const skinGeo = mergeGeometries(
      [
        tint(head, SKIN),
        tint(neck, SKIN),
        tint(handL, SKIN),
        tint(handR, SKIN),
        tint(hips, PANTS),
        tint(legL, PANTS),
        tint(legR, PANTS),
        tint(shoeL, SHOE),
        tint(shoeR, SHOE),
      ],
      false,
    )!;
    const hairGeo = mergeGeometries([tint(hair, HAIR)], false)!;

    const shirtMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0.02 });
    const skinMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.02 });
    this.shirt = new THREE.InstancedMesh(shirtGeo, shirtMat, count);
    this.shirt.name = 'pedestrian-shirt';
    this.skin = new THREE.InstancedMesh(skinGeo, skinMat, count);
    this.skin.name = 'pedestrian-skin';
    const hairMesh = new THREE.InstancedMesh(hairGeo, skinMat, count);
    hairMesh.name = 'pedestrian-hair';
    for (const mesh of [this.shirt, this.skin, hairMesh]) {
      mesh.castShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(mesh);
    }
    this.hair = hairMesh;
    scene.add(this.group);

    let state = seed >>> 0;
    const rand = (): number => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };

    for (let i = 0; i < count; i += 1) {
      this.peds.push({
        axis: rand() < 0.5 ? 'x' : 'z',
        line: Math.floor(rand() * (blocks + 1)),
        side: rand() < 0.5 ? 1 : -1,
        t: rand() * this.span,
        dir: rand() < 0.5 ? 1 : -1,
        speed: 0.9 + rand() * 0.7,
        downUntil: 0,
      });
      this.shirt.setColorAt(i, new THREE.Color(COLORS[Math.floor(rand() * COLORS.length)]));
    }
    if (this.shirt.instanceColor) this.shirt.instanceColor.needsUpdate = true;
    this.update(0, 0);
  }

  update(dt: number, now: number): void {
    this.clock += dt;
    for (let i = 0; i < this.peds.length; i += 1) {
      const ped = this.peds[i];
      const down = ped.downUntil > now;
      if (!down) {
        ped.t += ped.dir * ped.speed * dt;
        if (ped.t > this.span) ped.t -= this.span;
        if (ped.t < 0) ped.t += this.span;
      }
      const lateral = ped.line * this.blockLength + ped.side * this.sidewalkOffset;
      const x = ped.axis === 'x' ? ped.t : lateral;
      const z = ped.axis === 'x' ? lateral : ped.t;
      const heading = ped.axis === 'x' ? (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : ped.dir > 0 ? 0 : Math.PI;

      // 走路：上下轻微起伏 + 左右摆动，避免像立在地上的塑料人
      const phase = this.clock * ped.speed * 5.4 + i * 1.7;
      const bob = down ? 0 : Math.abs(Math.sin(phase)) * 0.035;
      const sway = down ? 0 : Math.sin(phase) * 0.045;

      this.transform.position.set(x, down ? -1.2 : bob, z);
      this.transform.rotation.set(down ? Math.PI / 2 : 0, heading, sway);
      this.transform.scale.setScalar(down ? 0.001 : 1);
      this.transform.updateMatrix();
      this.shirt.setMatrixAt(i, this.transform.matrix);
      this.skin.setMatrixAt(i, this.transform.matrix);
      this.hair.setMatrixAt(i, this.transform.matrix);
    }
    this.shirt.instanceMatrix.needsUpdate = true;
    this.skin.instanceMatrix.needsUpdate = true;
    this.hair.instanceMatrix.needsUpdate = true;
  }

  position(i: number): { x: number; z: number } | null {
    const ped = this.peds[i];
    if (!ped) return null;
    const lateral = ped.line * this.blockLength + ped.side * this.sidewalkOffset;
    return ped.axis === 'x' ? { x: ped.t, z: lateral } : { x: lateral, z: ped.t };
  }

  /** 玩家撞击检测：返回本次撞倒人数 */
  checkHits(x: number, z: number, radius: number, now: number): number {
    let hits = 0;
    for (const ped of this.peds) {
      if (ped.downUntil > now) continue;
      const lateral = ped.line * this.blockLength + ped.side * this.sidewalkOffset;
      const px = ped.axis === 'x' ? ped.t : lateral;
      const pz = ped.axis === 'x' ? lateral : ped.t;
      if ((px - x) ** 2 + (pz - z) ** 2 < (radius + 0.4) ** 2) {
        ped.downUntil = now + 4;
        hits += 1;
      }
    }
    this.hitCount += hits;
    return hits;
  }

  get totalHits(): number {
    return this.hitCount;
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }
}
