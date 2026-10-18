# FenzaRoad RE — 从零重构的城市竞速

> 旧版（`D:\Project\FenzaRoad`）只作为行为规格参考，本项目**不复制任何旧文件**。
> 画质目标参照 `640.gif`（高模车 + 完整内饰 + 湿路反射 + 城市天际线 + 电影感 HUD），
> 风格不绑定霓虹夜，**清晨 / 白天 / 黄昏 / 夜间** 四档可切换。

## 现状（M0–M7 主体完成，M8/M9 进行中）

| 模块 | 状态 |
|---|---|
| 渲染管线（HDR + MSAA + Bloom + ACES + 分级 + SMAA/FXAA + 运动模糊 + 自适应分辨率） | ✅ |
| 程序化天空（渐变/太阳/云/星空）+ PMREM 环境探针 + 四时段 | ✅ |
| 湿路平面反射 + 车道标线 + 街区铺装 + 临街霓虹招牌 | ✅ |
| 外部高模装配（Y-up 判定、车轮枢轴、车漆/玻璃/灯组、车底接触阴影） | ✅ |
| 城市生成（1200×1200 / 8×8 街块 / 511 栋建筑 + 挑檐 + 屋顶设备 + 商铺橱窗 + 路灯/行道树） | ✅ |
| 驾驶（固定步长、自动变速、漂移、三视角、碰撞、震屏） | ✅ |
| 座舱视角（隐藏车壳 + 内饰补光，仪表/方向盘可见） | ✅ |
| 特效（胎痕、胎烟、雨幕 + 雨声 + 高速速度线） | ✅ |
| 交通流 48 台 + 行人 72 名（可撞倒 + 金币/击杀统计） | ✅ |
| 任务点（3 个发光圆环，开进即弹出对应赛道设置） | ✅ |
| 触屏（虚拟摇杆 + 油门/刹车/漂移 + 视角键，`?touch=1` 强制开启） | ✅ |
| 竞速闭环（3 赛道 / 检查点 / 倒计时 / AI / 排名 / 结算 / 奖励） | ✅ |
| 车库（6 款车 / 涂装 / 购买装备 / 切换动力学参数） | ✅ |
| 生涯（签到 / 每日任务 / 14 成就 / 统计 / 里程奖励） | ✅ |
| 音频（三层引擎 / 风噪 / 胎噪 / 换挡 / 碰撞 / UI） | ✅ |
| 暂停菜单（继续 / 重开 / 返回 / 时段 / 天气 / 静音） | ✅ |
| 无尽模式（区块流式） | ⏳ |
| 联机（P2） | ⏳ |
| RTX 5070 1080p high 60fps 实测 | ⏳ 待验证（Chrome 固定走 Intel UHD） |

## 运行

```bash
npm install
npm run dev          # http://localhost:5174
npm run build        # tsc --noEmit && vite build
npm test             # vitest（9 条）
npx playwright test  # e2e（12 条）
node tools/perf-probe.mjs high 8   # 真实 GPU 性能探针
```

调试入口：`?quality=low|medium|high|ultra`、`?time=dawn|day|dusk|night`、`?rain=1`、`?touch=1`、`?autostart=1`；
控制台 `window.__RE__`（`stats()` / `text()` / `setTime()` / `start()` / `teleport()` / `photo()`）。

## 目录

```
src/core       配置、时钟、事件总线、存档
src/render     渲染器、后处理、天空、平面反射、立面材质、材质库
src/world      城市与道路生成、霓虹招牌
src/vehicle    外部高模装配
src/gameplay   动力学、相机、输入、交通、行人、竞速、AI 对手、任务点
src/race       赛道定义与采样
src/meta       成就 / 每日任务 / 签到
src/ui         HUD、主菜单、车库、生涯、暂停、竞速 UI、触屏
src/audio      合成音频
src/fx         特效（胎痕 / 胎烟 / 雨幕）
tests/         unit（vitest）+ e2e（playwright）
tools/         GLB 探针、截图、性能探针、诊断脚本
docs/          蒸馏 / 美术规格 / 资产许可 / 状态
```

## 素材许可

本项目使用 Khronos `CarConcept` 模型（**CC BY 4.0**，作者 Eric Chadwick / Darmstadt Graphics Group GmbH），
完整署名见 [CREDITS.md](CREDITS.md)。公开发布时请保留该文件。

## 文档

- [docs/DISTILLATION.md](docs/DISTILLATION.md)：旧版全功能第一性原理蒸馏
- [docs/ART-BIBLE.md](docs/ART-BIBLE.md)：画质目标、色板、材质与 HUD 栅格
- [docs/ASSETS.md](docs/ASSETS.md)：资产清单、许可与优化流程
- [docs/STATUS.md](docs/STATUS.md)：里程碑进度、实测数据、已知缺口


