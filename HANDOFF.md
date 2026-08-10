# open-pptd v2 交接文档

> 最后更新：2026-08-10（阶段 A ✅ + C1 ✅ + B ✅ + C2 ✅，下一步 **C3 chart 官方化**）
> **本文件是唯一对接文档**（上下文已清空，仅靠本文继续开发）。
> 一切格式决策以 `references/official/pptd.md`（官方规范）为唯一依据；
> 结构疑问先查 `tests/projects/*/reference/` 的权威参考文件（用户 PowerPoint 手工 / python-pptx 官方库生成）。

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
| 测试体系 | ✅ | `tests/projects/` 每组件一项目（table 9 页 / text 8 / shape 8 / icon 2 / line 2 / chart 2 / image 1）；`run-all.mjs` 11/11；isolate 32 个隔离导出；产物入各项目 `out/`（gitignore） |

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

### 4.3 测试项目覆盖点

- **table 9 页**：样式/边框/对齐/合并/填充/字体/颜色/textStyle 引用 + tricolor 循环
- **text 8 页**：富文本/公式/布局/效果/图标/颜色体系/字体体系
- **shape 8 页**：187 全量 + custGeom；**icon 2 / line 2 / chart 2 / image 1**

---

## 5. 下一步任务

### 5.1 C3：chart 官方化（**进行中**）——属性覆盖度对照（2026-08-10 核查）

**已完成**：13 类型注册 + 约束校验；8 类型经典体系导出（bar/line/area/scatter/bubble/pie/radar/stockChart）；3 类型 chartEx 导出（waterfall/treemap/sunburst）；seriesDefaults 官方合并；dataLabels 官方链；色循环；图表测试 13 页；参考文件入库（chart/reference/）。

**属性覆盖度**（✓ 实现 / △ 部分 / × 未实现）：

| 官方字段 | 模型/预览 | 导出 | 缺口说明 |
|---|---|---|---|
| Chart 顶层 data/series/seriesDefaults | ✓ | ✓ | |
| title / legend / dataLabels / fontFamily | ✓ | ✓ | title 对象样式未全部消费 |
| xAxis/yAxis（show/type/min/max/reverse/title/label/axisLine/gridLine） | △ | × | 导出轴固定（catAx/valAx 默认）；**横向柱（yAxis.type=category→barDir=bar）未实现**；label numberFormat 未导出 |
| barWidth | × | × | 柱宽/槽宽比 |
| barGap / categoryGap | ✓ | ✓ | → overlap 负值 / gapWidth×750 |
| spokeAxis（radar show/min/max/label/axisLine/gridLine） | △ | × | 仅 min/max 预览；导出未写 |
| fill/border/shadow（图表容器框） | × | × | 官方独立于系列色 |
| LinearSeriesBase（smooth/width/marker/nullHandling/lineColor） | ✓ | △ | **lineStyle dash/dot 导出未写 prstDash** |
| bar.symbol（象形柱） | × | × | |
| bar/line/area/candlestick xAxisIndex/yAxisIndex（多轴） | × | × | 官方数组轴规则未实现 |
| area.stack stream | × | × | OOXML 无直接映射（预览可做） |
| scatter.dataFilter / bubble.dataFilter | × | × | 长表分组 |
| bubble sizeScale/sizeRange | × | × | |
| candlestick upBars/downBars/wickStyle/OHLC+HLC | ✓ | ✓ | |
| pie innerRadius/startAngle/fill 数组/dataLabels | ✓ | ✓ | pie border 未导出 |
| radar category 共享约束/areaColor | ✓ | ✓ | |
| waterfall isTotal→subtotals | ✓ | ✓ | **totalBars/increaseBars/decreaseBars 三分类色未导出**（chartEx 分色机制待研） |
| heatmap colorScheme/colorScale/colorbar | × | × | PowerPoint 无原生类型；预览也**未消费**三字段 |
| treemap fill 1D/2D+HSL 派生 / levels | × | × | chartEx 无颜色输出 |
| sunburst fill 数组 / levels | × | × | 同上 |
| sankey nodeAlign/fill 单/数组/Record | × | × | PowerPoint 无原生；预览未消费 |

**下一步优先级**：① 轴配置导出（min/max/reverse/axisLine/gridLine → catAx/valAx XML）② 横向柱 barDir=bar ③ lineStyle→prstDash ④ waterfall 三分类色（chartEx dataPoint 机制研究）⑤ 多轴 xAxisIndex/yAxisIndex ⑥ 图表框 fill/border/shadow ⑦ heatmap/sankey 方案（编辑器 ECharts 截图导出或跳过）

**验证状态**：用户逐页验证 out/check-chart.pptx；10/13 页（heatmap/sankey）导出空白为预期。

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
- **富文本无 Markdown**：`**`/`*` 非法，一律 `<strong>/<em>`
- `tests/projects/*/out/` 是生成产物（gitignore）；`tests/projects/*/reference/` 的 pptx 需入库（权威基准）
- 形状数据源：ECMA-376-1_5th_edition_december_2016.zip → OfficeOpenXML-DrawingMLGeometries.zip（重新生成 187 数据用）
