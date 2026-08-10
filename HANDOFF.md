# open-pptd v2 交接文档

> 最后更新：2026-08-10（阶段 A ✅ + C1 ✅ + B ✅ + C2 ✅ + **C3 第三批（轴/横柱/次轴/色/rels 根因）**，下一步 **C3 验证闭环**）
> **本文件是唯一对接文档**（上下文已清空，仅靠本文继续开发）。
> 一切格式决策以 `references/official/pptd.md`（官方规范）为唯一依据；
> 结构疑问先查 `tests/projects/*/reference/` 的权威参考文件（用户 PowerPoint 手工 / python-pptx 官方库生成）。
> **工作流（2026-08-10 定）**：哪页打不开/样式不对 → 引导用户创建对应 pptx 参考（含目标元素改动）→ 解包比对 XML → 修复 → 回归。用户参考文件在桌面（见 §3）。

---

## 1. 项目目标

把 v1（`~/.pi/agent/skills/open-pptd`）重构为 **v2**：自研编辑器 + 导出器严格对照 **PPTD 官方格式**（Kimi 官方编辑器使用），做到：

- 编辑器生成的 `.pptd/.page` 文件与官方格式**字段级一致**（官方编辑器可互读）
- 导出的 PPTX **PowerPoint 打开零修复弹窗**、渲染与预览一致
- 不保留 v1 的随意扩展与兼容代码（发现 v1 兼容路径直接删除）

用户（法法）验证流程：`serve` 启动 → 浏览器编辑/导出 → PowerPoint 打开检查（无修复弹窗 + 渲染一致）。

---

## 2. 当前状态（A ✅ + C1 ✅ + B ✅ + C2 ✅，下一步 C3）

### 2.1 已完成模块

| 模块 | 状态 | 说明 |
|---|---|---|
| Git 基线 | ✅ | HEAD `00aa50a`；里程碑：`9023f1e`（B 主题官方化）、`8a4ecd5`（C2 Cell 模型）、`00aa50a`（合并 gridSpan 修复） |
| 富文本 DSL | ✅ | `p/span/strong/em/u/s/sup/sub/a/ul/ol/li` + `style="..."`；**无 Markdown（`**` 非法，用 `<strong>`）** |
| **LaTeX 公式混排** | ✅ | `\(...\)` 富文本内嵌；行内 `a14:m + m:oMath`、独占段 `m:oMathPara + m:jc`，整框 `mc:AlternateContent`；KaTeX→MathML→OMML 管线（204 用例 vs 微软官方 XSLT 字节一致） |
| TextContent 字段 | ✅ | `color/fontSize/fontFamily/bold/italic/backgroundColor/lineHeight/lineHeightPx/letterSpacing/marginTop/textDirection/wrap/align/gradient/shadow` + 元素级 `rotation/opacity/flip` |
| 默认值 | ✅ | 文字 `align [left,top]`、`fontFamily "MiSans"`；表格 `align [center,middle]`、`border {solid,1,#000}` |
| 透明度 | ✅ | run 级 `solidFill > 颜色元素 > a:alpha`；HEX8 `#RRGGBBAA` |
| 渐变 | ✅ | `a:gs pos = position*100000` |
| 阴影 | ✅ | `outerShdw` 颜色直接子元素（不包 solidFill） |
| 图标 | ✅ | `iconName: "style:name"`（bs:/fas:/far:/fab:），源在 `assets/icons/` |
| autofit | ✅ | `spAutoFit` + 编辑器增高 bounds |
| 主题色 | ✅ | `$key→schemeClr`（text/dk2、bg/lt2、primary/accent1、accent/accent2，其余 srgbClr）；`tests/color-consistency.mjs` 回归 |
| **形状 187 种** | ✅ | ECMA-376 附录全量（`preset-geometry.data.js` AUTO-GENERATED，勿手改）；求值器支持 arcTo/quadBezTo/Q/A |
| **自定义路径** | ✅ | `shapeName:"custom"` → `a:custGeom`（全命令 + 整圆拆分 + 旋转弧贝塞尔降级） |
| **线条 curve** | ✅ | sharp/round/smooth → `cxnSp + custGeom`；箭头取端点切线 |
| **图片 crop/cropShape** | ✅ | crop→fit→cropShape 全管线（`cropFitSrcRect`）；cropShape 支持 187 种 + custom |
| **Theme 官方化** | ✅ | 严格 `{colors, textStyles, tableStyles}`（pptd.md §3）；17 套预设只写 colors；派生色显式 hex（primarySoft/Tint/Deep）；序列化永远写对象 |
| **tableStyles 官方化** | ✅ | `Record<string, TableStyleConfig>` + 官方继承链消费（writer/renderer 同源） |
| **C2 Cell 对象模型** | ✅ | 见 §2.4 |
| 测试体系 | ✅ | `tests/projects/` 每组件一项目（table 9 页 / text 8 / shape 8 / icon 2 / line 2 / **chart 19 页** / image 1）；`run-all.mjs` 11/11；isolate 32 个隔离导出；产物入各项目 `out/`（gitignore） |
| **C3 chart 官方化** | 🚧 | 13 类型注册 + 8 经典 chartEx 体系；**本轮：轴配置/横向柱/次轴/线型/层级色/图表框/rels 根因**（见 §2.5）；heatmap/sankey 暂不导出（PowerPoint 无原生，方案待定） |

