import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WORLD } from '../core/Config';

interface TrafficCar {
  axis: 'x' | 'z';
  line: number;
  offset: number;
  dir: 1 | -1;
  t: number;
  speed: number;
  x: number;
  z: number;
  heading: number;
}

const COLORS = [0xd8d8d8, 0x2a2f36, 0x9aa3ad, 0x8c2f2f, 0x2f4f7a, 0xc9b48a, 0x3f6b4a, 0xb0b6bd];

/** 用侧视轮廓挤出车身：比堆盒子更像车，且仍是一个几何体（1 次 draw） */
function extrudeProfile(points: [number, number][], width: number, bevel = 0.045): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  points.forEach(([z, y], index) => {
    if (index === 0) shape.moveTo(z, y);
    else shape.lineTo(z, y);
  });
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.1, width - bevel * 2),
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 1,
    curveSegments: 2,
    steps: 1,
  });
  // 轮廓在 (z=车长, y=高) 平面，挤出方向换成 X（车宽）
  geo.rotateY(-Math.PI / 2);
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  geo.translate(-(bb.min.x + bb.max.x) / 2, 0, 0);
  geo.computeVertexNormals();
  return geo;
}

/** 交通车：车身（挤出轮廓）+ 座舱玻璃（第二层）+ 车轮 */
export function carBodies(): THREE.BufferGeometry {
  return extrudeProfile(
    [
      [2.14, 0.34],
      [2.12, 0.64],
      [1.94, 0.94],
      [1.2, 1.02],
      [0.56, 1.46],
      [-0.66, 1.5],
      [-1.52, 1.06],
      [-2.04, 0.99],
      [-2.14, 0.62],
      [-2.02, 0.34],
    ],
    1.8,
  );
}

/** 座舱玻璃：单独一层深色，套在车身上方 */
export function carGlass(): THREE.BufferGeometry {
  return extrudeProfile(
    [
      [1.18, 1.0],
      [0.56, 1.43],
      [-0.62, 1.47],
      [-1.32, 1.03],
      [1.18, 1.0],
    ],
    1.66,
    0.03,
  );
}

export function carWheels(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const wheel = (x: number, z: number): THREE.BufferGeometry => {
    const g = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10);
    g.rotateZ(Math.PI / 2);
    g.translate(x, 0.34, z);
    return g;
  };
  for (const x of [-0.82, 0.82]) {
    for (const z of [-1.4, 1.4]) parts.push(wheel(x, z));
  }
  return mergeGeometries(parts, false)!;
}

/**
 * 交通流：每条道路 4 条车道，车辆沿轴向匀速行驶，循环回绕；
 * 全部用两个 InstancedMesh 绘制（车身 + 车轮），与车辆数量无关。
 */
export class Traffic {
  readonly group = new THREE.Group();
  private readonly cars: TrafficCar[] = [];
  private readonly cache: { x: number; z: number; radius: number }[] = [];
  private readonly bodyMesh: THREE.InstancedMesh;
  private readonly glassMesh: THREE.InstancedMesh;
  private readonly wheelMesh: THREE.InstancedMesh;
  private readonly transform = new THREE.Object3D();
  private readonly span: number;
  private readonly blocks: number;
  private readonly blockLength = WORLD.BLOCK_LENGTH;

  constructor(
    scene: THREE.Scene,
    blocks = 4,
    count = 48,
    seed = 20261018,
  ) {
    this.blocks = blocks;
    this.span = blocks * this.blockLength;
    this.group.name = 'traffic';

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.45,
      metalness: 0.35,
      envMapIntensity: 1,
    });
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.9 });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x11171d,
      roughness: 0.12,
      metalness: 0.55,
      envMapIntensity: 1.3,
      transparent: true,
      opacity: 0.88,
    });
    this.bodyMesh = new THREE.InstancedMesh(carBodies(), bodyMat, count);
    this.glassMesh = new THREE.InstancedMesh(carGlass(), glassMat, count);
    this.wheelMesh = new THREE.InstancedMesh(carWheels(), wheelMat, count);
    this.bodyMesh.castShadow = true;
    this.wheelMesh.castShadow = false;
    this.bodyMesh.name = 'traffic-bodies';
    this.glassMesh.name = 'traffic-glass';
    this.wheelMesh.name = 'traffic-wheels';
    this.bodyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.glassMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.wheelMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.bodyMesh, this.glassMesh, this.wheelMesh);
    scene.add(this.group);

    let state = seed >>> 0;
    const rand = (): number => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    const offsets = [-6, -2, 2, 6];

    for (let i = 0; i < count; i += 1) {
      const axis: 'x' | 'z' = rand() < 0.5 ? 'x' : 'z';
      const line = Math.floor(rand() * (this.blocks + 1));
      const offset = offsets[Math.floor(rand() * offsets.length)];
      const dir: 1 | -1 = (offset < 0 ? 1 : -1) as 1 | -1;
      const car: TrafficCar = {
        axis,
        line,
        offset,
        dir,
        t: rand() * this.span,
        speed: 9 + rand() * 7,
        x: 0,
        z: 0,
        heading: 0,
      };
      this.cars.push(car);
      this.bodyMesh.setColorAt(i, new THREE.Color(COLORS[Math.floor(rand() * COLORS.length)]));
    }
    if (this.bodyMesh.instanceColor) this.bodyMesh.instanceColor.needsUpdate = true;
    this.update(0);
  }

  update(dt: number): void {
    const span = this.span;
    for (let i = 0; i < this.cars.length; i += 1) {
      const car = this.cars[i];
      car.t += car.dir * car.speed * dt;
      if (car.t > span) car.t -= span;
      if (car.t < 0) car.t += span;

      if (car.axis === 'x') {
        car.x = car.t;
        car.z = car.line * this.blockLength + car.offset;
        car.heading = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        car.x = car.line * this.blockLength + car.offset;
        car.z = car.t;
        car.heading = car.dir > 0 ? 0 : Math.PI;
      }

      this.transform.position.set(car.x, 0, car.z);
      this.transform.rotation.set(0, car.heading, 0);
      this.transform.updateMatrix();
      this.bodyMesh.setMatrixAt(i, this.transform.matrix);
      this.glassMesh.setMatrixAt(i, this.transform.matrix);
      this.wheelMesh.setMatrixAt(i, this.transform.matrix);
    }
    this.bodyMesh.instanceMatrix.needsUpdate = true;
    this.glassMesh.instanceMatrix.needsUpdate = true;
    this.wheelMesh.instanceMatrix.needsUpdate = true;
    this.cache.length = 0;
    for (const car of this.cars) this.cache.push({ x: car.x, z: car.z, radius: 1.15 });
  }

  /** 供碰撞使用的圆形近似（车身中心 + 半径） */
  colliders(): { x: number; z: number; radius: number }[] {
    return this.cache;
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }
}
