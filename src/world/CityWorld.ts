import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MATERIALS } from '../core/Registry';
import { WORLD } from '../core/Config';

export interface Aabb {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * 城市生成（第一版）：规则网格 + 车道标线 + 人行道 + 临街建筑 + 路灯 + 行道树。
 * 道路/建筑均为合并或实例化绘制，draw call 与城市规模解耦。
 */
export class CityWorld {
  readonly group = new THREE.Group();
  readonly colliders: Aabb[] = [];
  readonly lampPositions: THREE.Vector3[] = [];
  private facadeUniforms = { uNight: { value: 0 } };
  private buildingCount = 0;

  constructor(
    private readonly mats = MATERIALS,
    private readonly blocks: number = 4,
  ) {
    this.group.name = 'city';
  }

  get span(): number {
    return this.blocks * WORLD.BLOCK_LENGTH;
  }

  build(scene: THREE.Scene): void {
    scene.add(this.group);
    this.addGround();
    this.addRoads();
    this.addSidewalks();
    this.addMarkings();
    this.addBuildings();
    this.addLamps();
    this.addTrees();
  }

  setNight(value: number): void {
    this.facadeUniforms.uNight.value = value;
    if (this.storefrontMaterial) this.storefrontMaterial.emissiveIntensity = value * 0.22;
  }

  private addGround(): void {
    const geometry = new THREE.PlaneGeometry(3600, 3600);
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, this.mats.ground);
    mesh.position.set(this.span / 2, -0.04, this.span / 2);
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  private addRoads(): void {
    const geos: THREE.BufferGeometry[] = [];
    const half = WORLD.ROAD_WIDTH / 2;
    for (let i = 0; i <= this.blocks; i += 1) {
      const along = i * WORLD.BLOCK_LENGTH;
      geos.push(flatPlane(this.span + WORLD.ROAD_WIDTH * 2, WORLD.ROAD_WIDTH, this.span / 2, along, 0.01));
      geos.push(flatPlane(WORLD.ROAD_WIDTH, this.span + WORLD.ROAD_WIDTH * 2, along, this.span / 2, 0.012));
      void half;
    }
    const merged = mergeGeometries(geos, false);
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, this.mats.asphalt);
    mesh.receiveShadow = true;
    mesh.name = 'roads';
    this.group.add(mesh);
  }