### 2.2 关键文件地图

```
bin/open-pptd.js        CLI（serve / export / export-project）
lib/editor-server.js    本地服务器（静态 + /events SSE + /api/save 写回）
lib/pptd-export.js      项目包导出（deck+pages+media → zip）
editor/
  core/
    pptd-io.js          PPTD YAML ↔ 模型（宽容解析：裸值单元格 → {text}）
    model.js            模型 + SUPPORTED_SHAPES（187 种）
    richtext.js         富文本解析（含 \(...\) 公式 run）
    style.js            文字样式继承链（computeBaseStyle）
    theme.js            主题解析（normalizeTheme/resolveColor/resolveFont/
                        resolveTextStyle/resolveTableStyle/resolveTableCellStyle
                        + THEME_NAMES + DEFAULT_FONT="MiSans"）
    theme-presets.js    默认主题 + 17 套色系（官方结构，纯数据）
    table.js            表格模型：tableGrid（省略式→完整网格，covered 占位）、
                        tryMerge/trySplit、normalizeCells、validateDims、
                        estimateTableLayout（列数优先 columnWidths.length）
    chart.js            图表模型（CHART_META 7 类型 + DEFAULT_CHART_PALETTE
                        + mergeSeriesDefault）——C3 要重写
    preset-geometry.js/.data.js  形状求值器 + 187 几何（AUTO-GENERATED）
    icon-library.js / icon-name.js  图标库（AUTO-GENERATED）
  writer/
    pptx.js             buildPptx 入口（部件/关系/嵌入字体装配）
    shape.js            p:sp（prstGeom/custGeom + p:style）
    custgeom.js         SVG path → a:custGeom
    line.js             p:cxnSp（直线旋转/曲线 custGeom）
    image.js            图片（cropFitSrcRect + cropShape）
    text.js             文本框（a14 公式/渐变/阴影/spAutoFit）
    table.js            表格（官方继承链 + BorderSpec + **gridSpan/vMerge/hMerge
                        合并结构**）
    chart.js            图表（bar/pie/scatter 简化）——C3 要重写
    drawing.js          通用（xfrm/fill/border/shadow/几何）
    formula.js          公式 run 样式注入
    font.js             字体嵌入（deck.fonts 资源表扩展）
    parts.js            theme1.xml / 包部件 / themeColorSlots
  renderer/             shape/line/image/text/table/chart（与 writer 同源）
  types/                元素类型注册（menu/props/quickbar/render/toXml）
  interaction/dialogs/  table-editor（网格+样式+合并 UI）、chart-editor、icon-editor
  app/                  state/view/io/toolbar/font-manager
assets/icons/           Bootstrap Icons 源（192 个）
references/official/    pptd.md（权威规范）/ shapes.md / fonts.md / slides_categories.md
references/font-embedding.md  字体嵌入实现手册（COM 实测）
scripts/                gen-preset-geometry.mjs / gen-icons.mjs / gen-reference-shapes.py
tests/                  见 §4
```

