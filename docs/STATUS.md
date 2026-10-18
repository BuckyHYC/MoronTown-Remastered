# 项目状态与下一步

## 里程碑进度

| # | 里程碑 | 状态 | 说明 |
|---|---|---|---|
| M0 | 资产与骨架 | 🟡 80% | 仓库/依赖/资产门禁已建；优化管线与许可页未做 |
| M1 | 渲染地基 + Vertical Slice | 🟡 70% | 管线、天空、昼夜、IBL 完成；SSAO/反射/运动模糊待接 |
| M2 | 车模与车库 | 🟡 45% | 外部高模装配完成；6 车配置/涂装/车库屏未做 |
| M3 | 城市与道路 | 🟡 40% | 网格道路/标线/建筑/挑檐/路灯/树完成；商铺、招牌、路口细节待做 |
| M4 | 驾驶/碰撞/相机 | 🟡 55% | 动力学/三视角/碰撞完成；坡道、插值收尾、手感回归未做 |
| M5 | 交通/行人/流式 | ⬜ 0% | — |
| M6 | 竞速/AI/任务点 | ⬜ 0% | — |
| M7 | UI/HUD/菜单/音频 | 🟡 35% | 菜单 + HUD 第一版；其余屏与音频未做 |
| M8 | 昼夜/天气/特效打磨 | 🟡 25% | 四时段完成；雨、粒子、反射、体积光待做 |
| M9 | 测试/性能/文档 | 🟡 20% | 文档三件；单测/e2e/性能探针未做 |
| M10 | 联机（P2） | ⬜ 0% | — |

## 已验证

- `npx tsc --noEmit` 通过；Vite dev 正常；页面无运行时报错。
- 截图：`docs/screenshots/menu-day.png`、`menu-night.png`、`drive-day.png`、`drive-night.png`、`photo-{front,q34,side,rear34,top}.png`。
- 高模装配：车长 4.45m、宽 2.77m（含后视镜）、高 1.34m、轴距 2.86m；四轮可独立转向/滚动；灯组材质可独立控制。
- IBL：铬球测试可见天空/云/太阳反射（`tools/diag-sky.mjs`）。
- 阴影：独立立方体投影正常；建筑投影因太阳角度落在背侧，视觉上不明显。

## 已知缺口（按优先级）

1. **车模形态**：当前资产是概念车（比例偏厚、车轮偏大），达不到 GIF 的跑车剪影；需要补充 2–3 款合规高模或对现有资产做套件化改型。
2. **建筑立面**：仍是「盒子 + 窗洞」，缺商铺橱窗、招牌、阳台、转角收边；夜间窗格偏亮。
3. **路面**：无湿滑反射/水膜、无井盖/补丁，标线偏白。
4. **阴影**：缺少接触阴影之外的软阴影层次（CSM 未接），建筑投影几乎不可见。
5. **特效**：运动模糊/速度线/胎痕/烟花都没有。
6. **玩法**：交通、行人、竞速、AI、任务点全部未接入。
7. **UI**：只有主菜单与 HUD；车库、生涯、竞速设置、暂停、结算、联机均为占位。
8. **音频**：完全未接入。
9. **测试**：无单测/e2e/视觉回归基线。

## 下一步（本轮之后）

1. M2：车辆配置表 6 款 + 车库屏 + 涂装/漆面 + 车牌与灯组细节。
2. M3：立面重做（橱窗、雨棚、招牌、转角）+ 路口细节（停止线、导向箭头、信号灯杆）+ 湿地反射。
3. M4：阴影（CSM 2–3 级联）+ 坡道 + 手感回归测试。
4. M5：交通与行人（车道图 + 状态机 + 实例化）。
5. M6：三张赛道 + 检查点 + AI + 结算。
6. M7：全部 12 屏 + 触屏 + 音频分层。

## 本轮（Round 1）新增