  private addSidewalks(): void {
    const geos: THREE.BufferGeometry[] = [];
    const offset = WORLD.ROAD_WIDTH / 2 + WORLD.SIDEWALK_WIDTH / 2;
    for (let i = 0; i <= this.blocks; i += 1) {
      const along = i * WORLD.BLOCK_LENGTH;
      for (const sign of [-1, 1]) {
        geos.push(flatPlane(this.span, WORLD.SIDEWALK_WIDTH, this.span / 2, along + sign * offset, 0.14));
        geos.push(flatPlane(WORLD.SIDEWALK_WIDTH, this.span, along + sign * offset, this.span / 2, 0.14));
      }
    }
    const merged = mergeGeometries(geos, false);
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, this.mats.sidewalk);
    mesh.receiveShadow = true;
    mesh.name = 'sidewalks';
    this.group.add(mesh);
  }

  private addMarkings(): void {
    const white: THREE.BufferGeometry[] = [];
    const yellow: THREE.BufferGeometry[] = [];
    const laneOffset = WORLD.ROAD_WIDTH / 4;
    const edge = WORLD.ROAD_WIDTH / 2 - 0.3;
    const dashLength = 3;
    const gap = 6;
    const step = dashLength + gap;

    for (let i = 0; i <= this.blocks; i += 1) {
      const along = i * WORLD.BLOCK_LENGTH;
      // 中心双黄线
      for (const sign of [-1, 1]) {
        yellow.push(flatPlane(this.span, 0.16, this.span / 2, along + sign * 0.18, 0.03));
        yellow.push(flatPlane(0.16, this.span, along + sign * 0.18, this.span / 2, 0.03));
      }
      // 车道白虚线
      for (let d = 10; d < this.span - 4; d += step) {
        white.push(flatPlane(dashLength, 0.16, d + dashLength / 2, along + laneOffset, 0.032));
        white.push(flatPlane(dashLength, 0.16, d + dashLength / 2, along - laneOffset, 0.032));
        white.push(flatPlane(0.16, dashLength, along + laneOffset, d + dashLength / 2, 0.032));
        white.push(flatPlane(0.16, dashLength, along - laneOffset, d + dashLength / 2, 0.032));
      }
      // 路边实线
      for (const sign of [-1, 1]) {
        white.push(flatPlane(this.span, 0.14, this.span / 2, along + sign * edge, 0.031));
        white.push(flatPlane(0.14, this.span, along + sign * edge, this.span / 2, 0.031));
      }
    }

    // 斑马线：每个路口四边
    for (let i = 0; i <= this.blocks; i += 1) {
      for (let j = 0; j <= this.blocks; j += 1) {
        const x = i * WORLD.BLOCK_LENGTH;
        const z = j * WORLD.BLOCK_LENGTH;
        for (let s = -3; s <= 3; s += 1) {
          white.push(flatPlane(0.55, 3.2, x + s * 1.05, z + WORLD.ROAD_WIDTH / 2 + 2.0, 0.034));
          white.push(flatPlane(0.55, 3.2, x + s * 1.05, z - WORLD.ROAD_WIDTH / 2 - 2.0, 0.034));
          white.push(flatPlane(3.2, 0.55, x + WORLD.ROAD_WIDTH / 2 + 2.0, z + s * 1.05, 0.034));
          white.push(flatPlane(3.2, 0.55, x - WORLD.ROAD_WIDTH / 2 - 2.0, z + s * 1.05, 0.034));
        }
      }
    }

    const whiteMesh = new THREE.Mesh(mergeGeometries(white, false)!, this.mats.marking);
    whiteMesh.receiveShadow = true;
    whiteMesh.name = 'markings-white';
    this.group.add(whiteMesh);

    const yellowMesh = new THREE.Mesh(mergeGeometries(yellow, false)!, this.mats.markingYellow);
    yellowMesh.receiveShadow = true;
    yellowMesh.name = 'markings-yellow';
    this.group.add(yellowMesh);
  }

  private addBuildings(): void {
    const blockInner = WORLD.BLOCK_LENGTH - WORLD.BUILDING_INSET * 2;
    const cells = 2;
    const cellSize = blockInner / cells;
    const transform = new THREE.Object3D();
    const color = new THREE.Color();
    const palette = [0x8f9aa6, 0xa9a095, 0x9c8f7d, 0x7d8894, 0x9a8578, 0x6f7f8f, 0xb0a89c];
    const items: { x: number; z: number; w: number; d: number; h: number; c: number }[] = [];

    let seed = WORLD.CITY_SEED;
    const rand = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    for (let i = 0; i < this.blocks; i += 1) {
      for (let j = 0; j < this.blocks; j += 1) {
        for (let cx = 0; cx < cells; cx += 1) {
          for (let cz = 0; cz < cells; cz += 1) {
            if (rand() < 0.14) continue;
            const inner = cellSize - 8;
            const w = inner * (0.55 + rand() * 0.4);
            const d = inner * (0.55 + rand() * 0.4);
            const x = i * WORLD.BLOCK_LENGTH + WORLD.BUILDING_INSET + cellSize * (cx + 0.5);
            const z = j * WORLD.BLOCK_LENGTH + WORLD.BUILDING_INSET + cellSize * (cz + 0.5);
            const tall = rand() < 0.18;
            const h = tall ? 58 + rand() * 52 : 12 + rand() * 34;
            items.push({ x, z, w, d, h, c: palette[Math.floor(rand() * palette.length)] });
          }
        }
      }
    }

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.translate(0, 0.5, 0);
    const material = this.createFacadeMaterial();
    const mesh = new THREE.InstancedMesh(geometry, material, items.length);
    mesh.name = 'buildings';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    items.forEach((item, index) => {
      transform.position.set(item.x, 0, item.z);
      transform.scale.set(item.w, item.h, item.d);
      transform.rotation.set(0, 0, 0);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
      color.setHex(item.c);
      mesh.setColorAt(index, color);
      this.colliders.push({
        minX: item.x - item.w / 2,
        maxX: item.x + item.w / 2,
        minZ: item.z - item.d / 2,
        maxZ: item.z + item.d / 2,
      });
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.group.add(mesh);
    this.buildingCount = items.length;
    this.addFacadeDetails(items);
  }

  /** 立面细节：楼层挑檐 + 底层商铺玻璃 + 屋顶设备，靠实例化控制绘制开销 */
  private addFacadeDetails(items: { x: number; z: number; w: number; d: number; h: number }[]): void {
    const transform = new THREE.Object3D();
    const ledgeMat = new THREE.MeshStandardMaterial({
      color: 0xb9b6ae,
      roughness: 0.78,
      metalness: 0.04,
      envMapIntensity: 0.7,
    });
    const ledgeGeo = new THREE.BoxGeometry(1, 1, 1);
    ledgeGeo.translate(0, 0, 0);
    const ledges: { x: number; z: number; w: number; d: number; y: number }[] = [];
    for (const item of items) {
      for (let y = 4.4; y < item.h - 2.2; y += 3.3) {
        ledges.push({ x: item.x, z: item.z, w: item.w + 0.34, d: item.d + 0.34, y });
      }
    }
    const ledgeMesh = new THREE.InstancedMesh(ledgeGeo, ledgeMat, ledges.length);
    ledgeMesh.name = 'facade-ledge';
    ledgeMesh.castShadow = false;
    ledgeMesh.receiveShadow = true;
    ledges.forEach((l, i) => {
      transform.position.set(l.x, l.y, l.z);
      transform.scale.set(l.w, 0.2, l.d);
      transform.rotation.set(0, 0, 0);
      transform.updateMatrix();
      ledgeMesh.setMatrixAt(i, transform.matrix);
    });
    ledgeMesh.instanceMatrix.needsUpdate = true;
    this.group.add(ledgeMesh);

    const storeMat = new THREE.MeshStandardMaterial({
      color: 0x121820,
      roughness: 0.22,
      metalness: 0.5,
      emissive: 0xffb867,
      emissiveIntensity: 0,
      envMapIntensity: 1.1,
    });
    const storeGeo = new THREE.BoxGeometry(1, 1, 1);
    storeGeo.translate(0, 0.5, 0);
    const storeMesh = new THREE.InstancedMesh(storeGeo, storeMat, items.length);
    storeMesh.name = 'facade-storefront';
    storeMesh.receiveShadow = true;
    items.forEach((item, i) => {
      transform.position.set(item.x, 0, item.z);
      transform.scale.set(item.w + 0.5, 4.2, item.d + 0.5);
      transform.updateMatrix();
      storeMesh.setMatrixAt(i, transform.matrix);
    });
    storeMesh.instanceMatrix.needsUpdate = true;
    this.group.add(storeMesh);
    this.storefrontMaterial = storeMat;

    const roofMat = new THREE.MeshStandardMaterial({ color: 0x6a6d70, roughness: 0.9 });
    const roofGeo = new THREE.BoxGeometry(1, 1, 1);
    roofGeo.translate(0, 0.5, 0);
    const roofMesh = new THREE.InstancedMesh(roofGeo, roofMat, items.length * 2);
    roofMesh.name = 'roof-equipment';
    let roofIndex = 0;
    let seed = 1337;
    const rand = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (const item of items) {
      const count = rand() < 0.6 ? 2 : 1;
      for (let k = 0; k < count && roofIndex < items.length * 2; k += 1) {
        const w = item.w * (0.12 + rand() * 0.18);
        const d = item.d * (0.12 + rand() * 0.18);
        const h = 1.2 + rand() * 3.4;
        transform.position.set(
          item.x + (rand() - 0.5) * item.w * 0.5,
          item.h,
          item.z + (rand() - 0.5) * item.d * 0.5,
        );
        transform.scale.set(w, h, d);
        transform.updateMatrix();
        roofMesh.setMatrixAt(roofIndex, transform.matrix);
        roofIndex += 1;
      }
    }
    roofMesh.count = roofIndex;
    roofMesh.instanceMatrix.needsUpdate = true;
    roofMesh.castShadow = true;
    this.group.add(roofMesh);
  }

  private storefrontMaterial: THREE.MeshStandardMaterial | null = null;

  /** 程序化立面：世界坐标窗格 + 楼层线 + 夜间随机亮灯 */
  private createFacadeMaterial(): THREE.MeshStandardMaterial {
    const uniforms = this.facadeUniforms;
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.86,
      metalness: 0.02,
      envMapIntensity: 0.55,
    });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uNight = uniforms.uNight;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec3 vFacadePos;\nvarying vec3 vFacadeNormal;',
        )
        .replace(
          '#include <worldpos_vertex>',
          `#include <worldpos_vertex>
           vec4 facadeWorld = vec4(transformed, 1.0);
           #ifdef USE_INSTANCING
             facadeWorld = instanceMatrix * facadeWorld;
           #endif
           facadeWorld = modelMatrix * facadeWorld;
           vFacadePos = facadeWorld.xyz;
           vFacadeNormal = normalize(mat3(modelMatrix) * objectNormal);`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec3 vFacadePos;\nvarying vec3 vFacadeNormal;\nuniform float uNight;\nfloat reHash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }',
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
           float along = abs(vFacadeNormal.x) > abs(vFacadeNormal.z) ? vFacadePos.z : vFacadePos.x;
           vec2 cell = vec2(2.7, 3.3);
           vec2 g = vec2(along / cell.x, (vFacadePos.y - 0.4) / cell.y);
           vec2 id = floor(g);
           vec2 f = fract(g);
           float win = step(0.16, f.x) * step(f.x, 0.84) * step(0.22, f.y) * step(f.y, 0.78);
           float floorBand = smoothstep(0.055, 0.0, abs(f.y - 0.005) + abs(f.y - 0.995));
           float rnd = reHash(id);
           vec3 glassTint = mix(vec3(0.055, 0.062, 0.075), vec3(0.14, 0.155, 0.185), win);
           diffuseColor.rgb *= mix(vec3(1.0), glassTint, win);
           diffuseColor.rgb *= mix(1.0, 0.82, floorBand);
           float lit = step(0.58, rnd);
           vec3 warm = vec3(1.0, 0.82, 0.55);
           vec3 cool = vec3(0.72, 0.86, 1.0);
           vec3 lampColor = mix(warm, cool, step(0.55, fract(rnd * 7.3)));
           totalEmissiveRadiance += win * lit * uNight * lampColor * 0.62;`,
        );
    };
    material.customProgramCacheKey = () => 'facade-v1';
    return material;
  }

  private addLamps(): void {
    const poles: { x: number; z: number; rot: number }[] = [];
    for (let i = 0; i <= this.blocks; i += 1) {
      const z = i * WORLD.BLOCK_LENGTH;
      for (let d = 18; d < this.span; d += 48) {
        const side = Math.floor(d / 48) % 2 === 0 ? 1 : -1;
        poles.push({ x: d, z: z + side * (WORLD.ROAD_WIDTH / 2 + 0.9), rot: side > 0 ? 0 : Math.PI });
      }
    }

    const poleGeo = new THREE.CylinderGeometry(0.09, 0.13, 7.6, 8);
    poleGeo.translate(0, 3.8, 0);
    const armGeo = new THREE.BoxGeometry(0.12, 0.12, 1.7);
    armGeo.translate(0, 7.4, 0.75);
    const mergedPole = mergeGeometries([poleGeo, armGeo], false)!;
    const poleMesh = new THREE.InstancedMesh(mergedPole, this.mats.metal, poles.length);
    poleMesh.name = 'lamp-poles';
    poleMesh.castShadow = false;

    const headGeo = new THREE.BoxGeometry(0.42, 0.16, 0.9);
    headGeo.translate(0, 7.34, 1.55);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0x2a2c30,
      emissive: 0xffd9a0,
      emissiveIntensity: 0.2,
      roughness: 0.4,
      metalness: 0.4,
    });
    const headMesh = new THREE.InstancedMesh(headGeo, headMat, poles.length);
    headMesh.name = 'lamp-heads';

    const transform = new THREE.Object3D();
    poles.forEach((pole, index) => {
      transform.position.set(pole.x, 0, pole.z);
      transform.rotation.set(0, pole.rot, 0);
      transform.scale.set(1, 1, 1);
      transform.updateMatrix();
      poleMesh.setMatrixAt(index, transform.matrix);
      headMesh.setMatrixAt(index, transform.matrix);
      this.lampPositions.push(new THREE.Vector3(pole.x, 7.2, pole.z));
      this.colliders.push({ minX: pole.x - 0.2, maxX: pole.x + 0.2, minZ: pole.z - 0.2, maxZ: pole.z + 0.2 });
    });
    poleMesh.instanceMatrix.needsUpdate = true;
    headMesh.instanceMatrix.needsUpdate = true;
    this.group.add(poleMesh, headMesh);
    this.lampHeads = headMat;

    const poolMat = new THREE.MeshBasicMaterial({
      map: poolTexture(),
      color: 0xffc98a,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const poolGeo = new THREE.PlaneGeometry(13, 13);
    poolGeo.rotateX(-Math.PI / 2);
    const poolMesh = new THREE.InstancedMesh(poolGeo, poolMat, poles.length);
    poolMesh.name = 'lamp-pools';
    poolMesh.renderOrder = 3;
    poles.forEach((pole, index) => {
      transform.position.set(pole.x, 0.05, pole.z);
      transform.rotation.set(0, 0, 0);
      transform.scale.set(1, 1, 1);
      transform.updateMatrix();
      poolMesh.setMatrixAt(index, transform.matrix);
    });
    poolMesh.instanceMatrix.needsUpdate = true;
    this.group.add(poolMesh);
    this.lampPoolMaterial = poolMat;
  }

  private lampHeads: THREE.MeshStandardMaterial | null = null;
  private lampPoolMaterial: THREE.MeshBasicMaterial | null = null;

  setLampIntensity(value: number): void {
    if (this.lampHeads) this.lampHeads.emissiveIntensity = 0.15 + value * 2.2;
    if (this.lampPoolMaterial) this.lampPoolMaterial.opacity = value * 0.3;
  }

  private addTrees(): void {
    const spots: { x: number; z: number; s: number }[] = [];
    const offset = WORLD.ROAD_WIDTH / 2 + 2.4;
    let seed = WORLD.CITY_SEED ^ 0x9e3779b9;
    const rand = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let i = 0; i <= this.blocks; i += 1) {
      const z = i * WORLD.BLOCK_LENGTH;
      for (let d = 24; d < this.span - 12; d += 22) {
        if (Math.abs((d % WORLD.BLOCK_LENGTH) - 0) < 14) continue;
        for (const sign of [-1, 1]) {
          if (rand() < 0.25) continue;
          spots.push({ x: d, z: z + sign * offset, s: 0.85 + rand() * 0.5 });
        }
      }
      const x = i * WORLD.BLOCK_LENGTH;
      for (let d = 24; d < this.span - 12; d += 22) {
        if (Math.abs((d % WORLD.BLOCK_LENGTH) - 0) < 14) continue;
        for (const sign of [-1, 1]) {
          if (rand() < 0.35) continue;
          spots.push({ x: x + sign * offset, z: d, s: 0.85 + rand() * 0.5 });
        }
      }
    }

    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 2.6, 6);
    trunkGeo.translate(0, 1.3, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3b2b, roughness: 0.95 });
    const foliageGeo = new THREE.IcosahedronGeometry(2.1, 1);
    foliageGeo.scale(1, 1.25, 1);
    foliageGeo.translate(0, 4.2, 0);
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x4f6b3a, roughness: 0.9, flatShading: true });

    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
    const foliage = new THREE.InstancedMesh(foliageGeo, foliageMat, spots.length);
    trunks.name = 'tree-trunks';
    foliage.name = 'tree-foliage';
    trunks.castShadow = true;
    foliage.castShadow = true;

    const transform = new THREE.Object3D();
    const color = new THREE.Color();
    spots.forEach((spot, index) => {
      transform.position.set(spot.x, 0.14, spot.z);
      transform.rotation.set(0, spot.s * 6.28, 0);
      transform.scale.set(spot.s, spot.s, spot.s);
      transform.updateMatrix();
      trunks.setMatrixAt(index, transform.matrix);
      foliage.setMatrixAt(index, transform.matrix);
      color.setHSL(0.24 + spot.s * 0.03, 0.3, 0.32 + spot.s * 0.08);
      foliage.setColorAt(index, color);
      this.colliders.push({
        minX: spot.x - 0.5,
        maxX: spot.x + 0.5,
        minZ: spot.z - 0.5,
        maxZ: spot.z + 0.5,
      });
    });
    trunks.instanceMatrix.needsUpdate = true;
    foliage.instanceMatrix.needsUpdate = true;
    if (foliage.instanceColor) foliage.instanceColor.needsUpdate = true;
    this.group.add(trunks, foliage);
  }

  stats(): { buildings: number; lamps: number } {
    return { buildings: this.buildingCount, lamps: this.lampPositions.length };
  }
}

function poolTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,236,200,0.9)');
    grad.addColorStop(0.35, 'rgba(255,206,150,0.38)');
    grad.addColorStop(1, 'rgba(255,190,120,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function flatPlane(w: number, d: number, x: number, z: number, y: number): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(w, d);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(x, y, z);
  return geometry;
}