### 2.3 已修复的判损根因（防回归清单，勿回退）

| 特性 | 根因 | 正确结构 |
|---|---|---|
| 公式混排 | 裸 `<m:oMath>` 不是 a:p 合法子元素 | 整框 `mc:AlternateContent`（Requires=a14）+ `a14:m`；Fallback 降级 LaTeX |
| 文字高亮 | `a:highlight` 多包 `a:solidFill` | `<a:highlight><a:srgbClr …/></a:highlight>` |
| 形状/图片阴影 | `a:outerShdw` 多包 solidFill | `<a:outerShdw …><a:srgbClr …/></a:outerShdw>` |
| rPr 子元素顺序 | effectLst 排错位 | fill → effectLst → highlight → latin/ea/cs → hlinkClick |
| 渐变 | pos 单位错（*1000） | `pos = position * 100000` |
| 文字透明度 | spPr alphaModFix 语义错 | run 级 `solidFill > 颜色元素 > a:alpha`（无色用 schemeClr tx1） |
| 删除线 | `strike="sng"` 非法 | `strike="sngStrike"` |
| autofit | normAutofit 缩字矛盾 | `spAutoFit` + 编辑器增高 bounds |
| 元素翻转 | — | `a:xfrm flipH/flipV` |
| 图片预载 | io.js 正则无捕获组 → mime null → 404 | `/\\.([a-z0-9]+)$/i` |
| 自定义路径不可见 | `moveTo/lnTo` 漏 `a:` 前缀 | `a:moveTo/a:lnTo` 全前缀 |
| 标注引线消失 | 几何内部线条由 `p:style lnRef` 驱动 | 形状输出 `p:style`（lnRef idx=1 + fillRef/effectRef/fontRef）；spPr 有 `a:ln`（含 noFill）会覆盖 |
| avLst | 总是写满默认调整值 | 未显式设置 → 空 `<a:avLst/>` |
| **表格边框全无** | tcPr 的 lnL 内错误包 `a:ln` | lnL/lnR/lnT/lnB 直接承载线属性（w/cap/cmpd/algn 在 lnL 上）；无边框写空 `<a:lnX/>`；tcPr 内 ln 必须先于填充 |
| **单元格字段不生效** | writer/renderer 只消费 text/fill/border | 官方继承链：富文本 > span > 段落 > Cell 内联 > Cell.textStyle("$key") > 位置分类 > bodyStyles > cellStyle > 默认 |
| **表格默认左对齐** | paragraphProps 兜底 algn="l" | 表格默认 `[center, middle]`（cell.align > 分类 > 默认） |
| **合并失效（2×2 变 2×1）** | ①横向跨度属性名是 **`gridSpan`** 不是 colSpan（colSpan 被忽略只剩 rowSpan）②占位格缺接力跨度 | 主格 `rowSpan + gridSpan`；同行占位 `rowSpan=主格.rowSpan + hMerge="1"`；下行首格 `gridSpan=主格.colSpan + vMerge="1"`；斜向 `hMerge="1" vMerge="1"`（对照 python-pptx `test-table-merge.pptx`） |
| 合并列数推断 | rows[0].length 在合并后变短 | 列数优先 `columnWidths.length` |
| 富文本 Markdown 混淆 | 测试页用 `**` | 官方只有 `<strong>` 标签 |

### 2.4 C2 完成明细（表格 Cell 对象模型）

