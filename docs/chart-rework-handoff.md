# 图表体系重构 v1.5.0 — 交接文档（Handoff）

> 写给接手后续打磨工作的 agent。驱动文档 = `docs/chart-rework-p0.md`（32 项问题清单 I1-I32 + 执行进度节，先读它）。
> 本文补充：已完成工作的 commit 索引、遗留任务的定位与验收标准、本次重构踩过的坑与验证方法论。

## 1. 背景与架构现状

v1.5.0 目标：图表体系"根上重构"——三层投影 + 注册表驱动，同时打磨预览/导出视觉保真，补齐导出缺口，收紧生成指引。

重构后架构（依赖方向由 `tests/regression/dep-graph.mjs` CI 强制）：

```
references/pptd.md（格式规范，一字未动）
        ↓
packages/model/chart/          语义+布局+option 单源（纯函数，禁 DOM）
  meta.js      13 类型注册表 / CHART_DEFAULTS / remapEncode
  resolve.js   归一化（seriesDefaults 合并 / encode 取数 / 默认取色 / 共存校验）
  layout.js    柱状布局单源 resolveBarLayout（barWidth/barGap → OOXML + ECharts 双投影）
  axes.js      轴归一化 / 方向判定 / seriesAxisIndex / seriesChannels
  colors.js    hexA / darkenByLightness / hierarchyColor
  labels.js    数据标签 §3.3 链
  data.js      表格工具
  option/      ECharts option 组装（index 编排 + shared/axes/cartesian/polar/matrix 五家族）
                ← 预览渲染与 writer SSR 图片化共用这一份
packages/renderer/chart.js     DOM 壳（91 行：定位/frameStyle/ECharts 实例生命周期）
packages/writer/chart/         OOXML 投影
  types.js xlsx.js style.js ser.js axes.js classic.js chartex.js frame.js image.js
```

- `model/chart.js`、`writer/chart.js` 均为 barrel，公共 API 与拆分前一致，消费方不深引内部。
- 新增图表类型的操作路径：model/chart/meta.js 注册 1 处 → option/ 对应家族加 builder → writer 侧加投影 → 编辑器面板字段。

## 2. 已完成工作（commit 索引，git log 可对）

| 提交 | 内容 |
|---|---|
| ca7da4d | P0 基线：21 测试页双端截图逐页复核 → 32 项问题清单（docs/chart-rework-p0.md） |
| 1a813c2 | P1 model/chart 七域拆分（barrel 零 API 变化） |
| 50392e6 | P2 writer/chart 八模块拆分（44 导出部件与基线字节一致，仅 chartEx 随机 GUID 差异） |
| 17a392b | P3 ECharts option 下沉 model/chart/option（预览 21 页逐像素一致） |
| 3dc6a07 | I9 预览瀑布柱高错误（彩色堆叠段误用累计 end，应为段高 y） |
| d53bc79 | I1 line/area stack 导出丢失（grouping 写死 standard） |
| 9be1172 | I2 散点导出被连线（ser 补 a:ln noFill；注意 CT_ScatterSer 只许一个 spPr） |
| b97e796 | I3 雷达填充丢失（radarStyle 写死 marker，有 areaColor 改 filled） |
| eb443ba | I4 股价图例 K线×N 污染（strCache 改列头名） |
| 1967eee | I5 percentStacked 数值轴 numFmt 0% |
| b023665 | I6 chartEx 空 cx:title 泄漏占位文字（无标题省略元素） |
| ad9adba | I7+I8 smooth 每系列显式 0/1（废止组级连带平滑；area smooth 本次解禁修复） |
| 92418a8 | I24 饼图 dLblPos=outEnd（doughnut 不支持 dLblPos，回退 bestFit） |
| 1383b36 | I11-I13,I16,I21 预览标签/图例批次（scatter 取 y、无 marker 折线标签、堆叠 inside、图例四方位、轴无千分位） |
| 50fd5f4 | I10,I15,I28(预览) chart.title 渲染、轴标题居中旋转+箭头、瀑布走共用轴 |
| 825763b | I23 横向柱反转 ser 发射序（柱序+图例序对齐预览）⚠️ 此提交引入 xfrm 回归，见 §4 坑 1 |
| bddfd55 | P5 heatmap/sankey SSR 矢量图回退（image.js + svgBlip）+ SKILL.md 改「13 类全导出」 |
| 93060c9 | 修复 xfrm 双层包裹回归 + pptx.js 编号排除图片化类型 + 22-combo 回归页 |
| 5f0d82e | P6 design.md §1 第 7 条硬性决策边界 |
| 2219d21 | P7 部分：v3.md 标记完成、P0 清单执行进度、版本 bump 1.5.0 |

## 3. 遗留任务（按优先级，均带验收标准）

