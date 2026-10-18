# FenzaRoad RE — 从零重构的城市竞速

> 旧版（`D:\Project\FenzaRoad`）只作为行为规格参考，本项目**不复制任何旧文件**。
> 目标画质参照 `640.gif`（NEON VELOCITY 级：高模车 + 完整内饰 + 湿路反射 + 城市天际线 + 电影感 HUD），
> 风格不绑定霓虹夜，**白天 / 清晨 / 黄昏 / 夜间** 四档可切换。

## 当前状态（M0–M2 进行中）

| 模块 | 状态 |
|---|---|
| Vite 7 + TS 5.8 + three 0.178 骨架 | ✅ |
| 渲染管线（HDR + MSAA + Bloom + ACES + 分级 + SMAA/FXAA + 运动模糊） | ✅ |
| 程序化天空（渐变 / 太阳 / 云 / 星空）+ PMREM 环境探针 | ✅ |
| 四时段预设（清晨 / 白天 / 黄昏 / 夜间）+ 雾 / 曝光 / 泛光联动 | ✅ |
| 外部高模装载（glTF 自动 Y-up 判定、车轮重挂枢轴、车漆/玻璃/灯组材质替换） | ✅ |
| 车底接触阴影 + 车灯 + 路灯点光池 | ✅ |
| 城市生成（网格道路、车道标线、人行道、斑马线、临街建筑、楼层挑檐、屋顶设备、行道树） | ✅ 第一版 |
| 驾驶动力学（固定步长、自动变速、漂移姿态、圆-AABB 碰撞） | ✅ 第一版 |
| 追尾 / 引擎盖 / 座舱三视角 + 速度 FOV + 震屏 | ✅ |
| 主菜单（英雄车环绕展示、车辆卡、涂装、时段与画质切换） | ✅ 第一版 |
| 驾驶 HUD（名次 / 圈数 / 计时 / 小地图 / 速度环 / 遥测条） | ✅ 第一版 |
| 交通 / 行人 / 竞速 / AI / 车库 / 生涯 / 音频 / 联机 | ⏳ 未开始（M3–M10） |

## 运行

```bash
npm install
npm run dev          # http://localhost:5174
npm run build        # tsc --noEmit && vite build
npm test             # vitest（待补）
```

调试入口：

- `?quality=low|medium|high|ultra` 强制画质；`navigator.webdriver` 自动 low
- `?time=dawn|day|dusk|night` 直接进入指定时段
- `?autostart=1` 跳过菜单直接驾驶
- `window.__RE__`：`stats()` / `text()` / `setTime(id)` / `start()` / `teleport(x,z)` / `photo(deg,r,h)` / `setQuality(t)`

## 目录

```
src/core       配置、时钟、事件总线、存档
src/render     渲染器、后处理、天空、材质库
src/world      城市与道路生成
src/vehicle    外部高模装配（rig / 材质 / 灯组 / 接触阴影）
src/gameplay   动力学、相机、输入
src/ui         HUD、主菜单
src/styles     设计 token 与页面样式
tools          GLB 探针、资产下载、截图、诊断
public/assets  已优化、可离线运行的运行期资产
docs           蒸馏 / 美术规格 / 资产许可 / 状态
```

## 文档

- [docs/DISTILLATION.md](docs/DISTILLATION.md)：旧版全功能第一性原理蒸馏与移植契约
- [docs/ART-BIBLE.md](docs/ART-BIBLE.md)：画质目标、色板、材质与 HUD 栅格
- [docs/ASSETS.md](docs/ASSETS.md)：资产清单、许可与优化流程
- [docs/STATUS.md](docs/STATUS.md)：里程碑进度、已知缺口、下一步