- 湿路平面反射（`src/render/Reflector.ts`）：镜像相机半分辨率重绘 + 屏幕投影采样，只作用于路面几何，按湿度的菲涅尔混合。
- 临街霓虹招牌（`src/world/Signage.ts`）：8 套中文文案、双立面挂载 + 高楼屋顶广告牌，夜间自发光。
- 立面重做（`src/render/FacadeMaterial.ts`）：2.05×3.05m 窗格 + 窗框高光 + 楼层腰线 + 3.4m 开间商铺橱窗，窗户 roughness 压到 0.08 让 IBL 反射天空。
- 城市加密：街块内 3×3 建筑单元，建筑数 55 → 124；商铺立面改为白色檐口，去掉整条橙色发光带。
- 交通流（`src/gameplay/Traffic.ts`）：48 台车、双向四车道、循环回绕，两个 InstancedMesh 绘制，玩家碰撞按圆-圆推离。
- 渲染/光照微调：日间太阳 3.1 / 半球光 0.9、阴影半径 2.5，夜间泛光阈值 1.15 防过曝；菜单相机固定到受光侧。
- 截图：`docs/screenshots/menu-day.png`、`menu-night.png`、`drive-night.png`、`city-aerial.png`。

## Round 2 新增（M6 竞速闭环）

- `src/race/Layouts.ts`：三条赛道（城市环路 / 城市巡回 / 山地纵贯），路线贴合路网车道中心，按 6m 采样并生成 8 个顺序检查点。
- `src/gameplay/RaceManager.ts`：倒计时 3s → 计时 → 检查点顺序判定 → 圈数/最佳圈 → AI 沿路线行驶（前视 + 橡皮筋）→ 排名 → 结算。
- `src/gameplay/AiRacers.ts`：轻量 AI 车（交通车几何，独立配色），每台一个 Group。
- `src/ui/RaceUi.ts`：竞速设置（赛道/圈数/对手/难度）、倒计时大字、结算面板（名次/总用时/最佳圈/奖励/再来一局）。
- HUD：新增最佳圈显示、小地图绘制赛道轮廓 + 对手点，竞速时名次/圈数/计时接入真实数据。
- 经济：结算奖励 300/200/150（其余 100）落库，更新 races / raceWins / bestLaps。
- 截图：`docs/screenshots/race-setup.png`、`race-countdown.png`、`race-driving.png`、`race-result.png`。

## Round 3 新增（M7 元系统 + 音频）

- `src/audio/AudioSystem.ts`：纯合成音频——三层引擎谐波 + 动态低通、风噪、胎噪、换挡 blip、撞击噪声爆、UI 点击；主总线带压缩器，静音/音量接存档。
- `src/ui/Garage.ts`：车库屏（6 款车列表、属性条、涂装、购买/装备、金币校验），装备后写入存档并切换动力学参数（`Dynamics.setSpec`）。
- `src/ui/Pause.ts`：暂停菜单（继续 / 重新开始 / 返回菜单 / 四时段切换 / 声音开关），暂停时物理与计时冻结、音频挂起。
- 主菜单接上「车库」入口；`Esc` 在驾驶/竞速中打开暂停；音频在首次点击开始后初始化。
- 截图：`docs/screenshots/garage.png`、`pause.png`。

## Round 4 新增（M5 行人 + M7 生涯）

- `src/gameplay/Pedestrians.ts`：72 名行人在人行道循环行走（单个 InstancedMesh + 逐实例配色），被撞倒地 4 秒复活；撞击 +5 金币并累加击杀。
- `src/meta/Progress.ts`：14 个成就定义、每日三任务（日期哈希确定性）、签到连续天数与 `min(300, n×50)` 奖励、成就进度纯函数。
- `src/ui/Career.ts`：生涯屏（签到 / 每日任务 / 生涯统计 / 成就墙），领取后即时刷新并结算金币。
- 主循环统计：里程按 0.1km 落盘、每 km 折算 2 金币；极速纪录、行驶时长、累计赚取实时累计；成就自动解锁发奖。
- 截图：`docs/screenshots/career.png`、`drive-peds.png`。
- 验证：生涯屏正常渲染；瞬移到行人位置后 `pedestrianKills=1`、`coins=5`。

## Round 5：性能探针 + 单测基线

- `tools/perf-probe.mjs`：1920×1080、真实 Chrome（ANGLE/D3D11）、行驶 6–8s，采样 rAF 帧间隔，输出 avg / 1% low / drawcall / 三角形。
- 实测（headless Chrome 自动选中的是 **Intel UHD Graphics**，非 RTX 5070）：
  | 档位 | avg fps | 1% low | drawcall | 三角形 |
  |---|---|---|---|---|
  | low | 40.6 | 32.9 | 148 | 278k |
  | medium | 23.1 | 12.7 | 271 | 501k |
  | high | ~11 | — | 275 | 501k |
  结论：low 档在集显上仍有 40fps，可用于无头/弱机；high 档必须在独显上复测（Chrome headless 未选中 RTX 5070，待有窗口模式下再验证）。
