/**
 * GLB 层级探针：打印节点树、局部变换、网格三角数与材质，用于 rig 规划。
 * 用法：node tools/glb-tree.mjs <file.glb> [--filter Wheel]
 */
import { readFileSync } from 'node:fs';

const file = process.argv[2];
const filter = process.argv.includes('--filter')
  ? process.argv[process.argv.indexOf('--filter') + 1]
  : null;
if (!file) {
  console.error('usage: node tools/glb-tree.mjs <file.glb> [--filter name]');
  process.exit(1);
}

const buf = readFileSync(file);
let offset = 12;
let g = null;
const total = buf.readUInt32LE(8);
while (offset < total) {
  const len = buf.readUInt32LE(offset);
  const type = buf.readUInt32LE(offset + 4);
  if (type === 0x4e4f534a) g = JSON.parse(new TextDecoder().decode(buf.subarray(offset + 8, offset + 8 + len)));
  offset += 8 + len + ((4 - (len % 4)) % 4);
}

const nodes = g.nodes ?? [];
const parentOf = new Map();
nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parentOf.set(c, i)));
const roots = nodes.map((_, i) => i).filter((i) => !parentOf.has(i));

const fmt = (v) => (v ? v.map((x) => +x.toFixed(3)).join(',') : '-');
const triCount = (meshIndex) => {
  const mesh = g.meshes[meshIndex];
  return (mesh?.primitives ?? []).reduce((sum, p) => {
    const acc = p.indices != null ? g.accessors[p.indices] : null;
    return sum + (acc ? acc.count / 3 : 0);
  }, 0);
};

function walk(index, depth) {
  const n = nodes[index];
  const name = n.name ?? `node${index}`;
  if (filter && !name.toLowerCase().includes(filter.toLowerCase())) {
    for (const c of n.children ?? []) walk(c, depth);
    return;
  }
  const mesh = n.mesh != null ? g.meshes[n.mesh] : null;
  const mats = mesh ? new Set((mesh.primitives ?? []).map((p) => g.materials?.[p.material]?.name)) : null;
  console.log(
    `${'  '.repeat(depth)}${name}` +
      (mesh ? `  [tris=${Math.round(triCount(n.mesh))} mats=${[...mats].join('|')}]` : '') +
      `  t=${fmt(n.translation)} r=${fmt(n.rotation)} s=${fmt(n.scale)}`,
  );
  for (const c of n.children ?? []) walk(c, depth + 1);
}

for (const r of roots) walk(r, 0);
