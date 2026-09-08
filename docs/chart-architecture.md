# 图表体系架构手册（v1.5.0，S1-S6 重构后）

> 面向后续维护者。驱动文档 = `docs/chart-rework-p0.md`（32 项问题清单）。
> 本文是图表体系唯一档案：分层职责、布局模型、新增类型的操作路径、chartEx
> 平台限制、OOXML 深坑速查，以及**两端已知差异的定案**——差异清单里的条目
> 是接受项，不要再当 bug 排查一遍。

## 1. 分层职责（语义单源 + 双投影）

```
references/pptd.md（格式规范，一字未动）
        ↓
packages/model/chart/            图表语义层（纯函数，禁 DOM，dep-graph 强制）
  meta.js      13 类型注册表（含 route 导出路由）/ CHART_DEFAULTS / remapEncode / chartRouteOf
  resolve.js   归一化（seriesDefaults / encode 取数 / 默认取色 / 共存校验）
  spec.js      resolveChartSpec —— 有效语义单源：归一化系列/标题/图例/布局/柱宽/气泡全落定
  title-legend.js  标题/图例有效配置（string|Config → 单一形态；缺省方位 bottom 单源）
  layout.js    布局语义单源：resolveBarLayout（柱宽/间隙）+ resolvePlotLayout（绘图区）
  axes.js      轴归一化 / 方向判定 / seriesAxisIndex / seriesChannels
  colors.js    hexA / parseHexColor / hierarchyColor / labelColorOn / waterfallColorOf
  labels.js    数据标签 §3.3 链
  data.js      表格工具 / colLetter
  tree.js      treemap/sunburst 父子表 → 树解析（预览嵌套与导出叶子路径共用）
  format.js    numberFormat 唯一解释器（formatChartValue + NUMBER_FORMAT_CODES）
  option/      ECharts 方言投影（index 编排 buildOptionFromSpec + shared/axes/cartesian/polar/matrix）
                ← 预览渲染与 writer SSR 图片化共用这一份
packages/vendor/echarts.mjs      中立共享 vendor 区（renderer 预览 + writer SSR 共用）
packages/renderer/chart.js       DOM 壳（定位/frameStyle/ECharts 实例生命周期）
packages/writer/chart/           OOXML 方言投影
  types.js xlsx.js style.js ser.js axes.js classic.js chartex.js frame.js image.js
```

- **消费方一律 import barrel**（`model/chart.js`、`writer/chart.js`），不深引内部。
- **原则：语义判断只在 model**（spec 落定全部默认值），option/ 与 writer/ 只做方言转换。
  此前 writer 自持标题/图例/气泡/树构建等第二套语义（17 处重复）是 S2 前的主要技术债。
- 依赖方向：model ← renderer/writer；writer、renderer 均可引 packages/vendor（中立区）；
  writer→renderer 逆向依赖已随 vendor 归位清除。
- **导出路由单源**：`CHART_META.route`（classic/chartex/image）+ `chartRouteOf(el)`——
  类型清单（writer/types.js 派生）、图表编号口径（pptx.js 预扫描 = slide.js registerChart）、
  graphicFrame 的 chartEx 判定（frame.js）全部消费此处，禁止再手写类型清单。

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

1. `model/chart/meta.js` 注册类型（CHART_META 含 **route 导出路由** + CHART_TYPE_ORDER +
   CHART_DEFAULTS 相关默认）；需要语义默认值时在 spec.js/CHART_DEFAULTS 落定，勿写进投影层。
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
- **dataLabels（CT_DataLabels sequence 定案，S5 修正）**：子元素顺序 = numFmt → spPr →
  **txPr → visibility** → separator → dataLabel*。**此前 writer 把 txPr 写在 visibility
  之后，被 PowerPoint 宽容解析丢弃**——7376b2f 曾据此误判「平台忽略 cx:txPr」，实际按
  schema 顺序写 txPr 合法生效。逐点标签 `cx:dataLabel idx=..`（CT_DataLabel）schema
  合法，但 **PowerPoint 实测忽略其 txPr 字色**——瓦片标签文字的**权威色源仍是
  chartStyle part 的 cs:dataLabel 槽**：labels 配了 color → 直接覆盖槽；未配置 →
  `labelSlotFor` 按首根 0 层瓦片亮度自动选白（深瓦片）/保持默认深灰（浅瓦片）；
  逐点 dataLabel 仍随 visibility 一并下发，供支持逐点样式的渲染端使用。numberFormat 暂不落盘。
