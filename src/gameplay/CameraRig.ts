import * as THREE from 'three';
import { CAMERA, type CameraMode, type VehicleSpec } from '../core/Config';
import type { VehicleState } from './Dynamics';

/**
 * 相机装置：追尾 / 引擎盖 / 座舱 三视角 + 环绕 + 碰撞震屏 + 速度 FOV。
 * 追尾用指数平滑跟随，位姿读取的是「插值后的世界坐标」。
 */
export class CameraRig {
  mode: CameraMode = 'chase';
  orbitYaw = 0;
  orbitPitch = 0;
  private readonly position = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private fov: number = CAMERA.fov;
  /** 座舱眼点（车体局部坐标）：x 左正右负、y 高度、z 向前 */
  readonly cockpitEye = new THREE.Vector3(-0.34, 1.12, 0.12);
  private shake = 0;
  private initialized = false;

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    this.camera.fov = CAMERA.fov;
    this.camera.near = CAMERA.near;
    this.camera.far = CAMERA.far;
    this.camera.updateProjectionMatrix();
  }

  cycle(): CameraMode {
    this.mode = this.mode === 'chase' ? 'hood' : this.mode === 'hood' ? 'cockpit' : 'chase';
    this.initialized = false;
    return this.mode;
  }

  addShake(amount: number): void {
    this.shake = Math.min(1.2, this.shake + amount);
  }

  snap(): void {
    this.initialized = false;
  }

  update(
    dt: number,
    world: THREE.Vector3,
    heading: number,
    state: VehicleState,
    spec: VehicleSpec,
    speedRatio: number,
    orbitDelta: number,
    speedFovEnabled: boolean,
  ): void {
    this.orbitYaw += orbitDelta;
    this.orbitPitch = THREE.MathUtils.clamp(this.orbitPitch + orbitDelta * 0.25, -0.6, 0.9);

    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    const rx = Math.cos(heading);
    const rz = -Math.sin(heading);

    let targetFov: number;
    if (this.mode === 'chase') {
      const dist = CAMERA.chaseDistance + this.orbitPitch * 2.2;
      const height = CAMERA.chaseHeight + this.orbitPitch * 2.4;
      const yaw = this.orbitYaw;
      const ox = Math.sin(heading + Math.PI + yaw) * dist;
      const oz = Math.cos(heading + Math.PI + yaw) * dist;
      this.desired.set(world.x + ox, world.y + height, world.z + oz);
      targetFov = CAMERA.fov + (speedFovEnabled ? speedRatio * CAMERA.speedFovGain : 0);
      this.look.set(
        world.x + fx * CAMERA.chaseLookAhead,
        world.y + CAMERA.chaseLookHeight,
        world.z + fz * CAMERA.chaseLookAhead,
      );
    } else if (this.mode === 'hood') {
      const fwd = spec.length * 0.22;
      this.desired.set(
        world.x + fx * fwd + rx * 0.0,
        world.y + spec.height * 0.92,
        world.z + fz * fwd + rz * 0.0,
      );
      targetFov = CAMERA.hoodFov + (speedFovEnabled ? speedRatio * 8 : 0);
      this.look.set(world.x + fx * 30, world.y + spec.height * 0.86, world.z + fz * 30);
    } else {
      const { x: seatX, y: seatY, z: seatZ } = this.cockpitEye;
      this.desired.set(
        world.x + fx * seatZ + rx * seatX,
        world.y + seatY,
        world.z + fz * seatZ + rz * seatX,
      );
      targetFov = CAMERA.cockpitFov + (speedFovEnabled ? speedRatio * 6 : 0);
      this.look.set(
        world.x + rx * seatX + fx * 40,
        world.y + seatY - 0.06,
        world.z + rz * seatX + fz * 40,
      );
    }

    if (!this.initialized) {
      this.position.copy(this.desired);
      this.fov = targetFov;
      this.initialized = true;
    } else {
      const k = 1 - Math.exp(-(this.mode === 'chase' ? CAMERA.chaseStiffness : 22) * dt);
      this.position.lerp(this.desired, k);
      this.fov += (targetFov - this.fov) * Math.min(1, dt * 4);
    }

    // 撞击震屏
    if (this.shake > 0.001) {
      this.shake *= Math.exp(-CAMERA.shakeDecay * dt);
      this.tmp.set(
        (Math.random() - 0.5) * this.shake * 0.5,
        (Math.random() - 0.5) * this.shake * 0.35,
        (Math.random() - 0.5) * this.shake * 0.5,
      );
    } else {
      this.shake = 0;
      this.tmp.set(0, 0, 0);
    }

    this.camera.position.copy(this.position).add(this.tmp);
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.look.x + this.tmp.x * 0.4, this.look.y + this.tmp.y * 0.4, this.look.z + this.tmp.z * 0.4);

    void state;
  }
}
