import * as THREE from 'three';

export interface TaskPointDef {
  x: number;
  z: number;
  layoutIndex: number;
  label: string;
}

/**
 * 自由漫游的任务点：三个发光圆环，开车进入即弹出该赛道的竞速设置。
 * 环本身用两层 torus（内环亮 + 外环弱）做廉价辉光，配合上下浮动与缓慢自转。
 */
export class TaskPoints {
  readonly group = new THREE.Group();
  private readonly rings: { outer: THREE.Mesh; inner: THREE.Mesh; def: TaskPointDef }[] = [];
  private cooldown = 0;
  private readonly radius: number;

  constructor(points: TaskPointDef[], radius = 9) {
    this.radius = radius;
    const inner = new THREE.TorusGeometry(radius, 0.22, 8, 64).rotateX(-Math.PI / 2);
    const outer = new THREE.TorusGeometry(radius, 0.62, 8, 64).rotateX(-Math.PI / 2);
    for (const def of points) {
      const innerMat = new THREE.MeshBasicMaterial({
        color: 0x59d7ff,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const outerMat = new THREE.MeshBasicMaterial({
        color: 0x2b8fd6,
        transparent: true,
        opacity: 0.28,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const innerMesh = new THREE.Mesh(inner, innerMat);
      innerMesh.position.set(def.x, 0.32, def.z);
      innerMesh.renderOrder = 4;
      const outerMesh = new THREE.Mesh(outer, outerMat);
      outerMesh.position.set(def.x, 0.3, def.z);
      outerMesh.renderOrder = 3;
      this.group.add(innerMesh, outerMesh);
      this.rings.push({ inner: innerMesh, outer: outerMesh, def });
    }
    this.group.name = 'task-points';
    this.group.visible = false;
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  get positions(): { x: number; z: number; layoutIndex: number; label: string }[] {
    return this.rings.map(({ def }) => ({ x: def.x, z: def.z, layoutIndex: def.layoutIndex, label: def.label }));
  }

  /**
   * @returns 进入的赛道索引（无触发时为 null）
   */
  update(dt: number, elapsed: number, playerX: number, playerZ: number): number | null {
    this.cooldown = Math.max(0, this.cooldown - dt);
    let entered: number | null = null;
    for (const ring of this.rings) {
      const pulse = 0.5 + 0.5 * Math.sin(elapsed * 2.2);
      ring.inner.rotation.y = elapsed * 0.35;
      ring.outer.rotation.y = -elapsed * 0.22;
      ring.inner.position.y = 0.34 + Math.sin(elapsed * 1.6) * 0.12;
      (ring.inner.material as THREE.MeshBasicMaterial).opacity = 0.55 + pulse * 0.45;
      (ring.outer.material as THREE.MeshBasicMaterial).opacity = 0.14 + pulse * 0.2;
      if (this.cooldown > 0) continue;
      const d = Math.hypot(playerX - ring.def.x, playerZ - ring.def.z);
      if (d < this.radius) {
        entered = ring.def.layoutIndex;
        this.cooldown = 4;
      }
    }
    return entered;
  }

  dispose(): void {
    this.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    });
  }
}