- **瀑布语义色（S5 统一）**：`waterfallColorOf`（model colors.js）= 配置
  （totalBars/increaseBars/decreaseBars fill）优先、缺省主题色板 palette[0/1/2]；
  预览与 chartEx 导出（cx:dataPt 逐点）同一语义，不再依赖 style part 语义槽
  （槽保留作兜底）。图例「增加/减少/汇总」条目为 PowerPoint 平台生成，非系列名。
- **旧版兼容**：经典 c:chart 全兼容；chartEx 需 PowerPoint 2016+。

## 5. OOXML 深坑速查（血泪，动图表导出前必读）

1. **graphicFrame 与 pic 的 xfrm 结构不同**：`p:graphicFrame > p:xfrm > a:off+a:ext`
   （直接放）；`p:pic > p:spPr > a:xfrm > a:off+a:ext`（要 a:xfrm 包一层）。双层嵌套
   （p:xfrm>a:xfrm）是非法结构，**PowerPoint 不报修复、直接忽略变换 → 图表零尺寸
   不可见**，极难察觉（I23 曾引入，93060c9 修复）。
2. **chart 编号两侧必须同口径**：全局计数与 registerChart 消耗不一致时，其后所有图表
   的 slide 引用悬空（部件在、引用错、页面空白）。图片化路由（image）不消耗编号——
   现已单源 `chartRouteOf`（S3），勿再手写判定。
3. **chartEx 空 cx:title 会渲染「图表标题」/「坐标轴标题」占位文字**（轴内
   `<cx:title/>` 同理）：有文本才输出元素。
4. **doughnutChart 的 dLbls 不允许 dLblPos**（PowerPoint UI 环形图标签位置就是灰的），
   写入直接触发修复弹窗；实心饼 outEnd 合法。
5. **ECharts SSR 字体串陷阱**：SSR 把 `textStyle.fontFamily` 原样插进 `style="..."`
   属性，含内层双引号产出**非法 XML**、PowerPoint 显示「无法显示该图片」（预览走
   canvas 不经序列化，看不出来）。字体族名不加内层引号即可。
6. **chartEx series uniqueId 是随机 GUID**：字节级对比导出产物前必须归一化，否则
   永远 diff 不干净。同理 xlsx/core.xml 的 zip 时间戳是噪声，须排除。
7. **PowerPoint chartEx 瀑布自己重算累计**：曾把「PPT 错预览对」判断反了——预览瀑布
   彩段误用累计值，PPT 反而是对的。遇到两端不符先怀疑预览，别照旧印象。
8. **XML 排查法**：标签序列 diff 快速定位结构差异；标签级一致还空白时**查包结构**——
   rels 悬空、Content_Types 缺 Override、xfrm 非法都不在 chart part 本身。孤立复现
   （临时单页项目）+ 与已知可渲染基线做属性级 diff 是最短路径。

## 6. 已知两端差异清单（接受项，勿再当 bug 排查）

| # | 差异 | 定案 |
|---|---|---|
| 1 | **I20 数值轴自动范围**：ECharts nice-number vs PowerPoint 算法（03 页 0-70 vs 0-80） | 不写死 min/max，保数据可编辑+自适应语义（pptd.md:1060 口径）；显式配置 min/max 时两端一致 |
| 2 | **I14 雷达刻度**：PPT 显示值轴刻度数字（nice 步进多环），预览不显示；splitNumber 两端不同 | 接受；spokeAxis.label 语义已对齐。另实测类目排布方向两端相反（预览顺时针 / PPT 逆时针），属 ECharts radar 与 PPT 的固有差异 |
| 3 | **I22 气泡尺寸 —— 已修复（第二轮）**：此前原始 size 值直进数据坐标，PowerPoint 气泡巨大互相覆盖 | 归一化写值 = 100×(d/dmax)²（d = 预览同源 px 直径，chart 全局极值）+ 反解 c:bubbleScale；标定：直径 ∝ √size×scale，scale=100 时最大泡 ≈ 0.51×绘图区短边，>150 触发截断（0.83）。语义单源 `spec.bubble`（S2 起 writer 不再改写归一化结果） |
| 4 | **I17 残留**：treemap levels 瓦片切分算法两端不同（ECharts squarify vs PPT），聚合语义已同源，块边界/纵横向或有差 | 接受 |
| 5 | **I18 深色瓦片标签对比度 —— 已修复（S5）**：此前预览深字在深瓦片上不可读、导出默认深灰更不可读 | `labelColorOn`（Rec.709 亮度阈值 0.5）：预览逐节点选深/浅字色；导出走 cs:dataLabel 槽（labels.color 配置优先，未配置按首根瓦片亮度自动选白）。逐点 cx:dataLabel 合法但 PowerPoint 忽略（见 §4） |
| 6 | **瀑布色板 —— 已修复（S5）**：chartEx 平台缺省（绿/蓝/橙）vs 预览主题色板（蓝/橙/绿） | `waterfallColorOf` 单源：配置优先、缺省主题色板 palette[0/1/2]，chartEx 逐点 cx:dataPt 下发，两端一致 |
| 7 | **股价图图例**：OHLC 展开的图例条目（开盘/最高/最低/收盘）为 PowerPoint 股价图固有行为 | 接受（I4 修复后取列头名，不再污染为系列名×N） |
| 8 | **图例底部 + manualLayout**：inner 矩形固定后，PowerPoint 图例带与类目标签/轴标题共用底部让位带，内容多时互相挤（青山咖啡 deck P3/P10/P12 实测） | 页面层规避：图例挪 top；模型级修法（布局模型给 legend-bottom 追加底部让位）列为候选，改动会波及全部 legend-bottom 图表的预览像素 |