- [x] `core/table.js` 模型层：`tableGrid`（PPTD 省略式 rows → 完整网格，covered 占位标记）、`tryMerge/trySplit`（重叠检测/区域合并/拆分恢复）、`normalizeCells`（裸值→{text}）、`validateDims`（官方约束 (0,1] 和=1）
- [x] `table-editor.js` 编辑器：合并格展开渲染 + 被覆盖位灰显斜纹；单击选中 / Shift+单击区域选择 → 合并/拆分；单元格样式工具条（B/I/字色/字号/填充/水平垂直对齐/textStyle 引用）；行高/列宽比例编辑；跨行合并禁止删行
- [x] writer/renderer 合并结构：**gridSpan + vMerge/hMerge 占位格接力跨度**（§2.3），与 python-pptx 逐格一致
- [x] renderer 用 tableGrid 展开（covered → 空 td）；消费 lineHeight/lineHeightPx/letterSpacing/marginTop
- [x] 测试页 09-textstyle（Cell.textStyle 引用 + tricolor 3 色 bodyStyles 循环）
- [ ] 小遗留：编辑器输入 `**` 不转换（官方无此语法，保持原样）

### 2.5 C3 第三批完成明细（2026-08-10）

**字段实现（writer + renderer 同源消费）**：
- [x] **轴配置导出**：AxisConfig 全字段 → catAx/valAx（min/max/reverse/axisLine 含 arrow/gridLine 含 style/title/label 含 numberFormat/show→delete；CT_Scaling 顺序 **max 在 min 前**）
- [x] **横向柱**：`resolveChartDirection`（显式轴类型或列类型推断）→ barDir=bar + catAx pos l / valAx pos b + 通道交换（seriesChannels：水平时分类在 y 数值在 x）
- [x] **lineStyle→prstDash**（dash/dot → a:prstDash；系列线与轴线通用）
- [x] **多轴**：seriesAxisIndex（垂直 yAxisIndex / 水平 xAxisIndex）→ 次轴组 (3,4)+（数值轴换侧 r/t + 隐藏 catAx delete=1，对照用户 chart43/47/48）；支持 N 组
- [x] **图表框**：Chart.fill/border/shadow → `</c:chart>` 后 c:spPr（对照用户参考结构）；chartEx 同样适用（cx:spPr）
- [x] **barWidth/barGap/categoryGap**：barWidth → gapWidth=(1-w)/w*100；barGap → overlap 负值；categoryGap → ×750 校准（默认 150）
- [x] **radar spokeAxis**：min/max/label/axisLine/gridLine/show → catAx/valAx；radar 共享 category 列校验
- [x] **pie border** → dPt spPr a:ln；**treemap/sunburst levels** → 层级裁剪 + 子树聚合；**scatter/bubble dataFilter** → 长表分组过滤
- [x] **chartEx 逐点色（对照用户 waterfall-color.pptx / treemap-color.pptx 实测）**：
  - 元素 `cx:dataPt`（**不是 cx:dataPoint**）+ `cx:spPr` + `a:solidFill` + `a:srgbClr`（HEX8 alpha → a:alpha 子元素）
  - series 子元素顺序：tx → dataPt* → dataLabels → dataId → layoutPr（**dataPt 在 dataLabels 前**）
  - waterfall dataPt idx = 数据行索引；treemap/sunburst idx = **整树先根 DFS 节点编号**（根=0 含中间节点）
  - xlsx 层级列序 = **根在前**（A=根…最右=叶子，size 最后）；strDim lvl = **列逆序（叶子 lvl 在前）**（对照官方默认版 + 用户手填版都吻合）
- [x] **预览（renderer）**：横向柱/多轴/图表框/5 类型（waterfall/treemap/sunburst/heatmap/sankey）ECharts 分支；层级色/瀑布三分类色与 writer 同源（hierarchyColor）；heatmap 矩阵分类通道

