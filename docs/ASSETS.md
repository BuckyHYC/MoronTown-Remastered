# 资产清单与许可

> 规则：只接受 **CC0 / CC BY / CC BY-SA**；拒绝 NC、个人使用、来源不明、拆包游戏资产。
> 每个资产必须登记：来源、作者、许可、引用链接、SHA-256、三角面、纹理预算。
> 运行期资产放在 `public/assets/`（离线可用）；原始下载放 `assets/raw/`（gitignore）。

## 已入库

| id | 文件 | 类型 | 许可 | 三角面 | 大小 | SHA-256 |
|---|---|---|---|---|---|---|
| car-concept | `public/assets/models/car-concept.glb` | 概念跑车（含内饰 / 材质变体 / AO） | **CC BY 4.0** | 213,347 | 11.8 MB | `C272098089D78C5CD9FD9F24FF50EE8ACF8D932C55F2D55FC10ADB6C8998966B` |

来源：Khronos `glTF-Sample-Assets` → `Models/CarConcept/glTF-Binary/CarConcept.glb`
<https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept>
作者：Eric Chadwick（模型/贴图），Darmstadt Graphics Group GmbH；原始模型由 Unity Fan 以公有领域（CC0）发布。

结构要点（`node tools/inspect-glb.mjs` / `node tools/glb-tree.mjs` 可复现）：

- 已按 glTF 规范 Y-up：车长沿 Z、宽沿 X、高沿 Y；装载器会用车顶薄板自动判定朝向，避免重复旋转。
- 四个车轮为 `WheelFrontL/R`、`WheelRearL/R` 组（内含轮辋/刹车盘/卡钳），轮胎是同级未命名网格，装载时按包围盒中心就近归入枢轴。
- 材质槽 29 个，车漆为 `Paint 1/2 Carmine|Pearl|Graphite`（KHR_materials_variants），玻璃 `Glass`，灯 `Headlight/Brakelight/Signallight`。

## 待接入（第二阶段）

| 需求 | 候选 | 状态 |
|---|---|---|
| 轿车 / SUV / 皮卡 / 出租 / 警用 造型 | Sketchfab「可下载 + CC0」筛选，逐个核实许可后入库 | 未开始 |
| 行人 / 驾驶员骨骼角色 | Quaternius CC0 角色包（需核实具体包许可） | 未开始 |
| 天空 / IBL | 当前全部程序化（无需外部 HDRI） | 已完成（程序化） |
| 地面 / 立面贴图 | 当前全部 canvas 程序化；如需细节图用 ambientCG（CC0） | 可选 |

## 明确排除

| 候选 | 原因 |
|---|---|
| three.js `examples/models/gltf/ferrari.glb` | 来源 Sketchfab 模型页已被下架，许可无法核实 |
| Khronos 旧仓库 `Buggy` | README 未声明许可 |
| 任何 Forza / Gran Turismo / 手游拆包模型 | 版权风险，禁止 |

## 优化管线（待 M2 完成）

```bash
node tools/fetch-assets.mjs        # 校验 sha256，缺失才下载
npx @gltf-transform/cli optimize   # prune / dedupe / weld / meshopt
npx @gltf-transform/cli simplify   # 生成 LOD1 / LOD2（AI 交通用）
```

验收：主车 ≤ 150k 三角、材质槽 ≤ 16；交通 LOD2 ≤ 8k 三角、≤ 4 材质槽。
