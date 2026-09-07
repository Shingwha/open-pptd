# 图表体系重构 P0 基线问题清单（驱动 P4/P5，完成后作验收单）

基线：tests/projects/chart 21 页（13 类型 + 轴 + props 覆盖），导出 `tests/projects/chart/out/p0-baseline.pptx`，
双端截图对照（预览 render CLI ×2 与 PowerPoint COM Export ×2），chart XML 部件快照在仓库外 `%TEMP%`/`C:\pptd-p0`（不入库）。

逐页复核结论 + 代码定位。编号 I-xx；修复阶段标注；✅=已销项。

## A. 导出端 bug（PowerPoint 渲染与 pptd 语义不符）

- **I1 line/area `stack` 导出丢失（高）**：writer/chart.js:815 line/area 组 grouping 写死 `"standard"`，
  `stack: value/percent/stream` 全部丢失 → 叠积图导出后各系列从 0 重叠绘制、透明填充叠成脏色（04 页实测）。
  修：line/area 组按 barLayout.stacked/percent 写 grouping stacked/percentStacked；area stream 的导出语义
  （PowerPoint 无 streamgraph）按 pptd.md:1060 图片化规则评估，先修 value/percent。
- **I2 scatter 散点被连线（高）**：writer/chart.js:834 scatterStyle 写死 `"lineMarker"` 且 ser 未写
  `a:ln noFill` → PowerPoint 按顺序连线（05 页实测）。修：ser spPr 补 ln noFill（参照 python-pptx 骨架）。
- **I3 雷达 areaColor 填充丢失（高）**：writer/chart.js:889 radarStyle 写死 `"marker"` → PowerPoint 不画
  填充（08/20 页实测，预览有半透明填充）。修：任一系列声明 areaColor（含默认派生）→ `"filled"`；
  PowerPoint 无 per-series 混合样式，全填充或不填充，文档化。
- **I4 股价图展开系列污染图例（中）**：candlestick 1 系列展开 3/4 个 c:ser 全部用系列名 "K线" 做
  strCache → PowerPoint 图例出现 K线×4（07 页）/×3（21 页）。修：strCache 用列头名（开盘/最高/最低/收盘）
  或 legendEntry delete 隐藏（对照原生股价图取列头名）。
- **I5 百分比堆叠数值轴无 % 格式（中）**：percentStacked 时 valAx numFmt 仍 General → PowerPoint 显示
  0/0.2/…/1 小数，预览显示 0%-100%（21 页实测）。修：percent 时 valAx numFmt `0%`。
- **I6 chartEx 空 cx:title 泄漏占位文字（中）**：writer/chart.js:1307-1309/1315-1320 无标题/无轴标题时
  输出空 `<cx:title/>` → PowerPoint 显示"图表标题"/"坐标轴标题"占位（09/11/12/17/19/21 页全中）。
  修：无标题省元素或带 hide 属性（对照手工参考文件的空标题结构验证）。
- **I7 组级 c:smooth 连带平滑（低，P4-3 一起修）**：writer/chart.js:828 任一 line smooth → 组级 smooth=1，
  未显式写 c:smooth 的系列继承被平滑。修：每 ser 显式 0/1 + 删组级。
- **I8 area smooth 导出丢失（低）**：areaSerXml 不写 c:smooth（仅 line 写）。修：随 I7 每系列显式写。

## B. 预览端 bug（与 pptd 语义/PPT 行为不符）

- **I9 预览瀑布图柱体高度错误（高）**：renderer/chart.js:377-380 双 bar stack 模拟中彩色段 value 用
  `d.end`（累计）而非段高 `d.y` → 堆叠顶端 = 2×start+y，非首柱全部拉高、标签错位（09/17 页实测，
  PowerPoint chartEx 端反而是对的）。修：彩色段 value = d.y。
- **I10 预览不渲染 chart.title（高）**：buildChartOption 无 title 处理（仅空数据占位用）→ 配了标题的
  图表预览不见标题、PPT 有（14/20/21 页实测）。修：预览补 title 渲染（字号/颜色/字体消费同 writer）。
- **I11 预览无 marker 的 line 系列数据标签不显示（中）**：03 页两系列均配 dataLabels，PowerPoint 全显示，
  预览只显示有 marker 的系列（橙 dash 无 marker 系列标签丢失）。修：查 ECharts label 与 symbol 关联，
  无 symbol 也渲染 label。