## 7. 验证与纪律

**回归**：`npm test`（20 项，**单独跑、亲眼看退出码**，管道会吞码）；`npm run test:deps`
（依赖方向，豁免逐一登记在 dep-graph.mjs ALLOWLIST）。

**重构/导出类改动**（S1-S6 方法论）：HEAD 基线导出（tests/projects/chart +
examples/qingshan-coffee-review-12p）→ unzip → chart/chartEx XML **字节级 diff**
（GUID/zip 时间戳归一，见 §5 坑 6）——除清单化「预期 diff」外必须零差异；
预览渲染是确定性的，PNG 哈希前后对比。

**双端对照（COM）**：
1. 导出：`node bin/open-pptd.js export <deck.pptd> -o <out>.pptx`。
2. COM 截图（⚠️ PowerShell 5.1 按 ANSI 读无 BOM 脚本，中文路径乱码 → **用 ASCII
   工作区**如 `C:\pptd-refactor\`；枚举参数写 `[Microsoft.Office.Core.MsoTriState]::msoTrue`
   比裸布尔稳）：
   ```powershell
   $pp = New-Object -ComObject PowerPoint.Application
   $pres = $pp.Presentations.Open('C:\pptd-refactor\out.pptx', [Microsoft.Office.Core.MsoTriState]::msoTrue, [Microsoft.Office.Core.MsoTriState]::msoFalse, [Microsoft.Office.Core.MsoTriState]::msoFalse)
   $pres.Slides.Item(N).Export('C:\pptd-refactor\out.png','PNG',1920,1080)
   $pres.Close(); $pp.Quit()
   ```
3. 预览截图：`node bin/open-pptd.js render <deck.pptd> --page N --scale 2 -o <dir>`。

**提交纪律**：每项/每阶段独立 commit（COM 对照通过才提交），不留中间态；不碰用户
未跟踪文件；**references/pptd.md 一字不动**；渲染链路禁止写死 960×540（尺寸从
bounds/deck.size 推导）。新增测试页放 tests/projects/chart/pages/ 后**必须在
deck.pptd 的 pages: 清单登记**（不会自动发现）。

**版本纪律**：version bump 属于发版动作的一部分，等用户明确指令，勿提前 bump
（发布工作流：bump + push 注释 tag，note 覆盖上一版以来全部提交）。

回归页 01-23 覆盖：01-13 逐类型、14 轴、15 横向柱、16 次轴组合、17 chartEx 色、
18-21 props、22 组合图、23 chartEx 样式/轴标题、24 瀑布负增量。
重构轮次记录：v1.5.0 两轮（P0-P7 结构拆分 + I1-I28 销项，ca7da4d..9c8b2cf）→
S1-S6 单源层重构（e22a035..，本轮），演进史走 git log。

重构类改动的标准验证（S1-S6 方法论）：HEAD 基线导出（tests/projects/chart + 
examples/qingshan-coffee-review-12p）→ unzip → chart/chartEx XML **字节级 diff**
（chartEx uniqueId 随机 GUID 先归一化；xlsx/core.xml 为 zip 时间戳噪声须排除）——
重构 commit 除清单化「预期 diff」外必须零差异；预览侧渲染是确定性的，PNG 哈希对比。
