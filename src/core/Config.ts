/**
 * 全局配置：世界尺度、物理、车辆、画质、昼夜预设。
 * 数值来源见 docs/DISTILLATION.md 的手感基准表；此处为可调参数唯一入口。
 */

export type QualityTier = 'low' | 'medium' | 'high' | 'ultra';
export type TimeId = 'dawn' | 'day' | 'dusk' | 'night';
export type CameraMode = 'chase' | 'hood' | 'cockpit';

export interface QualitySettings {
  pixelRatio: number;
  samples: number;
  shadows: boolean;
  shadowMapSize: number;
  bloom: boolean;
  motionBlur: boolean;
  grade: boolean;
  aa: 'smaa' | 'fxaa' | 'none';
  reflection: 'half' | 'quarter' | 'off';
  envIntensity: number;
  particleBudget: number;
  shadowDistance: number;
}

export const QUALITY: Record<QualityTier, QualitySettings> = {
  low: {
    pixelRatio: 1,
    samples: 0,
    shadows: false,
    shadowMapSize: 0,
    bloom: false,
    motionBlur: false,
    grade: false,
    aa: 'none',
    reflection: 'off',
    envIntensity: 0.5,
    particleBudget: 0,
    shadowDistance: 0,
  },
  medium: {
    pixelRatio: 1.25,
    samples: 0,
    shadows: true,
    shadowMapSize: 1024,
    bloom: true,
    motionBlur: false,
    grade: true,
    aa: 'fxaa',
    reflection: 'off',
    envIntensity: 0.7,
    particleBudget: 2400,
    shadowDistance: 90,
  },
  high: {
    pixelRatio: 1.5,
    samples: 4,
    shadows: true,
    shadowMapSize: 2048,
    bloom: true,
    motionBlur: true,
    grade: true,
    aa: 'smaa',
    reflection: 'quarter',
    envIntensity: 0.95,
    particleBudget: 6000,
    shadowDistance: 130,
  },
  ultra: {
    pixelRatio: 2,
    samples: 4,
    shadows: true,
    shadowMapSize: 4096,
    bloom: true,
    motionBlur: true,
    grade: true,
    aa: 'smaa',
    reflection: 'half',
    envIntensity: 1.05,
    particleBudget: 12000,
    shadowDistance: 170,
  },
};

export const WORLD = {
  /** 8×8 街块，街块边长 150m → 城市 1200×1200 */
  GRID_SIZE: 8,
  BLOCK_LENGTH: 150,
  ROAD_WIDTH: 16,
  LANE_WIDTH: 4,
  SIDEWALK_WIDTH: 3,
  BUILDING_INSET: 17,
  CITY_SEED: 20260809,
  RENDER_DISTANCE: 420,
  /** 无尽区块边长与可视窗口 */
  CHUNK_SIZE: 300,
  CHUNK_WINDOW: 5,
  RIVER_Z: 600,
  RIVER_WIDTH: 22,
  SPAWN_X: 300,
  SPAWN_Z: 450,
} as const;

export const PHYSICS = {
  FIXED_STEP: 1 / 60,
  MAX_SUBSTEPS: 4,
  WHEELBASE: 2.7,
  MAX_STEER_ANGLE: 0.34,
  STEER_RESPONSE: 1.8,
  STEER_SPEED_FACTOR: 0.72,
  HAND_BRAKE_GRIP: 0.55,
  NORMAL_GRIP: 7,
  COAST_DECELERATION: 2.2,
  REVERSE_MAX_SPEED: 9,
  COLLISION_BOUNCE: 0.38,
  COLLISION_RESTITUTION: 0.34,
  VEHICLE_MASS_DENSITY: 125,
  CAR_RADIUS_PADDING: 0.12,
} as const;

export const DRIVETRAIN = {
  FIRST_GEAR_REDLINE_RATIO: 0.14,
  UPSHIFT_RPM_RATIO: 0.985,
  UPSHIFT_THROTTLE: 0.15,
  DOWNSHIFT_RPM_RATIO: 0.42,
  DOWNSHIFT_THROTTLE: 0.2,
  DOWNSHIFT_BRAKE: 0.3,
  DOWNSHIFT_SPEED_RATIO: 0.95,
  SHIFT_TIME: 0.18,
  RPM_RESPONSE: 8,
  REVERSE_RPM_RATIO: 0.6,
  REVERSE_GEAR_RATIO: 3.4,
} as const;

