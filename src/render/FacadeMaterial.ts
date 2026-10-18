import * as THREE from 'three';

/**
 * 程序化立面材质：世界坐标窗格 + 窗框 + 楼层线 + 底层商铺橱窗 + 夜间亮灯。
 * 窗户的 roughness 被压到 0.08，让 IBL 反射出天空/街景，避免「黑色窗洞」。
 */
export function createFacadeMaterial(uniforms: { uNight: { value: number } }): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.82,
    metalness: 0.04,
    envMapIntensity: 0.7,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = uniforms.uNight;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vFacadePos;
         varying vec3 vFacadeNormal;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
         vec4 facadeWorld = vec4(transformed, 1.0);
         #ifdef USE_INSTANCING
           facadeWorld = instanceMatrix * facadeWorld;
         #endif
         facadeWorld = modelMatrix * facadeWorld;
         vFacadePos = facadeWorld.xyz;
         vFacadeNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vFacadePos;
         varying vec3 vFacadeNormal;
         uniform float uNight;
         float gWindow = 0.0;
         float gShop = 0.0;
         float gGround = 0.0;
         float reHash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
         vec3 fNormal = normalize(vFacadeNormal);
         float along = abs(fNormal.x) > abs(fNormal.z) ? vFacadePos.z : vFacadePos.x;
         float height = vFacadePos.y;

         gGround = step(height, 4.6);

         // ---- 上部立面：3.3m 层高 × 1.75m 柱距的带形窗 ----
         float floorH = 3.3;
         float bayW = 1.75;
         vec2 g = vec2(along / bayW, (height - 4.6) / floorH);
         vec2 id = floor(g);
         vec2 f = fract(g);
         float upper = 1.0 - gGround;
         float inX = smoothstep(0.075, 0.105, f.x) * smoothstep(0.925, 0.895, f.x);
         float inY = smoothstep(0.2, 0.24, f.y) * smoothstep(0.72, 0.68, f.y);
         gWindow = inX * inY * upper;
         float bayRnd = reHash(id);
         float floorRnd = reHash(vec2(id.y * 1.37, 3.1));
         // 亮灯按「整层成片 + 单窗稀疏」两层随机，避免满墙均匀白点
         float lit = step(0.6, bayRnd) * mix(0.28, 1.0, step(0.46, floorRnd));
         vec3 warm = vec3(1.0, 0.74, 0.42);
         vec3 cool = vec3(0.72, 0.84, 1.0);
         vec3 interior = mix(warm, cool, step(0.54, fract(bayRnd * 13.7)));
         float brightness = lit * (0.3 + 0.7 * reHash(id + 17.0));

         // 窗间墙压暗、层间腰线更暗，形成水平层带
         float spandrel = 1.0 - inY;
         vec3 wall = diffuseColor.rgb;
         wall *= 1.0 - spandrel * upper * 0.18;
         wall *= 1.0 - upper * 0.1;
         // 柱距级色差：同栋楼左右开间略有深浅，打破大面积平涂
         wall *= mix(1.0, 0.9 + 0.18 * reHash(vec2(id.x, -2.4)), upper);
         float floorLine = smoothstep(0.05, 0.0, abs(f.y - 0.03));
         wall = mix(wall, wall * 0.72, floorLine * upper);
         float mullion = (1.0 - smoothstep(0.0, 0.03, abs(f.x - 0.5))) * inY;
         float reveal = smoothstep(0.02, 0.0, abs(f.x - 0.895)) + smoothstep(0.02, 0.0, abs(f.x - 0.105));
         wall = mix(wall, wall * 0.55, clamp(reveal, 0.0, 1.0) * upper * 0.5);

         // 玻璃：冷色 + 竖向渐变 + 逐窗抖动；白天叠一点天空反射色
         vec3 glass = mix(vec3(0.022, 0.028, 0.04), vec3(0.075, 0.09, 0.115), smoothstep(0.2, 0.95, f.y));
         glass += (reHash(id + 5.3) - 0.5) * 0.022;
         vec3 skyTint = vec3(0.42, 0.52, 0.66) * (1.0 - smoothstep(0.1, 0.8, uNight));
         glass += skyTint * 0.16;
         wall = mix(wall, glass, gWindow);
         wall = mix(wall, wall * 0.62, mullion * upper);
         // ---- 底层商铺：3.4m 开间，大面积橱窗 ----
         vec2 sg = vec2(along / 3.4, height / 4.6);
         vec2 sid = floor(sg);
         vec2 sf = fract(sg);
         float shopInX = smoothstep(0.05, 0.12, sf.x) * smoothstep(0.95, 0.88, sf.x);
         float shopInY = smoothstep(0.22, 0.3, sf.y) * smoothstep(0.98, 0.9, sf.y);
         gShop = shopInX * shopInY * gGround;
         float shopLit = step(0.42, reHash(sid + 3.7));
         vec3 shopGlass = mix(vec3(0.04, 0.037, 0.033), vec3(0.09, 0.078, 0.058), sf.y);
         wall = mix(wall, shopGlass, gShop * 0.9);
         wall = mix(wall, wall * 0.52, gGround * (1.0 - shopInX) * 0.65);
         wall *= 1.0 - smoothstep(0.1, 0.02, abs(sf.y - 0.06)) * gGround * 0.25;

         diffuseColor.rgb = wall;

         // 夜间室内灯：窗带内带一点百叶明暗
         float blinds = 0.82 + 0.18 * sin(f.x * 26.0 + bayRnd * 6.28);
         totalEmissiveRadiance += gWindow * brightness * uNight * interior * blinds * 0.8;
         totalEmissiveRadiance += gWindow * skyTint * 0.07;
         totalEmissiveRadiance += gShop * shopLit * uNight * vec3(1.0, 0.7, 0.4) * 0.45;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
         roughnessFactor = mix(roughnessFactor, 0.08, gWindow);
         roughnessFactor = mix(roughnessFactor, 0.14, gShop * 0.8);`,
      );
  };
  material.customProgramCacheKey = () => 'facade-v3';
  return material;
}