**判损根因修复（勿回退）**：
- [x] **chartEx 全空白根因（最重要）**：slide rels 的 Relationship Type 被 relType() 无脑拼 `officeDocument/2006/relationships/` 前缀，chartEx 的完整 URL 被二次包装 → PowerPoint 找不到部件 → 整图空白。修复：`relType` 遇含 `://` 原样输出
- [x] `resolveChartDirection` 返回字符串被当 truthy → barDir 恒 bar；改返回布尔
- [x] `typeof null === "object"` 崩两处（txPrXml label、dLblsXml）
- [x] 渲染器颜色入口未 resolveColor → `$primary` 等非法 CSS 色被浏览器忽略 → 图表不可见（seriesColor/marker/pie fills/heatmap scheme/candlestick/边框全修）
- [x] 横向柱 renderer 硬编码取 `_values.y`（数值在 x）→ 柱子全 null
- [x] heatmap 的 x/y 被当数值通道转换 → y 轴单分类；改分类通道跳过
- [x] buildLeafDataPoints 树构建自挂环（补齐路径连续同名）→ 死循环；连续同名去重

**新测试页（chart 19 页）**：14-axis（轴配置+虚线+图表框）、15-hbar（横向柱+barWidth）、16-secondary（次轴）、17-chartex-color（三分类色+层级色）、18-more（dataFilter+pie border）、19-levels（层级裁剪）

**验证状态（2026-08-10 晚）**：rels 根因已修（check11），**待用户重新导出验证** 9/11/12/17/19 页；10/13（heatmap/sankey）空白为预期。

---

## 3. 参考文件（权威性说明）

| 路径 | 权威级别 | 内容 |
|---|---|---|
| `references/official/pptd.md` | **官方规范（唯一依据）** | 全部格式定义。关键章节：§3 Theme/TextStyleConfig/TableStyleConfig（374-455 行）、Table/Cell（914-1007 行）、Chart 13 类型（1009-1500 行）、§5.2 Color Mechanism、§5.3 字段适用性表 |
| `references/official/shapes.md` | 官方 | 177 种预置形状 + 调整值 |
| `references/official/fonts.md` | 官方 | 26 款字体清单（默认 MiSans） |
| `references/font-embedding.md` | 实测（PowerPoint COM） | 字体嵌入协议（金标准 `ppt-fonts.pptx`） |
| `tests/projects/text/reference/test-text.pptx` | **用户 PowerPoint 手工** | 文字官方结构基准 |
| `tests/projects/shape/reference/test-shape.pptx` | **用户 PowerPoint 手工** | 25 形状 + 手绘 custGeom |
| `tests/projects/shape/reference/test-shapes-all.pptx` | python-pptx 官方库 | 187+7 全量基准 |
| `tests/projects/table/reference/test-table-merge.pptx` | **python-pptx 官方库** | 3×3 左上 2×2 合并——合并结构铁证（gridSpan + 占位格接力） |
| `tests/projects/table/out/check-table-修改后.pptx` | **用户 PowerPoint 手工**（不在 git） | 表格 4 项修复的比对基准（边框清空/对齐/合并/字体/颜色） |
| `C:/Users/法法/Desktop/waterfall-color.pptx` | **用户 PowerPoint 手工**（2026-08-10，不在 git） | **chartEx 逐点色铁证**：`cx:dataPt` + `cx:spPr` + `a:solidFill` + `a:srgbClr`；waterfall dataPt idx=行序；series 子元素顺序 tx→spPr→dataPt*→dataId→layoutPr；xlsx 列序 cat/val；隐藏辅助数据区 A8 起 |
| `C:/Users/法法/Desktop/treemap-color.pptx`（**默认数据版**，用户未改数据只改色） | **用户 PowerPoint 手工**（2026-08-10，不在 git） | **treemap dataPt idx=先根 DFS 编号**（默认树 3 根 dataPt idx 0/10/17 → 分支1=0、分支3=17）；strDim lvl=列逆序（叶子 lvl 在前）；xlsx 根在前 + A8:D17 分支/茎/叶子模板辅助区；series 顺序 tx→dataPt*→dataLabels→dataId→layoutPr |