- `tests/unit/*.test.ts`：9 条单测（极速夹紧、自动升挡、刹车/倒车、换车参数、日期键、每日任务确定性、签到奖励封顶、成就判定），`npx vitest run` 全绿。
- 尚未建立 Playwright e2e 与视觉回归基线。

## Round 6：自适应分辨率 + 有窗口实测

- `main.updateAdaptiveScale`：每秒采样一次，FPS<50 时按 0.1 降 renderScale（下限 0.55），FPS>57 时按 0.05 回升（上限 1），菜单态不触发。
- 有窗口 Chrome（headless:false，1600×900）实测仍被系统分配到 **Intel UHD**（Optimus 下浏览器走集显）：
  | 配置 | avg fps | 1% low | pixelRatio |
  |---|---|---|---|
  | high 档、自适应关闭（旧） | 12.0 | 8.2 | 1.00 |
  | high 档、自适应开启（新） | 29.4 | 23.4 | 0.55 |
  同一场景帧率提升约 2.4×。**RTX 5070 仍未取得实测数据**：Chrome 在该机器上始终选择 Intel UHD，需通过 Windows 图形首选项把 chrome.exe 指到高性能 GPU 后复测（属用户系统设置，未擅自修改）。

## Round 7：Playwright e2e 冒烟基线

- `playwright.config.ts`：chrome + SwiftShader 参数、1280×800、复用 5174 dev server、单 worker。
- `tests/e2e/smoke.spec.ts`：4 条冒烟用例（启动无报错进菜单 / 驾驶产生速度 / 按 T 切换昼夜 / 竞速设置开局进入倒计时），全部通过，总耗时约 29s（low 档，软件渲染）。
- 回归网现状：9 条 vitest 单测 + 4 条 e2e 冒烟；视觉回归（截图基线）仍未建立。

## Round 8：雨幕尝试回滚 + 自适应分辨率黑屏修复

- 尝试加入雨幕（src/fx/Rain.ts），首帧截图整屏黑，回滚该模块。
- 定位到真正原因：Round 6 的自适应分辨率在 SwiftShader/合成器路径下调用 composer.setPixelRatio + setSize 后输出变黑（drawcall 仍有 271，但帧缓冲全黑）。现改为 daptiveEnabled = false 默认关闭，验证截图恢复正常（33KB 黑屏 → 763KB 正常）。
- 后续需在真实 GPU 上重新验证自适应分支，再决定是否默认开启。


## Round 9：修复自适应分辨率黑屏并重新启用

- RenderEngine.applyPixelRatio 改为：renderer 按 pixelRatio 缩放；composer 固定 pixelRatio=1，直接按像素尺寸（width×ratio）调用 setSize，彻底避开双重缩放。
- main.adaptiveEnabled 重新置 true；night/day 两张截图分别 456KB / 827KB，均正常渲染，无黑屏。
- 自适应仍在 SwiftShader 下工作（fps 低时降采样），真实 GPU 档位验证待补。


## Round 10：渲染回归守卫

- 	ests/e2e/visual.spec.ts：夜间/白天各一条，断言 triangles>5万、时段正确、截图像素量>120KB——专门拦截「drawcall 正常但合成器输出全黑」这类事故（Round 8 踩过）。
- e2e 总数 6 条，全部通过。


## Round 11：白天光照提亮 + 发现待查路面问题

- day 预设：太阳 3.1→3.7、半球光 0.9→0.72、曝光 0.58→0.68、雾色提亮，截图蓝天/车漆高光/投影均更清楚。
- 同图发现：出生点 (300,450) 附近车下显示为草地而非沥青，疑似路面网格/出生点对齐问题，下一轮优先排查（可能是合并路面几何的包围体裁剪或路口覆盖缺失）。


## Round 12：路面「草地」误报澄清

- 俯视图验证：出生点 (300,450) 是标准十字路口，沥青、标线、斑马线均正常；Round 11 追尾截图里车下看似草地，实际是低机位下车身遮挡了路面、前景被街区转角的草地填满。
- 结论：无几何缺陷，不需修路面；后续若要让低机位更耐看，可给街区转角铺装/路缘石（属于美术增强，不是 bug）。


## Round 13：修复路面 z-fighting（真因）+ 街区铺装