export interface VehicleSpec {
  id: string;
  name: string;
  bodyClass: 'supercar' | 'sedan' | 'suv' | 'pickup' | 'taxi' | 'police';
  price: number;
  colors: string[];
  color: string;
  topSpeedMs: number;
  gears: number;
  engineRedlineRpm: number;
  engineIdleRpm: number;
  accelMs2: number;
  brakeMs2: number;
  torqueCurveNm: number[];
  peakTorqueNm: number;
  gearRatios: number[];
  finalDrive: number;
  steerRate: number;
  grip: number;
  length: number;
  width: number;
  height: number;
  /** 模型缩放（外部资产统一到米制） */
  modelScale: number;
}

export const VEHICLES: VehicleSpec[] = [
  {
    id: 'coupe',
    name: '概念跑车 VX',
    bodyClass: 'supercar',
    price: 0,
    colors: ['#c8102e', '#0f1720', '#e8e8e8', '#1f6feb', '#f2c94c'],
    color: '#8f1220',
    topSpeedMs: 62,
    gears: 7,
    engineRedlineRpm: 8500,
    engineIdleRpm: 950,
    accelMs2: 17.5,
    brakeMs2: 24,
    torqueCurveNm: [350, 440, 515, 555, 560, 545, 515, 455, 390],
    peakTorqueNm: 560,
    gearRatios: [3.9, 2.6, 1.95, 1.52, 1.25, 1.05, 0.89],
    finalDrive: 3.7,
    steerRate: 3.9,
    grip: 1.15,
    length: 4.45,
    width: 1.85,
    height: 1.24,
    modelScale: 1,
  },
  {
    id: 'police',
    name: '警用拦截车',
    bodyClass: 'police',
    price: 2800,
    colors: ['#f2f2f2', '#1c2530', '#31506b'],
    color: '#f2f2f2',
    topSpeedMs: 56,
    gears: 7,
    engineRedlineRpm: 8000,
    engineIdleRpm: 900,
    accelMs2: 15.5,
    brakeMs2: 22,
    torqueCurveNm: [395, 485, 545, 580, 575, 545, 500, 440, 380],
    peakTorqueNm: 580,
    gearRatios: [3.7, 2.45, 1.85, 1.45, 1.19, 1.0, 0.85],
    finalDrive: 3.7,
    steerRate: 3.7,
    grip: 1.1,
    length: 4.6,
    width: 1.85,
    height: 1.46,
    modelScale: 1,
  },
  {
    id: 'taxi',
    name: '城市出租车',
    bodyClass: 'taxi',
    price: 500,
    colors: ['#e6b800', '#f5f0dc', '#2f6f4f'],
    color: '#e6b800',
    topSpeedMs: 41,
    gears: 5,
    engineRedlineRpm: 6800,
    engineIdleRpm: 850,
    accelMs2: 10.8,
    brakeMs2: 19,
    torqueCurveNm: [210, 255, 285, 305, 310, 300, 275, 250, 215],
    peakTorqueNm: 310,
    gearRatios: [3.3, 2.05, 1.38, 1.0, 0.79],
    finalDrive: 4.1,
    steerRate: 3.2,
    grip: 1.0,
    length: 4.5,
    width: 1.8,
    height: 1.46,
    modelScale: 1,
  },
  {
    id: 'pickup',
    name: '经典皮卡',
    bodyClass: 'pickup',
    price: 900,
    colors: ['#8a6f3f', '#4f6d8c', '#b7b7b7', '#5a3826'],
    color: '#8a6f3f',
    topSpeedMs: 38,
    gears: 6,
    engineRedlineRpm: 5800,
    engineIdleRpm: 750,
    accelMs2: 9.5,
    brakeMs2: 16,
    torqueCurveNm: [475, 540, 570, 580, 555, 510, 470, 425, 380],
    peakTorqueNm: 580,
    gearRatios: [3.9, 2.47, 1.67, 1.24, 1.0, 0.82],
    finalDrive: 3.5,
    steerRate: 2.9,
    grip: 1.05,
    length: 5.2,
    width: 1.9,
    height: 1.78,
    modelScale: 1,
  },
  {
    id: 'suv',
    name: '越野 SUV',
    bodyClass: 'suv',
    price: 1800,
    colors: ['#2f6b3f', '#c98a3d', '#e8e8e8', '#1f3a4d'],
    color: '#2f6b3f',
    topSpeedMs: 42,
    gears: 6,
    engineRedlineRpm: 6200,
    engineIdleRpm: 800,
    accelMs2: 11.0,
    brakeMs2: 18,
    torqueCurveNm: [410, 465, 490, 485, 455, 420, 380, 340, 295],
    peakTorqueNm: 490,
    gearRatios: [3.5, 2.24, 1.55, 1.18, 0.95, 0.78],
    finalDrive: 3.9,
    steerRate: 3.1,
    grip: 1.3,
    length: 4.8,
    width: 1.95,
    height: 1.82,
    modelScale: 1,
  },
  {
    id: 'sedan',
    name: '城市轿车',
    bodyClass: 'sedan',
    price: 0,
    colors: ['#cc3333', '#3568c9', '#e8e8e8', '#333333'],
    color: '#cc3333',
    topSpeedMs: 46,
    gears: 6,
    engineRedlineRpm: 7000,
    engineIdleRpm: 850,
    accelMs2: 13.0,
    brakeMs2: 20,
    torqueCurveNm: [205, 235, 258, 272, 278, 274, 260, 240, 208],
    peakTorqueNm: 278,
    gearRatios: [3.6, 2.19, 1.42, 1.0, 0.78, 0.62],
    finalDrive: 4.06,
    steerRate: 3.4,
    grip: 1.0,
    length: 4.4,
    width: 1.8,
    height: 1.42,
    modelScale: 1,
  },
];