> **新工作流（问题驱动，2026-08-10 定）**：哪页打不开/样式有问题 → 引导用户创建对应组件参考（PowerPoint 手工做目标效果）→ 解包逐字节比对（`python 解包 + 正则提取目标 XML`）→ 修复 → `npm test` 回归。创建参考的引导话术见 §4.4。

比对方法（已固化）：解包参考文件 → 找目标效果官方 XML 片段 → 与 `editor/writer/` 输出逐字节对照 → 修复 → 回归。

---

## 4. 测试流程

### 4.1 自动回归（每次改动必跑）

```bash
npm test                      # = node tests/run-all.mjs（11 项全过为绿）
node tests/isolate.mjs        # 逐页隔离导出（产物入各项目 out/iso-<项目>-NN.pptx）
node tests/color-consistency.mjs tests/projects/table   # 颜色一致性可指定项目
```

### 4.2 PowerPoint 验证（需要用户参与）

1. `node bin/open-pptd.js serve --project tests/projects/<组件>` → 用户浏览器导出
2. PowerPoint 检查：**无修复弹窗** + 渲染一致
3. 弹修复定位：isolate 产物逐个打开，报编号 → 二分定位
4. 结构比对：用户在 PowerPoint 手工修改 → 另存告知路径（**必须关闭 PowerPoint 防 `~$` 锁**）→ 解包比对

### 4.4 引导用户创建参考文件的通用话术（新工作流）

用户创建参考 = 在 PowerPoint 做目标效果，一般三步：
1. **插入对应组件**（图表/表格/形状…）并输入与测试页相同的数据
2. **改目标样式**（颜色/边框/轴设置…）——只改目标元素，其他保持默认
3. **另存到桌面** → **关闭 PowerPoint**（防 `~$` 锁）→ 告知路径

注意事项：
- 每类组件只改"目标字段"，颜色选什么不重要（解包只看结构和位置）
- 涉及多分类颜色（如 waterfall 三分类）时让用户明确每类用不同颜色
- 层级类图表（树状图）输入格式：**根在左、叶子在右、值最后**（PowerPoint 官方布局；叶子在前会被重排导致比对困惑）
- 解析用 Windows Python：`os.environ['TEMP']` 拼路径（/tmp 在 Windows Python 无效）
- 参考文件不入 git（在桌面），比对结论固化到 HANDOFF §2.5/§6

### 4.3 测试项目覆盖点

- **table 9 页**：样式/边框/对齐/合并/填充/字体/颜色/textStyle 引用 + tricolor 循环
- **text 8 页**：富文本/公式/布局/效果/图标/颜色体系/字体体系
- **shape 8 页**：187 全量 + custGeom；**icon 2 / line 2 / chart 2 / image 1**

---

## 5. 下一步任务

### 5.1 C3：chart 官方化（**进行中**）——属性覆盖度对照（2026-08-10 晚核查）

**已完成**：13 类型注册 + 约束校验；8 类型经典体系导出（bar/line/area/scatter/bubble/pie/radar/stockChart）；3 类型 chartEx 导出（waterfall/treemap/sunburst）；seriesDefaults 官方合并；dataLabels 官方链；色循环；图表测试 **19 页**；参考文件入库（chart/reference/ + 桌面 3 个新参考）；**rels Type 根因已修（chartEx 全空白根因）**。

**属性覆盖度**（✓ 实现 / △ 部分 / × 未实现）：