### 3.1 I19 绘图区 manualLayout 单源（最大项，对齐问题的根修）

- **现状**：预览固定网格 `CHART_GRID = {left:48, right:24, top:28, bottom:36}`（model/chart/option/shared.js），导出写 `<c:layout/>` 让 PowerPoint 自动布局 → 绘图区几何两端明显不同（01 页 PPT 绘图区更高更满；02 页饼图 PPT 显著更大——预览写死 radius 72%/center 46%，radar 62%）。
- **方案**：`model/chart/layout.js` 增加布局模型（输入 bounds + 标题/图例/轴标题占位，输出 plotArea 分数矩形 + 饼/雷达半径）；导出端 classic.js 写 `<c:plotArea><c:layout><c:manualLayout>`（layoutTarget="inner"，x/y/w/h 为 0-1 分数）；预览 CHART_GRID 改由同一模型投影。注意已铺的让位逻辑（chart.title → grid.top+24、类目轴标题 → grid.bottom+18，在 option/index.js 与 cartesian.js）应一并收进模型。
- **边界**：manualLayout 只对经典 c:chart 体系；chartEx（waterfall/treemap/sunburst）平台无 plotArea 布局控制，文档化即可。
- **验收**：01/02/14 页 COM 截图与预览并排，绘图区几何肉眼接近；npm test 全绿。

### 3.2 I27 chartEx 样式透传（writer 半）

- `writer/chart/chartex.js` 的 titleXml/legendXml 只写 pos，不消费 fontSize/color/fontFamily。需对照用户手工参考文件（tests/projects/chart/reference/test-chart-all-powerpoint.pptx 解包 chartEx1/2/6）确认 cx:title/cx:legend 的富文本样式节点结构再写。
- 坑：有文本才输出元素（空 cx:title 会渲染「图表标题」占位，见 §4 坑 3）。

### 3.3 I28 cx:axis title 映射（writer 半）

- 预览侧已修（waterfall 走共用 cartesianAxes）。writer chartex.js 的 waterfall axes 字符串结构写死——把 yAxis.title 等可行字段映射进 `<cx:axis><cx:title>`（有文本才写）。对照参考文件确认结构。

### 3.4 I14 / I22 差异文档化（不改代码）

- I14 雷达值轴刻度：预览不显示 0-100 刻度数字、splitNumber 两端不同（预览 4 环 / PPT 按 nice 步进多环）。
- I22 气泡尺寸：sizeRange px 映射 vs PowerPoint 内部气泡缩放（PPT 气泡显著更大）。
- 写入「已知差异」节（建议放 3.7 架构手册内），不写死 min/max（保数据可编辑语义，pptd.md:1060 口径）。

### 3.5 回归页 23-props3

- 锁定：waterfall 轴配置（xAxis/yAxis title 等，I28 预览侧已实现）、chartEx title/legend 样式（I27 完成后补）。参照 22-combo.page 的写法，记得在 deck.pptd 的 pages: 清单登记（页面不会自动发现）。
- 顺带核查 17 页 c2/c3 bounds 是否已错开（历史重叠是测试页笔误；commit 里做过修正脚本，需 COM/预览确认生效）。

### 3.6 examples 全量导出回归 + README 九图重渲

- examples/ 下 8 个 deck 16 个 chart 元素逐个 export + COM 抽查（本轮预览侧改动多：标题/轴标题/图例/瀑布/标签，导出侧 stack/scatter/radar/pie 标签/横向柱序等，examples 图表页的导出观感会变）。
- README 九图：`node bin/open-pptd.js render examples/<deck>/deck.pptd --page N --scale 2 -o 临时目录`，产物覆盖 docs/images/<短名>.png；渲染是确定性的，git status 会显示哪几张真变。

### 3.7 docs 三层架构手册

- 面向后续维护者：三层职责、新增类型操作手册、已知两端差异清单（I14/I22/I20 轴自动范围算法不同——不写死 min/max 保自适应，属接受项）、chartEx 平台限制（无逐点边框、无 plotArea 布局、旧版占位）。

## 4. 本次重构的坑（血泪，动图表导出前必读）

