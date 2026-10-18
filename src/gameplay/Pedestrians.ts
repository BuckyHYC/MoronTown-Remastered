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

const COLORS = [0x3b4a63, 0x7a3b3b, 0x4d5d3a, 0x6b5a3e, 0x2f3a44, 0x5a4a6b];

/** 行人：人行道上的循环行走体，被撞后倒地 4 秒再复活 */
export class Pedestrians {
  readonly group = new THREE.Group();
  private readonly parts: THREE.InstancedMesh;
  private readonly peds: Ped[] = [];
  private readonly transform = new THREE.Object3D();
  private readonly span: number;
  private readonly blockLength = WORLD.BLOCK_LENGTH;
  private readonly sidewalkOffset = WORLD.ROAD_WIDTH / 2 + 1.9;
  private hitCount = 0;

  constructor(scene: THREE.Scene, blocks = 4, count = 72, seed = 7717) {
    this.span = blocks * this.blockLength;
    this.group.name = 'pedestrians';

    const body = new THREE.CylinderGeometry(0.22, 0.26, 1.1, 8);
    body.translate(0, 0.8, 0);
    const head = new THREE.SphereGeometry(0.19, 10, 8);
    head.translate(0, 1.52, 0);
    const legs = new THREE.BoxGeometry(0.34, 0.6, 0.22);
    legs.translate(0, 0.3, 0);
    const geometry = mergeGeometries([body, head, legs], false)!;

    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.8,
      metalness: 0.05,
    });
    this.parts = new THREE.InstancedMesh(geometry, material, count);
    this.parts.name = 'pedestrian-parts';
    this.parts.castShadow = true;
    this.parts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.parts);
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
      this.parts.setColorAt(i, new THREE.Color(COLORS[Math.floor(rand() * COLORS.length)]));
    }
    if (this.parts.instanceColor) this.parts.instanceColor.needsUpdate = true;
    this.update(0, 0);
  }

  update(dt: number, now: number): void {
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

      this.transform.position.set(x, down ? -1.2 : 0, z);
      this.transform.rotation.set(down ? Math.PI / 2 : 0, heading, 0);
      this.transform.scale.setScalar(down ? 0.001 : 1);
      this.transform.updateMatrix();
      this.parts.setMatrixAt(i, this.transform.matrix);
    }
    this.parts.instanceMatrix.needsUpdate = true;
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