| 官方字段 | 模型/预览 | 导出 | 缺口说明 |
|---|---|---|---|
| Chart 顶层 data/series/seriesDefaults | ✓ | ✓ | |
| title / legend / dataLabels / fontFamily | ✓ | ✓ | 样式（color/fontSize/fontFamily）本轮已消费 |
| xAxis/yAxis（show/type/min/max/reverse/title/label/axisLine/gridLine） | ✓ | ✓ | 全字段 → catAx/valAx（含 arrow→headEnd/tailEnd、label.numberFormat→numFmt）；**横向柱 barDir=bar 已实现** |
| barWidth / barGap / categoryGap | ✓ | ✓ | barWidth→gapWidth 换算；barGap→overlap 负值；categoryGap→×750 |
| spokeAxis（radar show/min/max/label/axisLine/gridLine） | ✓ | ✓ | 导出已实现；radar 共享 category 列校验 |
| fill/border/shadow（图表容器框） | ✓ | ✓ | 经典 → chartSpace spPr；chartEx → cx:spPr |
| LinearSeriesBase（smooth/width/marker/nullHandling/lineColor） | ✓ | ✓ | **lineStyle dash/dot → prstDash 已实现** |
| bar.symbol（象形柱） | × | × | OOXML 无原生对应（需图片化/忽略，待定） |
| bar/line/area/candlestick xAxisIndex/yAxisIndex（多轴） | ✓ | ✓ | 次轴组 (3,4)+，数值轴换侧 + 隐藏 catAx（对照 chart43/47/48） |
| area.stack stream | △ | × | 预览可做（数据变换），OOXML 无直接映射；导出退化 stacked |
| scatter/bubble dataFilter | ✓ | ✓ | 长表分组过滤（模型层统一过滤，writer/renderer 同源） |
| bubble sizeScale/sizeRange | △ | × | 预览已消费（symbolSize 映射）；导出无直接字段（PPT 自动面积比） |
| candlestick upBars/downBars/wickStyle/OHLC+HLC | ✓ | ✓ | |
| pie innerRadius/startAngle/fill 数组/dataLabels | ✓ | ✓ | **pie border → dPt spPr a:ln 已实现** |
| radar category 共享约束/areaColor | ✓ | ✓ | |
| waterfall isTotal→subtotals | ✓ | ✓ | **三分类色 → cx:dataPt（对照用户参考实测）已实现** |
| heatmap colorScheme/colorScale/colorbar | ✓ | — | **暂不导出**（PowerPoint 无原生）；预览已消费（矩阵 + visualMap） |
| treemap fill 1D/2D+HSL 派生 / levels | ✓ | ✓ | 逐叶色 → cx:dataPt（先根 DFS idx）；levels 裁剪 + 子树聚合 |
| sunburst fill 数组 / levels | ✓ | ✓ | 同上 |
| sankey nodeAlign/fill 单/数组/Record | ✓ | — | **暂不导出**；预览已消费（Kahn 拓扑序 + 节点色） |

**下一步优先级**：① **验证 chartEx 显示**（rels 修复后用户重新导出验证 9/11/12/17/19）② bar.symbol 方案 ③ bubble sizeScale 导出近似（linear→size² 写缓存）④ area.stack stream 预览 ⑤ heatmap/sankey 最终方案（保持跳过 or 图片化）

**验证状态**：9/11/12/17/19 页 chartEx 待重验（rels Type 已修，check11 产物）；10/13（heatmap/sankey）导出空白为预期。

### 5.2 D：主题体系重建 + 编辑器 UX（暂缓）

- [ ] 以官方格式重建演示主题（原 themes/ 10 套已删，deck.pptd + pages/ + tableStyles）
- [ ] 编辑器主题 UX：toolbar 下拉只换 colors 预设（17 套）→ 考虑主题编辑对话框（colors/textStyles/tableStyles 可视化编辑 → 写官方 theme 对象）
- [ ] 画廊取舍（根入口已重定向编辑器）

### 5.3 清理遗留（随各阶段推进）

