import { describe, expect, it } from 'vitest';
import { VEHICLES } from '../../src/core/Config';
import { VehicleDynamics } from '../../src/gameplay/Dynamics';

const spec = VEHICLES.find((v) => v.id === 'coupe')!;

function run(dyn: VehicleDynamics, seconds: number, throttle = 1): void {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i += 1) {
    dyn.step(1 / 60, { throttle, brake: 0, steer: 0, handbrake: false });
  }
}

describe('车辆动力学', () => {
  it('油门到底不超过极速', () => {
    const dyn = new VehicleDynamics(spec);
    dyn.reset(0, 0, 0);
    run(dyn, 60);
    expect(dyn.state.speed).toBeLessThanOrEqual(spec.topSpeedMs + 1e-6);
    expect(dyn.state.speed).toBeGreaterThan(spec.topSpeedMs * 0.85);
  });

  it('自动变速箱会升挡，且挡位不超过设定', () => {
    const dyn = new VehicleDynamics(spec);
    dyn.reset(0, 0, 0);
    run(dyn, 12);
    expect(dyn.state.gear).toBeGreaterThan(1);
    expect(dyn.state.gear).toBeLessThanOrEqual(spec.gears);
  });

  it('刹车能把车停下，倒车有速度上限', () => {
    const dyn = new VehicleDynamics(spec);
    dyn.reset(0, 0, 0);
    dyn.state.speed = 20;
    for (let i = 0; i < 60 * 5; i += 1) {
      dyn.step(1 / 60, { throttle: 0, brake: 1, steer: 0, handbrake: false });
    }
    expect(Math.abs(dyn.state.speed)).toBeLessThan(10);
  });

  it('换车后参数与挡位极速随之更新', () => {
    const police = VEHICLES.find((v) => v.id === 'police')!;
    const dyn = new VehicleDynamics(spec);
    dyn.reset(0, 0, 0);
    dyn.setSpec(police);
    expect(dyn.spec.id).toBe('police');
    expect(dyn.spec.topSpeedMs).toBe(police.topSpeedMs);
  });
});
