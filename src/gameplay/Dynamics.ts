import * as THREE from 'three';
import { DRIVETRAIN, PHYSICS, type VehicleSpec } from '../core/Config';
import { bus } from '../core/EventBus';

export interface DriveInput {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
}

export interface VehicleState {
  x: number;
  z: number;
  heading: number;
  speed: number;
  lateral: number;
  gear: number;
  rpm: number;
  steerAngle: number;
  driftPose: number;
  wheelRoll: number;
  pitch: number;
  roll: number;
  /** 渲染插值用的上一物理帧位姿 */
  prevX: number;
  prevZ: number;
  prevHeading: number;
}

export function sampleTorque(spec: VehicleSpec, rpmRatio: number): number {
  const curve = spec.torqueCurveNm;
  const t = Math.max(0, Math.min(1, rpmRatio)) * (curve.length - 1);
  const i = Math.floor(t);
  const j = Math.min(curve.length - 1, i + 1);
  return curve[i] + (curve[j] - curve[i]) * (t - i);
}

/**
 * 街机化车辆动力学（数值见 docs/DISTILLATION.md）：
 * - 偏航角速度按自行车模型，无侧偏角
 * - 横向速度低通模拟抓地/漂移
 * - 自动变速箱按速度对应的挡位红线换挡
 */
export class VehicleDynamics {
  state: VehicleState;
  private driftLatch = false;
  private shiftTimer = 0;
  private gearMaxSpeeds: number[];

  constructor(public spec: VehicleSpec) {
    this.gearMaxSpeeds = VehicleDynamics.gearMaxSpeeds(spec);
    this.state = {
      x: 0,
      z: 0,
      heading: 0,
      speed: 0,
      lateral: 0,
      gear: 1,
      rpm: spec.engineIdleRpm,
      steerAngle: 0,
      driftPose: 0,
      wheelRoll: 0,
      pitch: 0,
      roll: 0,
      prevX: 0,
      prevZ: 0,
      prevHeading: 0,
    };
  }

  /** 换车：更新参数并重算各挡极速 */
  setSpec(spec: VehicleSpec): void {
    this.spec = spec;
    this.gearMaxSpeeds = VehicleDynamics.gearMaxSpeeds(spec);
    this.state.rpm = spec.engineIdleRpm;
  }

  reset(x: number, z: number, heading: number): void {
    Object.assign(this.state, {
      x,
      z,
      heading,
      speed: 0,
      lateral: 0,
      gear: 1,
      rpm: this.spec.engineIdleRpm,
      steerAngle: 0,
      driftPose: 0,
      pitch: 0,
      roll: 0,
      prevX: x,
      prevZ: z,
      prevHeading: heading,
    });
    this.driftLatch = false;
    this.shiftTimer = 0;
  }

  get speedKmh(): number {
    return Math.hypot(this.state.speed, this.state.lateral) * 3.6;
  }

  get speedRatio(): number {
    return Math.min(1, Math.abs(this.state.speed) / this.spec.topSpeedMs);
  }

  get rpmRatio(): number {
    const range = Math.max(1, this.spec.engineRedlineRpm - this.spec.engineIdleRpm);
    return Math.max(0, Math.min(1, (this.state.rpm - this.spec.engineIdleRpm) / range));
  }

