import { MaterialLibrary } from '../render/Materials';

/** 全局材质库（单例，避免各处重复生成 canvas 贴图） */
export const MATERIALS = new MaterialLibrary();