1. **graphicFrame 与 pic 的 xfrm 结构不同**：`p:graphicFrame > p:xfrm > a:off+a:ext`（直接放）；`p:pic > p:spPr > a:xfrm > a:off+a:ext`（要 a:xfrm 包一层）。双层嵌套（p:xfrm>a:xfrm）是非法结构，**PowerPoint 不报修复、直接忽略变换 → 图表零尺寸不可见**，极难察觉。I23 提交曾引入此回归，靠 22 页回归页在提交前抓到（93060c9）。
2. **chart 编号两侧必须同口径**：pptx.js 的 chartPrefix/chartExIds 全局计数若与 writer 的 registerChart 消耗不一致，其后所有图表的 slide 引用悬空（部件在、引用错、页面空白）。heatmap/sankey 图片化（collectChartImage）不消耗编号，pptx.js 计数必须同步排除。
3. **chartEx 空 cx:title 会渲染「图表标题」/「坐标轴标题」占位文字**；轴内 `<cx:title/>` 同理。有文本才输出元素。
4. **doughnutChart 的 dLbls 不允许 dLblPos**（PowerPoint UI 里环形图标签位置就是灰的），写入直接触发修复弹窗；实心饼 outEnd 合法。
5. **ECharts SSR 的字体串陷阱**：SSR 会把 `textStyle.fontFamily` 原样插进 `style="..."` 属性，若含内层双引号（如 `"Microsoft YaHei","Microsoft YaHei",sans-serif`）产出**非法 XML**，PowerPoint 显示「无法显示该图片」（浏览器预览走 canvas/DOM 不经序列化，所以预览看不出来）。字体族名不加内层引号即可（CSS 未引号族名合法）。
6. **chartEx 的 series uniqueId 是随机 GUID**——字节级对比导出产物时必须先归一化掉，否则永远 diff 不干净。
7. **PowerPoint chartEx 瀑布是自己重算累计的**：本次发现 09/17 页「PPT 错预览对」其实反了——预览瀑布的堆叠彩段误用累计值，PPT 端反而是对的。修复方向别照旧印象。
8. **XML 排查法**：标签序列 diff（`<(/?c:xxx)` findall + difflib）能快速定位结构差异；但**标签级一致还空白时，要查包结构**——rels 悬空、Content_Types 缺 Override、xfrm 非法都不在 chart part 本身。孤立复现（临时单页项目）+ 与已知可渲染的基线做属性级 diff 是最短路径。

## 5. 验证方法论（贯穿纪律）

- **回归**：`npm test`（20/20，**单独跑、亲眼看退出码**，管道会吞码）；`npm run test:deps`（依赖方向，writer→renderer/vendor/echarts.mjs 已有受控豁免登记在 dep-graph.mjs ALLOWLIST）。
- **双端对照**：
  1. 导出：`node bin/open-pptd.js export tests/projects/chart/deck.pptd -o <out>.pptx`（会打「已跳过」警告属正常——heatmap/sankey 现走图片化，警告文案待顺手更新）。
  2. COM 截图（⚠️ PowerShell 5.1 按 ANSI 读 UTF-8 无 BOM 脚本，中文路径会乱码 → **一律用 ASCII 工作区** `C:\pptd-p0\`，已建好；pptx 先复制为 baseline.pptx 再开）：
     ```powershell
     $pp = New-Object -ComObject PowerPoint.Application
     $pres = $pp.Presentations.Open('C:\pptd-p0\baseline.pptx', $true, $false, $false)
     $pres.Slides.Item(N).Export('C:\pptd-p0\out.png','PNG',1920,1080)
     $pres.Close(); $pp.Quit()
     ```
  3. 预览截图：`node bin/open-pptd.js render tests/projects/chart/deck.pptd --page N --scale 2 -o <dir>`。
  4. 并排拼图脚本 `C:\pptd-p0\montage.ps1`、像素 diff `C:\pptd-p0\pixdiff.ps1`、局部放大 `C:\pptd-p0\crop.ps1` 已就绪可复用。
  5. 本机 PowerPoint build 16.0.20326（支持 SVG/svgBlip）。
- **提交纪律**：打磨项每项独立 commit（消息带 I 编号），COM 对照通过才提交；不碰用户未跟踪文件（工作区里 docs/image-generation.md 是用户的，别 add）；**pptd.md 一字不动**；渲染链路禁止写死 960×540（尺寸从 bounds/deck.size 推导）。
- **测试页新增**：页面文件放 tests/projects/chart/pages/ 后**必须在 deck.pptd 的 pages: 清单登记**（不会自动发现）。

## 6. 发布状态

- 版本号保持 **1.4.7**（1.5.0 bump 已应求从历史中撤回）：用户要求等遗留任务全部完成、统一打磨后再发版。**version bump 属于发布动作的一部分，留给发版时执行，不要提前 bump**。
- 发布按既有工作流（见记忆 publish-sync-workflow）：bump 版本 + push + 注释 tag（-F 文件、按 v1.3.7 格式从零写，note 覆盖上一版 v1.4.7 以来全部提交——本轮重构 commit 都会进 note），CI 自动测试打包；等用户明确指令再执行。
- 发布前检查单：遗留任务销项 → `npm test` + `npm run test:deps` + e2e（test:incremental/test:render）→ examples 全量导出 → README 九图重渲。