- **I12 预览 scatter 数据标签显示成 "x,y"（中）**：05 页 label formatter `String(p.value)` 对散点数组
  输出坐标对，PowerPoint 显示 y 值。修：scatter 取 y 通道值。
- **I13 预览 legend.position 非 bottom 处理不对（中）**：20 页环形图 position:right → PPT 右侧 ✓，
  预览跑到顶部（只写了 `right:0` 缺 orient/placement）。修：top/bottom/left/right 完整映射
  （含 vertical orient）。
- **I14 预览雷达数值刻度与 PPT 不一致（低）**：预览不显示值轴刻度，PPT 显示 0-100 刻度+多环
  （splitNumber 差异）。spokeAxis.label 语义对齐（预览映射 axisName/axisLabel）。
- **I15 预览轴标题渲染弱（中）**：mkAxis 用 ECharts `name`（渲染在轴端、斜排缺失）→ 14 页 x 轴标题
  不可见、y 轴标题在左上角；PPT 居中旋转排布。修：nameLocation middle + 旋转，位置与 PPT 对齐；
  axisLine.arrow 预览未映射（14 页 PPT 有箭头，预览无），补 axisLine symbol。
- **I16 预览堆叠柱数据标签位置（低）**：21 页 percent 堆叠两系列均配标签，预览只在上端一组、PPT
  分段内嵌。修：堆叠系列 label position 用 inside（与 PPT 默认一致）。
- **I17 treemap levels 裁剪语义两端不一致（中）**：19 页 levels:2 → 预览 2 块、PPT 4 块（buildEchartsTree
  裁剪 vs chartEx buildHierarchyRows 聚合语义不同）。对齐语义（levels=显示层级数，超出聚合到边界层，
  预览按聚合值渲染而非裁掉）。
- **I18 预览 treemap/sunburst 标签不可读/缺失（低）**：11/19 页预览瓦片上无可见标签（深色瓦片+默认
  深色 label？），PPT 有标签但深色瓦片上对比度差。修：预览标签渲染 + 两端 label 颜色对比度处理。

## C. 布局对齐（两端布局体系不同源的系统性差异）

- **I19 绘图区几何（manualLayout，高）**：预览固定 grid {48,24,28,36}px，PowerPoint `<c:layout/>` 自动
  布局 → 01/02 页绘图区大小/位置明显不同（01 页 PPT 绘图区更高更满；02 页饼图 PPT 明显更大——预览
  写死 radius 72%/center 46% vs PPT 自动）。修：model/layout 单源，导出写 plotArea manualLayout +
  legend 布局，与预览网格同源投影；pie/radar 半径进入布局模型。
- **I20 数值轴自动范围算法不同（接受+文档）**：ECharts nice-number vs PowerPoint（03 页 0-70 vs 0-80、
  06 页 y 0-100 vs 0-120、09 页瀑布 0-300 vs 0-160——后者因 I9 预览柱高错误放大，修后收敛）。不写死
  min/max（保数据可编辑+自适应语义），文档化差异；仅显式配置 min/max 时两端一致。
- **I21 数值轴刻度格式（小）**：ECharts 默认千分位 "1,200" vs PowerPoint General "1200"（01 页）。
  修：预览默认按 General（无千分位）渲染，用户配 label.numberFormat 时两端同格式。
- **I22 气泡尺寸投影（小）**：sizeRange px 映射 vs PowerPoint 内部气泡缩放（06/18/21 页 PPT 气泡显著
  更大）。评估 bubbleScale/代表直径换算，尽量收敛；无法完全对齐则文档化。
- **I23 横向柱组内系列顺序与图例（中）**：15 页横向柱 PowerPoint 组内顺序与图例均与预览相反（Excel
  经典行为：横向条形图 legend 倒序显示）。修：barDir=bar 时 writer 反转 ser 发射顺序（柱序与图例序
  同时对齐预览）。
- **I24 饼图数据标签位置（中）**：18/20 页预览 outside+引导线 vs PPT 内部 best-fit。修：writer 饼图
  dLbls 写 dLblPos=outEnd（OOXML 支持）对齐预览。
- **I25 图例视觉样式（低）**：预览 roundRect 大色块 vs PPT 小方块；字号观感差。预览 icon 改 rect 收敛；
  字号随字号体系统一（P4-2）。
