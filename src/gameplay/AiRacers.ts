import * as THREE from 'three';
import { carBodies, carWheels } from './Traffic';

const AI_COLORS = [0x2f6bd8, 0xd83a3a, 0xf2c94c, 0x38c172, 0x8e5cd9, 0xe07a3c];

/** AI 对手车：用交通车的轻量几何体（约 1k 三角），每台一个 Group */
export class AiRacers {
  readonly group = new THREE.Group();
  private readonly items: { root: THREE.Group; body: THREE.Mesh; wheels: THREE.Mesh }[] = [];

  constructor(scene: THREE.Scene, count: number) {
    this.group.name = 'ai-racers';
    const bodyGeo = carBodies();
    const wheelGeo = carWheels();
    for (let i = 0; i < count; i += 1) {
      const root = new THREE.Group();
      const body = new THREE.Mesh(
        bodyGeo,
        new THREE.MeshStandardMaterial({
          color: AI_COLORS[i % AI_COLORS.length],
          roughness: 0.32,
          metalness: 0.55,
          envMapIntensity: 1.2,
        }),
      );
      body.castShadow = true;
      const wheels = new THREE.Mesh(wheelGeo, new THREE.MeshStandardMaterial({ color: 0x121418, roughness: 0.9 }));
      root.add(body, wheels);
      this.group.add(root);
      this.items.push({ root, body, wheels });
    }
    scene.add(this.group);
  }

  sync(racers: { x: number; z: number; heading: number }[]): void {
    racers.forEach((racer, i) => {
      const item = this.items[i];
      if (!item) return;
      item.root.visible = true;
      item.root.position.set(racer.x, 0, racer.z);
      item.root.rotation.y = racer.heading;
    });
    for (let i = racers.length; i < this.items.length; i += 1) this.items[i].root.visible = false;
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }
}
