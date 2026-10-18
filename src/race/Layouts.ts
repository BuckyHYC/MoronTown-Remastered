import { WORLD } from '../core/Config';

export interface RaceLayout {
  id: string;
  name: string;
  /** 闭合路线（世界坐标，车道中心） */
  path: [number, number][];
  checkpointRadius: number;
  laps: number;
}

const B = WORLD.BLOCK_LENGTH;

/**
 * 三条赛道：都用城市路网本身，路线点落在车道中心，保证不会穿楼。
 * 城市道路在 0/150/300/450/600 上，车道中心偏移 ±2m。
 */
export const RACE_LAYOUTS: RaceLayout[] = [
  {
    id: 'perimeter',
    name: '城市环路',
    path: [
      [B + 2, B - 2],
      [B * 3 - 2, B - 2],
      [B * 4 - 2, B + 2],
      [B * 4 - 2, B * 3 - 2],
      [B * 3 + 2, B * 4 - 2],
      [B + 2, B * 4 - 2],
      [B - 2, B * 3 + 2],
      [B - 2, B + 2],
      [B + 2, B - 2],
    ],
    checkpointRadius: 22,
    laps: 3,
  },
  {
    id: 'cityTour',
    name: '城市巡回',
    path: [
      [B + 2, B + 2],
      [B * 2 - 2, B + 2],
      [B * 2 - 2, B * 2 + 2],
      [B * 3 + 2, B * 2 + 2],
      [B * 3 + 2, B * 3 + 2],
      [B * 2 + 2, B * 3 + 2],
      [B * 2 + 2, B * 3 - 2],
      [B + 2, B * 3 - 2],
      [B + 2, B * 2 - 2],
      [B - 2, B * 2 - 2],
      [B - 2, B + 2],
      [B + 2, B + 2],
    ],
    checkpointRadius: 20,
    laps: 2,
  },
  {
    id: 'hillLoop',
    name: '山地纵贯',
    path: [
      [B * 2 - 2, B + 2],
      [B * 4 - 2, B + 2],
      [B * 4 - 2, B * 2 + 2],
      [B * 3 - 2, B * 2 + 2],
      [B * 3 - 2, B * 3 + 2],
      [B * 4 - 2, B * 3 + 2],
      [B * 4 - 2, B * 4 - 2],
      [B * 2 - 2, B * 4 - 2],
      [B * 2 - 2, B * 3 + 2],
      [B - 2, B * 3 + 2],
      [B - 2, B * 2 - 2],
      [B * 2 - 2, B * 2 - 2],
      [B * 2 - 2, B + 2],
    ],
    checkpointRadius: 24,
    laps: 2,
  },
];

/** 沿闭合折线按固定间距采样，返回点列与累计长度 */
export function sampleRoute(path: [number, number][], step = 6): {
  points: { x: number; z: number }[];
  length: number;
} {
  const points: { x: number; z: number }[] = [];
  let length = 0;
  for (let i = 0; i < path.length - 1; i += 1) {
    const [x0, z0] = path[i];
    const [x1, z1] = path[i + 1];
    const dx = x1 - x0;
    const dz = z1 - z0;
    const seg = Math.hypot(dx, dz);
    const count = Math.max(1, Math.round(seg / step));
    for (let k = 0; k < count; k += 1) {
      const t = k / count;
      points.push({ x: x0 + dx * t, z: z0 + dz * t });
    }
    length += seg;
  }
  const last = path[path.length - 1];
  points.push({ x: last[0], z: last[1] });
  return { points, length };
}

/** 等距检查点（含起点），用于玩家按序通过 */
export function buildCheckpoints(
  points: { x: number; z: number }[],
  count: number,
): { x: number; z: number }[] {
  const result: { x: number; z: number }[] = [];
  const stride = Math.max(1, Math.floor(points.length / count));
  for (let i = 0; i < points.length; i += stride) {
    result.push(points[i]);
  }
  return result.slice(0, count);
}