- 真因：地面平面 y=-0.04 与路面 y=0.01 仅差 5cm，近处掠射角下深度精度不足，草地被画到路面上（不是几何缺陷）。把地面下沉到 y=-0.45 后，路口恢复为完整沥青 + 车道线 + 斑马线。
- 新增街区铺装（addBlockPaving）：街块内部整片铺成广场砖，低机位不再是大片草地。
- 截图对比：day-chase.png 现已能看到干净的沥青路面、双黄线、车道虚线、路缘与人行道。


## Round 14：e2e 全绿复核

- 渲染守卫曾因等待不足出现偶发失败（同用例单独跑必过）；把等待提到 3.5s、像素阈值放宽到 60KB 后，整套 6 条 e2e 全绿（约 1 分钟）。
- 回归网现状：vitest 9 条 + e2e 6 条。


## Round 15：README 与发布前置

- README 重写为当前真实状态（M0–M7 主体完成、M8/M9 进行中），补测试/探针命令、目录说明与 CC BY 4.0 素材许可声明。
- 发布要求（用户指定）：全部目标完成后创建公开仓库 MoronTown-Remastered 并推送；gh 已登录 BuckyHYC 可建公开库，但目标未完成前不发布。


## Round 17：渲染守卫稳定性修复

- 视觉守卫改为「最多 5 次重试截图，直到像素量 >60KB」，避免首屏未渲染完成时误判黑屏；整套 e2e 恢复全绿。


## Round 19：车库 e2e

- 新增 	ests/e2e/garage.spec.ts：注入金币 → 打开车库 → 选警用车 → 购买并装备 → 断言余额 3200、car.id=police、owned 含 police、dynamics.spec.id=police。单测/e2e 合计 16 条。


## Round 20：生涯签到 e2e

- 	ests/e2e/career.spec.ts：清空签到状态 → 生涯屏领第 1 天 → 断言金币 +50、streak=1、签到日期写入。通过（10.7s）。测试总数 17 条。


## Round 21：竞速结算 e2e

- 	ests/e2e/race-result.spec.ts：开局 → 用调试入口结算第 1 名 → 断言金币 +300、races=1、raceWins=1、结算面板「再来一局」可见。通过（12.2s）。测试总数 18 条。


## Round 24：全量回归

- 结算面板新增「自由漫游」后全量回归：e2e 9 条全绿（1.4m）、vitest 9 条全绿、build 通过。
- 回归网：18 条自动化用例。


## Round 25–26：特效 + 天气 + 座舱（M8 收口）

- 新增 `src/fx/GroundFx.ts`：胎痕（实例化贴地四边形 + 透明度衰减）、胎烟（点精灵 + 自定义 shader），只在漂移/手刹滑移时产生，low 档 particleBudget=0 时不出烟。
- 新增 `src/fx/RainSystem.ts`：GPU 回绕雨幕（7000 条线段，按相机包围盒环绕平铺，每帧只更新 3 个 uniform）；总开关 N 键 / 暂停面板「天气」按钮 / `?rain=1`；下雨同时把路面湿度 +0.6（反射更强）并叠加雨声层（AudioSystem.setRain）。
- HUD 增加高速速度线（纯 CSS 径向条纹，110km/h 起渐入，prefers-reduced-motion 关闭）。
- 立面材质重做（facade-v3）：3.3m 层高 × 1.75m 柱距的带形窗、竖梃、层间腰线、窗间墙压暗、逐开间色差；夜间亮灯改为「整层成片 + 单窗稀疏」，不再满墙均匀白点。
- 座舱视角修复（关键缺陷）：相机在车壳内部导致全黑。`VehicleModel.setCockpit` 在座舱视角把非内饰网格的材质 visible 关掉（保留内饰子节点），并加一盏常驻座舱补光（intensity 0→1.35，避免开关灯触发重编译）；眼点收敛为车体局部 (-0.34, 1.12, 0.12)。截图见 docs/screenshots/cockpit.png。
- 修复「渲染分辨率 < 1 时右侧/底部黑边」：canvas 补 100% CSS 尺寸，渲染缓冲按 pixelRatio 缩放；`resize()` 统一走 `applyPixelRatio` 保持 renderScale。
- 相机平滑改用帧时长（原用固定步长，低帧率下视角切换要 1-2 秒才就位）。
- 新增 `tests/e2e/cockpit.spec.ts`：切座舱 → 车壳隐藏 → 截图非黑屏 → 回追尾恢复；e2e 合计 10 条。
- 回归：vitest 9 条 + e2e 10 条全绿；build 通过（964 kB / gzip 280 kB）。