- [ ] **删除 v1 兼容代码**：`writer/drawing.js` buildFill 的 `fill.color` 旧形态分支（消费端已全写 `{type: solid, color}`）；`renderer/shape.js` 旧形态兼容；`preset-geometry.js` 的 `shapePathD` 兼容接口（菜单图标用，可改走 shapePaths）
- [ ] **废弃 `elementType: formula`**：`types/formula.js` + `renderer/formula.js`（富文本 `\(...\)` 已完全替代；`writer/formula.js` 的 injectRunStyle 是公式 run 样式注入，逻辑并入 richtext 导出后删除）
- [ ] **字体嵌入验证**：deck.fonts 资源表扩展 + writer/font.js 管线已就绪无测试覆盖——加带嵌入字体的测试项目（参照 font-embedding.md）
- [ ] **SKILL.md**：v2 完成后引用 Kimi 官方标准 skill（open-kimi-ppt），只改编辑器/导出章节
- [ ] 文档同步：README/HANDOFF 随阶段更新

---

## 6. 注意事项（血泪教训）

- **不引入兼容旧格式的代码**：用户明确要求与官方标准始终一致，发现 v1 兼容路径直接删除
- **XML 结构必须对照权威参考**：schema 顺序（rPr/pPr/spPr/outerShdw/tcPr 子元素序列）、单位（pos/alpha/sz/EMU 12700）、命名空间前缀（a:/a14:/m:/mc:）、属性名（**gridSpan 非 colSpan**！）——凡有疑问先做参考实验（python-pptx 生成或用户手工），再写代码
- **任何"效果类"改动**必须走 §4.2 PowerPoint 验证（预览对不代表导出对，schema 违规被静默修复）
- **标注引线坑**：预设几何内部线条由 `p:style lnRef` 驱动，spPr 里出现 `a:ln`（即使 noFill）会覆盖
- **表格合并坑**：YAML 层用 rowSpan/colSpan + 省略被覆盖位（官方规则）；OOXML 层用 rowSpan/gridSpan + vMerge/hMerge 占位格接力跨度——两层语义不同，靠 tableGrid 转换
- **表格默认值**：对齐 `[center, middle]`、边框 `{solid, 1, #000000}`；单元格继承链见 §2.3
- **chartEx 全空白根因**：slide rels 的 Type 若含 `://` 必须原样输出（relType 别拼前缀）——chartEx 空白不一定是 chart XML 的问题，先查装配层（rels/Content_Types/slide 引用）
- **chartEx 逐点色结构**：`cx:dataPt` + `cx:spPr` + `a:solidFill` + `a:srgbClr`（不是 cx:dataPoint/cx:color/cx:srgbClr）；series 顺序 tx→dataPt*→dataLabels→dataId→layoutPr；tree 类 dataPt idx 是整树先根 DFS 编号（根=0 含中间节点），waterfall 是行序
- **chartEx 数据布局**：xlsx 层级列根在前；strDim lvl 是列逆序（最深 lvl 在前）；f 引用整个层级列范围
- **tree 类树构建**：补齐路径连续同名必须去重（否则自挂成环死循环）
- **ECharts 颜色入口必须 resolveColor**：`$key` 不是合法 CSS 色，浏览器静默忽略 → 图表"看不见"；seriesColor/marker/pie fills/heatmap scheme/candlestick/边框全要走解析
- **横向柱通道**：barDir=bar 时数值在 x、分类在 y（writer/renderer 都别硬编码 _values.y）
- **heatmap 的 x/y 是分类通道**：别进 NUM_CHANNELS 数值转换
- `typeof null === "object"` 是 true：可选参数判空用 `x && typeof x === "object"`
- `resolveChartDirection` 之类返回布尔，别返回字符串（truthy 陷阱）
- Windows Python 解析路径：用 `os.environ['TEMP']` 拼，/tmp 无效
- **富文本无 Markdown**：`**`/`*` 非法，一律 `<strong>/<em>`
- `tests/projects/*/out/` 是生成产物（gitignore）；`tests/projects/*/reference/` 的 pptx 需入库（权威基准）
- 形状数据源：ECMA-376-1_5th_edition_december_2016.zip → OfficeOpenXML-DrawingMLGeometries.zip（重新生成 187 数据用）