export const DEFAULT_VEHICLE_ID = 'coupe';

export interface TimePreset {
  id: TimeId;
  label: string;
  sunElevationDeg: number;
  sunAzimuthDeg: number;
  sunColor: number;
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  fogColor: number;
  fogDensity: number;
  exposure: number;
  bloom: { threshold: number; strength: number; radius: number };
  envIntensity: number;
  skyColors: {
    zenith: number;
    mid: number;
    horizon: number;
    haze: number;
    ground: number;
    cloud: number;
    sun: number;
  };
  sunGlow: number;
  sunDisc: number;
  haze: number;
  cloudCover: number;
  stars: number;
  lamp: number;
  wetness: number;
  neon: number;
  grade: {
    saturation: number;
    contrast: number;
    vignette: number;
    grain: number;
    ca: number;
    lift: number;
    gain: number;
  };
}

export const TIME_PRESETS: Record<TimeId, TimePreset> = {
  dawn: {
    id: 'dawn',
    label: '清晨',
    sunElevationDeg: 7,
    sunAzimuthDeg: 78,
    sunColor: 0xffd0a8,
    sunIntensity: 1.6,
    hemiSky: 0x9fc0e8,
    hemiGround: 0x4a4038,
    hemiIntensity: 0.9,
    fogColor: 0xc6c9cf,
    fogDensity: 0.0022,
    exposure: 0.86,
    bloom: { threshold: 1.1, strength: 0.42, radius: 0.7 },
    envIntensity: 0.8,
    skyColors: { zenith: 0x2b4370, mid: 0x7c8fae, horizon: 0xf2b184, haze: 0xffd7a8, ground: 0x33302c, cloud: 0xffd9c0, sun: 0xffcf9a },
    sunGlow: 1.0,
    sunDisc: 0.00028,
    haze: 0.5,
    cloudCover: 0.5,
    stars: 0.05,
    lamp: 0.35,
    wetness: 0.3,
    neon: 0.35,
    grade: { saturation: 1.04, contrast: 1.03, vignette: 0.28, grain: 0.02, ca: 0.0008, lift: 0.0, gain: 1.0 },
  },
  day: {
    id: 'day',
    label: '白天',
    sunElevationDeg: 52,
    sunAzimuthDeg: 138,
    sunColor: 0xfff3df,
    sunIntensity: 3.1,
    hemiSky: 0xa8ccf0,
    hemiGround: 0x6d7a5f,
    hemiIntensity: 0.9,
    fogColor: 0xc8d9e6,
    fogDensity: 0.0006,
    exposure: 0.58,
    bloom: { threshold: 1.65, strength: 0.22, radius: 0.5 },
    envIntensity: 0.8,
    skyColors: { zenith: 0x1f5fbf, mid: 0x5f9ee0, horizon: 0xbcd6e9, haze: 0xe6eef6, ground: 0x5d6154, cloud: 0xf7fbff, sun: 0xfff4dd },
    sunGlow: 0.55,
    sunDisc: 0.00012,
    haze: 0.28,
    cloudCover: 0.55,
    stars: 0,
    lamp: 0.04,
    wetness: 0.1,
    neon: 0.08,
    grade: { saturation: 1.03, contrast: 1.02, vignette: 0.22, grain: 0.018, ca: 0.0006, lift: 0.0, gain: 1.0 },
  },
  dusk: {
    id: 'dusk',
    label: '黄昏',
    sunElevationDeg: 5,
    sunAzimuthDeg: 246,
    sunColor: 0xff9a5f,
    sunIntensity: 1.5,
    hemiSky: 0x8a7aa8,
    hemiGround: 0x2b2224,
    hemiIntensity: 0.45,
    fogColor: 0x4a3540,
    fogDensity: 0.0021,
    exposure: 0.9,
    bloom: { threshold: 1.0, strength: 0.55, radius: 0.75 },
    envIntensity: 0.85,
    skyColors: { zenith: 0x232a52, mid: 0x6a4468, horizon: 0xe0794a, haze: 0xf2a562, ground: 0x2a2024, cloud: 0xf0b48a, sun: 0xffb070 },
    sunGlow: 1.15,
    sunDisc: 0.00032,
    haze: 0.62,
    cloudCover: 0.4,
    stars: 0.18,
    lamp: 0.7,
    wetness: 0.45,
    neon: 0.8,
    grade: { saturation: 1.06, contrast: 1.04, vignette: 0.32, grain: 0.025, ca: 0.0012, lift: 0.0, gain: 1.02 },
  },
  night: {
    id: 'night',
    label: '夜间',
    sunElevationDeg: -12,
    sunAzimuthDeg: 246,
    sunColor: 0x9ab8ff,
    sunIntensity: 0.18,
    hemiSky: 0x22344f,
    hemiGround: 0x05080c,
    hemiIntensity: 0.22,
    fogColor: 0x080d15,
    fogDensity: 0.0024,
    exposure: 1.15,
    bloom: { threshold: 1.15, strength: 0.32, radius: 0.7 },
    envIntensity: 0.7,
    skyColors: { zenith: 0x03060c, mid: 0x081120, horizon: 0x16273e, haze: 0x1d3149, ground: 0x04060a, cloud: 0x1e2b3f, sun: 0xa8c0ff },
    sunGlow: 0.22,
    sunDisc: 0.0004,
    haze: 0.18,
    cloudCover: 0.25,
    stars: 1,
    lamp: 1,
    wetness: 0.75,
    neon: 1.15,
    grade: { saturation: 1.08, contrast: 1.07, vignette: 0.4, grain: 0.032, ca: 0.0016, lift: 0, gain: 1.04 },
  },
};

export const TIME_ORDER: TimeId[] = ['dawn', 'day', 'dusk', 'night'];

export const CAMERA = {
  fov: 66,
  near: 0.15,
  far: 3200,
  chaseDistance: 7.2,
  chaseHeight: 2.35,
  chaseLookAhead: 6,
  chaseLookHeight: 1.05,
  chaseStiffness: 6.5,
  hoodFov: 82,
  cockpitFov: 78,
  cockpitForward: 0.06,
  cockpitLateral: -0.34,
  cockpitHeightRatio: 0.82,
  orbitDistance: 12,
  orbitHeight: 3.2,
  speedFovGain: 14,
  shakeDecay: 6,
} as const;

export const ECONOMY = {
  raceRewards: [300, 200, 150],
  raceOtherReward: 100,
  raceDnfReward: 60,
  killReward: 5,
  distanceCoinPerKm: 2,
  checkInCap: 300,
  checkInStep: 50,
} as const;
