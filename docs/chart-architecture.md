# 图表体系三层架构手册（v1.5.0）

> 面向后续维护者。驱动文档 = `docs/chart-rework-p0.md`（32 项问题清单）；
> 交接文档 = `docs/chart-rework-handoff.md`（验证方法论、OOXML 深坑、commit 索引）。
> 本文说明架构职责、布局模型、新增类型的操作路径，以及**两端已知差异的定案**——
> 差异清单里的条目是接受项，不要再当 bug 排查一遍。

## 1. 三层职责

```
references/pptd.md（格式规范，一字未动）
        ↓
packages/model/chart/          语义+布局+option 单源（纯函数，禁 DOM，dep-graph 强制）
  meta.js      13 类型注册表 / CHART_DEFAULTS / remapEncode
  resolve.js   归一化（seriesDefaults / encode 取数 / 默认取色 / 共存校验）
  layout.js    布局语义单源：resolveBarLayout（柱宽/间隙）+ resolvePlotLayout（绘图区）
  axes.js      轴归一化 / 方向判定 / seriesAxisIndex / seriesChannels
  colors.js    hexA / darkenByLightness / hierarchyColor
  labels.js    数据标签 §3.3 链
  data.js      表格工具
  option/      ECharts option 组装（index 编排 + shared/axes/cartesian/polar/matrix）
                ← 预览渲染与 writer SSR 图片化共用这一份
packages/renderer/chart.js     DOM 壳（定位/frameStyle/ECharts 实例生命周期）
packages/writer/chart/         OOXML 投影
  types.js xlsx.js style.js ser.js axes.js classic.js chartex.js frame.js image.js
```

- 消费方一律 import barrel（`model/chart.js`、`writer/chart.js`），不深引内部。
- 依赖方向：model ← renderer ← （writer 经 dep-graph ALLOWLIST 受控引用 vendor/echarts.mjs 做 SSR）。

## 2. 布局模型（两端几何同源）

### 2.1 resolveBarLayout（chart/layout.js）

柱状布局语义单源，规范表示 = OOXML 口径（gapWidth%/overlap%）：

- `barWidth` → `gapWidth = (1-bw)/bw×100`；`categoryGap` → `×750`；未配置 → 150。
- 渲染端投影 `echarts.barWidthPct = 100/(n + gapWidth/100 + (n-1)×|overlap|/100)`——
  **预览必须显式传换算结果**，禁透传 undefined 让 ECharts 用自家默认（bar/candlestick 均走此投影）。
- writer 股价图（stock）gapWidth 当前写死 150，与缺省一致；未消费 barWidth 配置（已知小缺口，
  配置了 barWidth 的 K 线两端会有差）。

### 2.2 resolvePlotLayout（chart/layout.js，I19 引入）

绘图区布局单源。输入 `el.bounds`（px，预览壳/SSR/graphicFrame ext 三端同一口径）+
标题/图例/轴标题占位，输出：

| 字段 | 消费方 | 说明 |
|---|---|---|
| `grid`（px 边距） | option 组装（预览 + SSR） | 含标题 +24、竖排笛卡尔类目轴标题 +18 让位；CHART_GRID 常量唯一定义在此 |
| `plot`（0-1 分数矩形） | writer classic.js | 写 `<c:manualLayout><c:layoutTarget val="inner"/>` + xMode/yMode edge——**chartEx 不写**（平台无此能力） |
| `pie`（radius/center %） | option/polar.js | manualLayout inner 矩形内接 × PIE_FILL(0.95)，ECharts % 相对 min(w,h)/2 |
| `radar`（radius %） | option/polar.js | 同上 × RADAR_FILL(0.9) |

让位条件与家族差异：标题让位全类型；轴标题让位仅竖排 bar/line/area/candlestick；
饼/雷达无轴标签 → 左右对称 24px；treemap/sunburst 无轴 → 近零边距铺满（I26）。
PIE_FILL/RADAR_FILL 是 COM 截图校准的约定值，改动需 02/08 页双端对照回归。

## 3. 新增图表类型操作路径

1. `model/chart/meta.js` 注册类型（CHART_META + CHART_TYPE_ORDER + CHART_DEFAULTS 相关默认）。
2. `model/chart/resolve.js` 确认 encode 通道/取数语义；需要新通道时改 `axes.js` seriesChannels。
3. `model/chart/option/` 对应家族加 builder（cartesian/polar/matrix）。
4. writer 侧投影：经典体系进 `classic.js`+`ser.js`；chartEx 体系进 `chartex.js`；
   PowerPoint 无对应类型时走 `image.js` SSR 图片化（登记 IMAGE_CHART_TYPES）。
5. 编辑器面板字段（web 端）。
6. `tests/projects/chart/pages/` 加回归页并**在 deck.pptd pages 清单登记**（不会自动发现），
   双端截图锁形态。

## 4. chartEx 平台限制与结构要点（实测 + schema 定案）

依据 [MS-ODRAWXML]（learn.microsoft.com，chartex 命名空间）+ 本机 PowerPoint COM 实测：