  step(dt: number, input: DriveInput): void {
    const s = this.state;
    const spec = this.spec;
    s.prevX = s.x;
    s.prevZ = s.z;
    s.prevHeading = s.heading;

    this.shiftTimer = Math.max(0, this.shiftTimer - dt);
    if (s.speed < -0.5) s.gear = 0;
    else if (Math.abs(s.speed) < 0.8) s.gear = 1;

    const engineAccel = this.engineAccel();
    if (input.throttle > 0) {
      if (s.speed >= 0) s.speed = Math.min(s.speed + engineAccel * input.throttle * dt, spec.topSpeedMs);
      else s.speed = Math.min(s.speed + spec.brakeMs2 * dt, 0);
    } else if (input.brake > 0) {
      if (s.speed > 0) s.speed = Math.max(s.speed - spec.brakeMs2 * input.brake * dt, 0);
      else s.speed = Math.max(s.speed - spec.accelMs2 * 0.55 * dt, -PHYSICS.REVERSE_MAX_SPEED);
    } else if (Math.abs(s.speed) > 0.001) {
      const decel = PHYSICS.COAST_DECELERATION * dt;
      s.speed = s.speed > 0 ? Math.max(s.speed - decel, 0) : Math.min(s.speed + decel, 0);
    }

    this.updateTransmission(Math.abs(s.speed), input);
    const targetRpm = this.targetRpm(Math.abs(s.speed));
    s.rpm += (targetRpm - s.rpm) * Math.min(1, dt * DRIVETRAIN.RPM_RESPONSE);

    // 抓地限制转向：tan(δ) ≤ a_max·L/v²，低速保留满舵，高速自动收窄
    const speedAbs = Math.max(3, Math.abs(s.speed));
    const maxTan = (PHYSICS.MAX_LATERAL_ACCEL * PHYSICS.WHEELBASE) / (speedAbs * speedAbs);
    const maxSteer = Math.min(PHYSICS.MAX_STEER_ANGLE, Math.atan(maxTan));
    const targetSteer = input.steer * maxSteer;
    const steerDelta = spec.steerRate * PHYSICS.STEER_RESPONSE * dt;
    if (s.steerAngle < targetSteer) s.steerAngle = Math.min(s.steerAngle + steerDelta, targetSteer);
    else if (s.steerAngle > targetSteer) s.steerAngle = Math.max(s.steerAngle - steerDelta, targetSteer);

    if (Math.abs(s.speed) > 0.1) {
      const yawRate = (s.speed / PHYSICS.WHEELBASE) * Math.tan(s.steerAngle);
      s.heading += yawRate * dt;
    }

    const grip = input.handbrake ? PHYSICS.HAND_BRAKE_GRIP : spec.grip * PHYSICS.NORMAL_GRIP;
    const lateralTarget = input.steer * s.speed * (input.handbrake ? 0.34 : 0.1);
    s.lateral += (lateralTarget - s.lateral) * Math.min(grip * dt, 1);

    const fx = Math.sin(s.heading);
    const fz = Math.cos(s.heading);
    const rx = fz;
    const rz = -fx;
    s.x += (fx * s.speed + rx * s.lateral) * dt;
    s.z += (fz * s.speed + rz * s.lateral) * dt;

    if (input.handbrake) this.driftLatch = true;
    const stillTurning = Math.abs(input.steer) > 0.15 && Math.abs(s.speed) > 6;
    if (!stillTurning && !input.handbrake) this.driftLatch = false;
    const targetDrift = (input.handbrake || this.driftLatch) && stillTurning ? 1 : 0;
    s.driftPose += (targetDrift - s.driftPose) * Math.min(1, dt * 7);

    s.wheelRoll += (s.speed / 0.34) * dt;
    const targetPitch = THREE.MathUtils.clamp(
      (-(s.speed - this.lastSpeed) / Math.max(1e-4, dt)) * 0.0032,
      -0.055,
      0.055,
    );
    s.pitch += (targetPitch - s.pitch) * Math.min(1, dt * 5.5);
    s.roll += (Math.max(-0.05, Math.min(0.05, s.lateral * 0.006)) - s.roll) * Math.min(1, dt * 6);
    this.lastSpeed = s.speed;
  }

  private lastSpeed = 0;

  private engineAccel(): number {
    const s = this.state;
    const torque = sampleTorque(this.spec, this.rpmRatio);
    const gearRatio =
      s.gear > 0
        ? this.spec.gearRatios[Math.min(s.gear - 1, this.spec.gearRatios.length - 1)]
        : DRIVETRAIN.REVERSE_GEAR_RATIO;
    const mass =
      this.spec.length * this.spec.width * this.spec.height * PHYSICS.VEHICLE_MASS_DENSITY;
    const accel = (torque * gearRatio * this.spec.finalDrive) / 0.34 / mass;
    const reference = (this.spec.peakTorqueNm * this.spec.gearRatios[0] * this.spec.finalDrive) / 0.34 / mass;
    return (accel / reference) * this.spec.accelMs2;
  }

  private static gearMaxSpeeds(spec: VehicleSpec): number[] {
    const speeds: number[] = [];
    const first = DRIVETRAIN.FIRST_GEAR_REDLINE_RATIO;
    for (let gear = 1; gear <= spec.gears; gear += 1) {
      const t = (gear - 1) / Math.max(1, spec.gears - 1);
      speeds.push(spec.topSpeedMs * first * Math.pow(1 / first, t));
    }
    return speeds;
  }

  private targetRpm(speedMs: number): number {
    const s = this.state;
    const spec = this.spec;
    const range = spec.engineRedlineRpm - spec.engineIdleRpm;
    if (s.gear === 0) {
      const ratio = Math.min(speedMs / PHYSICS.REVERSE_MAX_SPEED, 1);
      return spec.engineIdleRpm + range * ratio * DRIVETRAIN.REVERSE_RPM_RATIO;
    }
    const vMax = this.gearMaxSpeeds[s.gear - 1] ?? spec.topSpeedMs;
    return spec.engineIdleRpm + range * Math.min(speedMs / vMax, 1);
  }

  private updateTransmission(speedMs: number, input: DriveInput): void {
    const s = this.state;
    if (s.gear === 0 || this.shiftTimer > 0) return;
    const redline = this.spec.engineRedlineRpm;
    const target = this.targetRpm(speedMs);
    if (
      input.throttle > DRIVETRAIN.UPSHIFT_THROTTLE &&
      target >= redline * DRIVETRAIN.UPSHIFT_RPM_RATIO &&
      s.gear < this.spec.gears
    ) {
      s.gear += 1;
      this.shiftTimer = DRIVETRAIN.SHIFT_TIME;
      bus.emit('vehicle:shift', { gear: s.gear });
      return;
    }
    if (
      s.gear > 1 &&
      target < redline * DRIVETRAIN.DOWNSHIFT_RPM_RATIO &&
      (input.throttle > DRIVETRAIN.DOWNSHIFT_THROTTLE || input.brake > DRIVETRAIN.DOWNSHIFT_BRAKE) &&
      speedMs <= this.gearMaxSpeeds[s.gear - 2] * DRIVETRAIN.DOWNSHIFT_SPEED_RATIO
    ) {
      s.gear -= 1;
      this.shiftTimer = DRIVETRAIN.SHIFT_TIME;
      bus.emit('vehicle:shift', { gear: s.gear });
    }
  }
}