- **I26 股价图/矩形树图柱宽与铺满（低）**：07 页 K 线宽度两端不同；19 页预览 treemap 未铺满 bounds
  （ECharts treemap 默认留白）而 PPT 铺满。纳入布局模型校准。
- **I27 chartEx 样式透传（中，P4-4）**：title/legend 字号/颜色/字体未进 cx:title/cx:legend（仅 pos）；
  catScaling gapWidth 0.5 等写死值纳入布局模型；chartEx dataPt 无逐点边框为平台限制（文档化）。
- **I28 waterfall 轴配置忽略（中，P4-5）**：预览瀑布自拼轴硬编码 AXIS_TEXT（绕过 cartesianAxes，
  忽略 xAxis/yAxis 配置）；导出 cx:axis 固定结构仅 gapWidth。修：预览走共用轴组装消费配置；导出
  映射 title/label 等可行字段。

## D. 结构与指引（P3/P6 处理）

- **I29 writer 1440 行四职责混载**：xlsx（88-259）/经典 XML（264-994）/graphicFrame（997-1043）/
  chartEx（1045-1440）；HEX8 拆解析 3 处重复（585-591/1193-1198/1261-1266）、chartEx dataPt 颜色拼接
  2 处重复（1196-1199/1264-1267）。→ P2 拆分 + 去重。
- **I30 renderer 634 行单函数 13 分支**：tooltip formatter 手写 5 处（294/397/426/493/516）、waterfall
  绕过共用轴组装。→ P3 option 下沉 model + 收敛。
- **I31 生成指引弹性边界**：design.md:30 一句弹性指引 → "有时 SVG 有时原生"观感。→ P6 硬性决策
  边界 + 组合图表配方；SKILL.md:43（heatmap/sankey 不导出）随 P5 更新。

## E. P5 缺口确认

- **I32 heatmap/sankey 导出缺失**：10/13 页 PPT 空白确认（writer/chart.js:729-732 返回 null 元素消失）。
  → SSR 矢量图回退（已拍板）。

## 已确认的非问题

- 17 页"sunburst 渲染成矩形+环混合体"：c2/c3 测试页 bounds 重叠（[540,100,380,380] 与
  [540,100,380,180]）所致，预览同样重叠，非导出 bug。测试页 bounds 待修（P4 回归页整理时一并改）。
- 03 页"4 月数值 68 vs 66"：放大复核为 68，两端一致，非数据 bug。
- 16 页次轴组合图（bar+line 双 Y 轴）两端高度一致——组合图管线现状可用。
- 20 页 nullHandling+reverse、21 页 HLC 股价线、15 页横向柱类目序：行为一致。

## 执行进度（v1.5.0，2026-09-08）

- ✅ P0-P3 结构阶段：model/chart 分域 barrel、writer/chart 八模块、option 下沉 model（提交 ca7da4d..17a392b）
- ✅ P4 已销项：I1-I13、I15-I18(预览侧)、I21、I23、I24、I28(预览侧)；过程中发现并修复 xfrm 双层包裹回归（93060c9）
- ✅ P5：SSR 矢量图回退落地，SKILL.md 更新（bddfd55）；发现并修复 pptx.js 编号口径（93060c9）
- ✅ P6：design.md 决策边界收紧（5f0d82e）
- ✅ 第二轮（2026-09-08，d5ff540..9c8b2cf）：I19 manualLayout 布局单源（resolvePlotLayout）、I25 图例 marker、
  I26（缺省柱宽收敛 + treemap 铺满；stock gapWidth 未透传 barWidth 配置的缺口已文档化）、I27 chartEx 样式透传、
  I28 cx:axis title 映射、回归页 23-props3、examples 12 deck 全量导出回归 + README 九图重渲、
  架构手册 docs/chart-architecture.md（I14/I20/I22 及残留差异定案入册 §5）
- 32 项清单全部闭环；**遗留均为接受项/候选打磨**（见 chart-architecture.md §5），无未定位 bug

## 修复阶段映射

| 阶段 | 项目 |
|---|---|
| P2 | I29（拆分去重，输出字节不变） |
| P3 | I30（option 下沉；waterfall 轴走共用组装为 I28 预览侧铺路） |
| P4 | I1-I9, I10-I18, I19, I21, I23-I28 + 回归页 22-combo/23-props3 + 修 17 页重叠 bounds |
| P5 | I32 + SKILL.md:43 |
| P6 | I31 |
| 验收 | 全清单销项复核 + 新回归页锁形态 |
