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

         // ---- 上部立面：2.05m × 3.05m 窗格 ----
         vec2 g = vec2(along / 2.05, (height - 4.6) / 3.05);
         vec2 id = floor(g);
         vec2 f = fract(g);
         float inX = smoothstep(0.03, 0.1, f.x) * smoothstep(0.97, 0.9, f.x);
         float inY = smoothstep(0.03, 0.09, f.y) * smoothstep(0.97, 0.91, f.y);
         gWindow = inX * inY * step(0.5, 1.0 - gGround);

         float rnd = reHash(id);
         float lit = step(0.56, rnd);
         vec3 warm = vec3(1.0, 0.78, 0.5);
         vec3 cool = vec3(0.78, 0.87, 1.0);
         vec3 interior = mix(warm, cool, step(0.62, fract(rnd * 13.7)));
         float brightness = lit * (0.5 + 0.5 * reHash(id + 17.0));

         // 窗框：比墙面更亮一点，形成「框线」
         float frame = (1.0 - (inX * inY)) * step(0.5, 1.0 - gGround);
         vec3 wall = diffuseColor.rgb;
         wall = mix(wall, wall * 1.16, frame * 0.9);

         // 楼层腰线
         float floorLine = smoothstep(0.045, 0.0, abs(f.y - 0.015));
         wall *= 1.0 + floorLine * 0.16;

         // 窗玻璃：偏冷 + 纵向渐变（上亮下暗），留出一点天光反射
         vec3 glass = mix(vec3(0.035, 0.042, 0.055), vec3(0.12, 0.14, 0.175), smoothstep(0.1, 0.9, f.y));
         wall = mix(wall, glass, gWindow * (1.0 - gGround));

         // ---- 底层商铺：3.4m 开间，大面积橱窗 ----
         vec2 sg = vec2(along / 3.4, height / 4.6);
         vec2 sid = floor(sg);
         vec2 sf = fract(sg);
         float shopInX = smoothstep(0.05, 0.12, sf.x) * smoothstep(0.95, 0.88, sf.x);
         float shopInY = smoothstep(0.16, 0.24, sf.y) * smoothstep(0.98, 0.9, sf.y);
         gShop = shopInX * shopInY * gGround;
         float shopLit = step(0.42, reHash(sid + 3.7));
         vec3 shopGlass = mix(vec3(0.045, 0.04, 0.035), vec3(0.1, 0.085, 0.06), sf.y);
         wall = mix(wall, shopGlass, gShop * 0.9);
         // 商铺立柱
         wall = mix(wall, wall * 0.55, gGround * (1.0 - shopInX) * 0.6);

         diffuseColor.rgb = wall;

         totalEmissiveRadiance += gWindow * brightness * uNight * interior * 1.15;
         totalEmissiveRadiance += gShop * shopLit * uNight * vec3(1.0, 0.7, 0.4) * 0.5;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
         roughnessFactor = mix(roughnessFactor, 0.08, gWindow);
         roughnessFactor = mix(roughnessFactor, 0.14, gShop * 0.8);`,
      );
  };
  material.customProgramCacheKey = () => 'facade-v2';
  return material;
}