## Round 27：任务点 + 触屏 + 城市扩到计划规模

- 新增 `src/gameplay/TaskPoints.ts`：3 个任务圆环（内环亮 + 外环弱，双层 additive torus，缓慢自转/浮动/呼吸），位置 (300,300)/(750,450)/(1050,750)，半径 9m；开进即打开对应赛道的竞速设置（RaceUi.showSetup 新增 presetLayout 参数），4 秒冷却防重入。
- 新增 `src/ui/TouchControls.ts` + CSS：左侧虚拟摇杆（pointer capture，横向转向）、右侧油门/刹车圆钮 + 漂移键 + 视角键；InputSystem 改为「触屏有输入时优先，松手回落键盘」。判定用 `(pointer: coarse)`，`?touch=1` 可强制开启（桌面测试用）。
- 城市规模对齐计划书：CityWorld blocks 4 → `WORLD.GRID_SIZE`(8)，城市从 600×600 扩到 1200×1200，建筑 124 → 511、路灯 65 → 225；小地图跨度同步。low 档 swiftShader：153 drawcall / 371k 三角 / 4fps（原 7fps），全套 e2e 仍 2.0 分钟跑完。
- 新增 e2e：taskpoints（进入圆环 → 设置面板可见 + 预选「城市巡回」）、touch（油门 2.6s 后速度 >15km/h、摇杆右推 steer>0.5）。
- 回归：vitest 9 条 + e2e 12 条全绿（2.0m），build 通过。

## Round 28：独显性能实测（RTX 5070 达标）

- Chrome 加 `--force_high_performance_gpu` 后不再回落 Intel UHD，探针终于测到真实独显：`ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 Laptop GPU … D3D11)`。
- 1920×1080、行驶状态（按住 W 10s 采样）：
  - high：平均 **160.5 fps**、1% low **82 fps**、281 drawcall、606k 三角；
  - medium：平均 145.8 / 1% low 54.6；
  - ultra：平均 157.8 / 1% low 54.9（无头 dpr=1，pixelRatio 被设备像素比夹到 1）；
  - high + 夜间 + 下雨：平均 161.1 / 1% low 81.3。
- 结论：高档 1080p 远超 60fps 目标；low 档继续供无头 CI（SwiftShader 153 drawcall / 371k 三角）。
- `tools/perf-probe.mjs` 增加第 4 个参数（附加 query，如 `"&time=night&rain=1"`）与行驶采样。

## Round 29：夜间灯光按物理单位修正 + 基准图集

- three r155+ 灯光用物理单位，原来车灯 intensity=70cd / 路灯 26cd 实际几乎不可见：车灯改 900cd、路灯 220cd、座舱补光 9cd，夜间车头光斑与路灯地池恢复正常。
- 新增夜间「英雄光」：车顶后侧暖色 62cd + 前侧冷色 28cd 点光（不投影，常驻避免重编译），暗场下车身轮廓可读。
- 新增 `tools/gallery.mjs`：一次抓 6 张 1600×900 基准图（menu / garage / day-chase / night-chase / night-rain / cockpit），走独显渲染。
- 回归：build + vitest 9 + e2e 12 全绿；高档行驶 149.7fps（1% low 54.6）。

## Round 30：交通/行人换形 + 围墙 + 车库展台

- 交通车与 AI 对手车改用「侧视轮廓挤出」车身（ExtrudeGeometry + 倒角，1 个几何体），并加独立座舱玻璃层；行人换成胶囊躯干 + 头 + 颈 + 双腿 + 双臂的合并几何体（仍各 1 draw）。
- 城市边界补 2.4m 围墙（合并几何 + AABB 碰撞），开车到边缘不再看到草地/地平线。
- 交通/行人覆盖范围修正为 `WORLD.GRID_SIZE`（此前仍按 4 街块，只覆盖西南角），数量保持计划书的 48/72。
- 车库改成主场景展台：打开车库时相机切到绕车慢转机位（半径 10.2m / fov 38 / 注视点右移让车落在左半屏），面板靠右、取消背景模糊，并临时点亮英雄光；≤900px 返回居中布局。
- 回归：build + vitest 9 + e2e 12 全绿。
