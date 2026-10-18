/**
 * GLB 结构探针：不依赖 three，直接读 JSON chunk，用于资产门禁与 rig 规划。
 * 用法：node tools/inspect-glb.mjs <file.glb>
 */
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('usage: node tools/inspect-glb.mjs <file.glb>');
  process.exit(1);
}

const buf = readFileSync(file);
if (buf.readUInt32LE(0) !== 0x46546c67) {
  console.error('not a glb');
  process.exit(1);
}
const total = buf.readUInt32LE(8);
let offset = 12;
let json = null;
while (offset < total) {
  const chunkLen = buf.readUInt32LE(offset);
  const chunkType = buf.readUInt32LE(offset + 4);
  const data = buf.subarray(offset + 8, offset + 8 + chunkLen);
  if (chunkType === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(data));
  offset += 8 + chunkLen + ((4 - (chunkLen % 4)) % 4);
}

const g = json;
const prims = (g.meshes ?? []).flatMap((m) => m.primitives ?? []);
const tris = prims.reduce((sum, p) => {
  const acc = p.indices != null ? g.accessors[p.indices] : null;
  return sum + (acc ? acc.count / 3 : 0);
}, 0);
const posAccessors = prims.map((p) => g.accessors[p.attributes.POSITION]).filter(Boolean);
const bbox = posAccessors.reduce(
  (acc, a) => {
    if (!a.min || !a.max) return acc;
    for (let i = 0; i < 3; i += 1) {
      acc.min[i] = Math.min(acc.min[i], a.min[i]);
      acc.max[i] = Math.max(acc.max[i], a.max[i]);
    }
    return acc;
  },
  { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] },
);

console.log(JSON.stringify({
  file,
  bytes: buf.length,
  generator: g.asset?.generator,
  extensionsUsed: g.extensionsUsed ?? [],
  nodes: (g.nodes ?? []).map((n) => n.name).filter(Boolean),
  meshes: (g.meshes ?? []).map((m) => m.name),
  materials: (g.materials ?? []).map((m) => m.name),
  images: (g.images ?? []).length,
  primitives: prims.length,
  triangles: Math.round(tris),
  bbox: {
    min: bbox.min.map((v) => +v.toFixed(3)),
    max: bbox.max.map((v) => +v.toFixed(3)),
    size: bbox.max.map((v, i) => +(v - bbox.min[i]).toFixed(3)),
  },
}, null, 2));