- **无 plotArea 布局控制**：无 manualLayout 等价物，绘图区由 PowerPoint 自动排布；
  预览 grid 只对自家渲染负责。
- **无逐点边框**：cx:dataPoint 无逐点 ln（P0 I27 定案文档化）。
- **cx:title（图表标题）**：`<cx:title pos="t" align="ctr" overlay="0"><cx:tx><cx:rich>`
  消费字号/颜色/字体（CT_Title 有这三属性）；**空元素泄漏「图表标题」占位文字，无标题省略元素**。
- **cx:axis > cx:title（轴标题，I28）**：CT_Axis sequence 里 title **紧跟 scaling、在
  gridlines/tickLabels 之前**；**CT_AxisTitle 无任何属性**（带 pos/align/overlay
  PowerPoint 直接拒开——实测 `could not open the file`），位置由平台沿轴自动排布。
- **cx:legend**：pos 为 t/b/l/r 枚举；缺省字符样式走 cx:txPr（单段无 run，COM 验证打开+渲染）；
  图例条目文字由 PowerPoint 按类型语义生成（waterfall 显示 增加/减少/汇总，不是系列名）。
- **系列 uniqueId 是随机 GUID**：字节级 diff 导出产物前必须归一化掉。
- **dataLabels**：内容开关（visibility 的 categoryName/value，随 labels.content
  切换）与样式（fontSize/color/fontFamily）均已透传。注意：瓦片标签文字的
  **权威色源是 chartStyle part 的 cs:dataLabel 槽**（fontRef 默认 tx1-65% 深灰；
  cx:dataLabels 里的 cx:txPr 合法但会被 PowerPoint 忽略）——writer 在 labels
  配了 color/fontSize 时覆盖该槽（colorHex + defRPr sz）。numberFormat 暂不落盘。
- **瀑布语义色**：增加/减少/汇总色由 chartStyle part（styleN.xml）语义槽驱动，
  与预览主题色板取色是两套体系（见 §5）。
- **旧版兼容**：经典 c:chart 全兼容；chartEx 需 PowerPoint 2016+。

## 5. 已知两端差异清单（接受项，勿再当 bug 排查）

| # | 差异 | 定案 |
|---|---|---|
| 1 | **I20 数值轴自动范围**：ECharts nice-number vs PowerPoint 算法（03 页 0-70 vs 0-80） | 不写死 min/max，保数据可编辑+自适应语义（pptd.md:1060 口径）；显式配置 min/max 时两端一致 |
| 2 | **I14 雷达刻度**：PPT 显示值轴刻度数字（nice 步进多环），预览不显示；splitNumber 两端不同 | 接受；spokeAxis.label 语义已对齐。另实测类目排布方向两端相反（预览顺时针 / PPT 逆时针），属 ECharts radar 与 PPT 的固有差异 |
| 3 | **I22 气泡尺寸** —— **已修复（第二轮）**：此前原始 size 值直进数据坐标，PowerPoint 气泡巨大互相覆盖 | writer 归一化 size 值 = 100×(d/dmax)²（d = 预览同源 px 直径，chart 全局极值）+ 反解 c:bubbleScale；标定：直径 ∝ √size×scale，scale=100 时最大泡 ≈ 0.51×绘图区短边，>150 触发截断（0.83）。预览同步改为 chart 全局极值归一（原按系列各自归一，跨系列大小不可比） |
| 4 | **I17 残留**：treemap levels 瓦片切分算法两端不同（ECharts squarify vs PPT），聚合语义已同源，块边界/纵横向或有差 | 接受 |
| 5 | **I18 残留**：深色瓦片上预览标签默认深色文字对比度不足（标签已渲染；PPT 端用白字） | 待办候选：按瓦片亮度选标签色 |
| 6 | **瀑布色板**：chartEx style part 语义色（绿/蓝/橙）vs 预览主题色板（蓝/橙/绿） | 接受；用户配 totalBars/increaseBars/decreaseBars fill 时两端同色 |
| 7 | **股价图图例**：OHLC 展开的图例条目（开盘/最高/最低/收盘）为 PowerPoint 股价图固有行为 | 接受（I4 修复后取列头名，不再污染为系列名×N） |
| 8 | **图例底部 + manualLayout**：inner 矩形固定后，PowerPoint 图例带与类目标签/轴标题共用底部让位带，内容多时互相挤（青山咖啡 deck P3/P10/P12 实测） | 页面层规避：图例挪 top；模型级修法（布局模型给 legend-bottom 追加底部让位）列为候选，改动会波及全部 legend-bottom 图表的预览像素 |

## 6. 验证

双端对照流程、COM 工具（C:\pptd-p0）、提交纪律见 `docs/chart-rework-handoff.md` §4/§5。
回归页 01-23 覆盖：01-13 逐类型、14 轴、15 横向柱、16 次轴组合、17 chartEx 色、
18-21 props、22 组合图、23 chartEx 样式/轴标题。
