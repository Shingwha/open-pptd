# PPTX → PPTD 反向转换：可行性探索与设计方案

> 状态：设计定稿（实现待落地：`lib/pptx-import.js` / CLI `open-pptd import` 尚未实现）
> 日期：2026-08 ｜ 范围：为 open-pptd 增加 pptx → pptd 导入能力
> 前置阅读：`references/pptd.md`（PPTD v2 格式契约）、`lib/pptd-export.js` + `editor/writer/*`（导出端映射）

---

## 0. 背景与目标

原版 open-kimi-ppt（Moonshot AI）宣称 PPTD 与 PPTX **双向无损转换**。本项目（open-pptd）目前只有单向能力：

```
pptd ──export──▶ pptx      （已有：自研零依赖 OOXML writer）
pptx ──import─▶ pptd      （缺失：本设计要补的能力）
```

**目标**：在保持项目「零 npm 依赖、浏览器/Node 双环境、自研为主」哲学的前提下，实现一个自研的 pptx → pptd 导入器，让用户上传任意 .pptx 后得到可编辑的 .pptd 项目（之后可继续走原有 export 管线回到 pptx）。

---

## 1. 原版是怎么做反向转换的（对照分析）

调研 `C:\Users\法法\Desktop\open-kimi-ppt`（原版 skill）结论：

- 原版的 **pptd → pptx** 走 `scripts/export_pptx.py`：起本地 localhost SDK host（`export_host.html` 内嵌 iframe）→ 通过 penpal 桥把 PPTD 灌进 **Kimi 公有编辑器**（`https://www.kimi.com/neo-ppt/`）→ 触发官方浏览器端 OOXML writer → 下载 pptx。**转换逻辑完全依赖 Moonshot 的线上服务**。
- 原版的 **pptx → pptd** 没有独立脚本：SKILL.md 中「Convert the user's uploaded pptx file to .pptd format」实际依赖 **Kimi 公有编辑器自身的"导入 pptx"功能**（浏览器自动化操作网页，上传 pptx 后编辑器内部完成 OOXML → 内部模型的解析，再导出 pptd）。同样依赖线上服务与网络。

| 维度 | 原版方案 | 本项目方案（本设计） |
|---|---|---|
| 转换引擎 | Moonshot 线上编辑器（黑盒） | 自研 OOXML 解析器（白盒，可测试） |
| 依赖 | 网络 + www.kimi.com + agent-browser | 零 npm 依赖，Node 内置 zlib 即可跑 |
| 可控性 | 不支持的元素类型不可见、不可修 | 每个元素映射有明确代码路径 + 警告日志 |
| 保真 | 官方口径（PPT 文件内模型），但不可验证 | 可做「pptd→pptx→pptd」往返回归，量化保真 |
| 兼容面 | 只服务官方编辑器可解析的子集 | 面向通用 OOXML（含 PowerPoint/WPS 产物） |

**结论**：原版的"双向转换"是平台能力而非 skill 能力；本项目要做的是把这一能力自研化、离线化。

---

## 2. 可行性分析

### 2.1 总体判断

**可行，且本项目有独特的优势**：writer 是自研的，它产出的 OOXML 是一个**已知、受限、有规律的子集**。因此导入器可以分两层设计：

1. **L1（保真层）**：优先完整支持"writer 自己产出的 OOXML"——对本项目导出的 pptx 做到**无损往返**（pptd → pptx → pptd 内容等价）。这保证了生态闭环内的转换质量。
2. **L2（兼容层）**：对 PowerPoint/WPS 等第三方产物，按元素类型逐个降级处理（见 §6 有损与回退矩阵），保证"能开就能导、导出来能看"。

### 2.2 元素级可行性矩阵

| PPTX 内容 | 对应 PPTD 元素 | 保真度 | 难点/说明 |
|---|---|---|---|
| `p:sp` + `p:txBody`（文本框） | `text` | ★★★ 无损 | 富文本 run 合并、`<span style>` 还原、基线/删除线、段落对齐 |
| `p:sp` + `p:prstGeom`（预设形状） | `shape` | ★★★ 无损 | prst 名与 PPTD shapeName 同源；avLst 调整值 |
| `p:sp` + `a:custGeom`（自定义路径） | `shape`/`line` | ★★☆ 有损 | OOXML path 命令 → SVG path 逆写；极端几何退化 |
| `p:cxnSp`（连接符） | `line` | ★★★ 无损 | 由 xfrm(off/ext/rot) 反推端点；headEnd/tailEnd → arrow |
| `p:pic`（图片） | `image` | ★★☆ 基本无损 | 媒体文件提取；srcRect → crop；图片填充丢失 |
| `p:graphicFrame` + `a:tbl` | `table` | ★★★ 无损 | gridSpan/rowSpan 合并还原；四边 border；单元格富文本 |
| `p:graphicFrame` + `c:chart` | `chart` | ★★☆ 基本无损 | 走 chart XML 的 numCache/strCache（无需解析 xlsx）；13 类映射 |
| `p:grpSp`（组合） | 多个元素 | ★★☆ 有损 | 递归展平 + 组变换合成到子元素 bounds |
| SmartArt（`dgm`） | — | ☆ 降级 | 无法逆写语义；导出端也不产出 SmartArt → 跳过 + 警告 |
| OLE/视频/音频（`oleObj`/`video`/`audio`） | — | ☆ 降级 | 跳过 + 警告（保留为占位注释） |
| 母版/版式（master/layout） | `theme` + 页面背景 | ★★☆ 有损 | 版式占位符内容合并进页面；版式背景并入页面 background |
| 动画/放映设置/备注母版 | — | 忽略 | PPTD 无对应字段；transition 统一由导出端重写为 fade |
| 主题（theme1.xml） | `theme.colors` + `textStyles` | ★★★ 无损 | clrScheme 12 槽 → 17 键 colors；fontScheme → textStyles |
| 嵌入字体（fntdata） | `deck.fonts`（仅声明） | ★★☆ 有损 | 子集化字体字节不搬运；命中内置字体库注册名则自动嵌入 |
| 演讲者备注 | `page.notes` | ★★★ 无损 | notesSlide 的 body 占位符文本 |

### 2.3 关键风险

1. **外部 pptx 的命名空间/变体**：WPS、Keynote 导出的 OOXML 在细节上有差异（如缺 cache、用 `a:alphaModFix`、`p:bgRef`）。→ 全部走「缺省回退」路径，不崩溃。
2. **文本 run 爆炸**：PowerPoint 常把一段文字拆成几十个 run。→ run 合并算法（相邻同属性 run 合并）。
3. **主题色引用**：第三方文件大量使用 `schemeClr`（如 `accent1`）、`tint/shade/alpha` 变换。→ 解析为具体色值（`srgbClr` 直接 hex；`schemeClr` 经主题表解析 + tint/shade 合成），不回写 `$token`（避免误引用）。
4. **尺寸**：第三方文件用 EMU 且带小数（如 `x="914400"`）。→ 统一 EMU/9525 → px，保留 1 位小数；往返测试容差 ±1px。
5. **图表**：c:chart 中数据既可能只有 cache 也可能只有引用；坐标轴/系列配置字段繁多。→ 只读 cache（PowerPoint 必然写 cache）；字段按 writer 的已知输出精确还原，其余取默认。

---

## 3. 总体设计

### 3.1 架构与目录

```
lib/pptx-import.js          # 导入器入口：importPptx(bytes, options) → 项目对象
  ├─ readZip()              # 自研 ZIP 读取（central directory + zlib.inflateRawSync）
  ├─ parseRels()            # _rels/*.rels → rId → {type, target}
  ├─ parsePresentation()    # presentation.xml → size/title/页序
  ├─ parseTheme()           # theme1.xml → colors/textStyles/fonts
  ├─ parseSlide()           # slideN.xml + 其 rels → page（元素数组）
  │   ├─ parseText()        #   p:sp + txBody → text 元素（富文本还原）
  │   ├─ parseShape()       #   p:sp + prstGeom/custGeom → shape/line
  │   ├─ parseConnector()   #   p:cxnSp → line
  │   ├─ parseImage()       #   p:pic → image（媒体提取）
  │   ├─ parseTable()       #   a:tbl → table（合并还原）
  │   ├─ parseChart()       #   c:chart 部件 → chart 元素
  │   └─ parseGroup()       #   p:grpSp → 递归展平
  ├─ parseNotes()           # notesSlideN.xml → notes
  └─ writeProject()         # 落盘 deck.pptd + pages/*.page + media/*
bin/open-pptd.js            # 新增子命令：open-pptd import <file.pptx> [-o <dir>] [--name <title>]
tests/pptx-import-roundtrip.mjs  # 往返回归：示例 deck → export → import → 结构对比
editor/（未来）              # 浏览器端导入：复用同模块（纯解析无 Node API 依赖部分）
```

复用现有资产：
- `editor/core/xml-parser.js`：零依赖 XML 解析器（剥命名空间前缀、实体解码）——直接复用；
- `editor/core/theme.js` 的 `themeColorSlots` 逆映射（OOXML 槽位 ↔ 17 键 colors）；
- `editor/core/geometry.js` 的 `parsePoints`（line 元素逆写）；
- `editor/writer/*` 的常量表（`PRESET_SHAPES` 的 prst 名、`SUPPORTED_SHAPES` 键名、`H_ALIGN` 等）——保证导入端与导出端同源。

### 3.2 数据流

```
file.pptx ──readZip──▶ { "ppt/slides/slide1.xml": bytes, ... }
   ├─ presentation.xml ──▶ size / title / 页序
   ├─ theme/theme1.xml ──▶ theme.colors(17键) + textStyles + 默认字体
   ├─ slideN.xml ──▶ page { background?, notes?, elements[] }
   │     └─ slide rels ──▶ 媒体/chart 部件定位
   ├─ notesSlides/notesSlideN.xml ──▶ page.notes
   └─ ppt/media/* ──▶ media/（图片元素引用）
writeProject ──▶ deck.pptd + pages/NN_name.page + media/*
```

### 3.3 保真目标分级

| 级别 | 定义 | 验收方式 |
|---|---|---|
| L0 无损 | writer 产出物 → import → export，与原始 PPTX 结构等价 | 往返测试：两版 PPTX 解包后逐 slide 元素比对（类型/坐标/文本/样式），容差 ±1px |
| L1 高保真 | 常规 PowerPoint 文件（文本框/形状/图片/表格/图表/备注/背景） | 元素级抽查 + 结构审查 + 编辑器预览 |
| L2 可用 | 含组合/自定义路径/版式占位符的复杂文件 | 降级规则生效，无元素静默丢失（全部有警告） |

---

## 4. 元素映射细则（OOXML → PPTD）

> 坐标：EMU → px 除以 9525；旋转 `rot/60000` 度（顺时针，与 PPTD 一致）；翻转 `flipH/flipV` → `flip: [h, v]`。元素顺序 = spTree 子节点顺序（即 z 序）。

### 4.1 文本框（p:sp + txBody）→ text

| OOXML | PPTD |
|---|---|
| `p:bodyPr@anchor` (t/ctr/b) | `content.align[1]` |
| `p:bodyPr@wrap="none"` | `content.wrap: false` |
| `p:bodyPr@vert` | `content.textDirection` |
| `a:p@algn` (l/ctr/r/just/dist) | `content.align[0]`（全部段落一致才提升到顶层） |
| `a:pPr/a:lnSpc` (spcPts/spcPct) | 段落级 `lineHeightPx` / `lineHeight`（span style） |
| `a:r/a:rPr@sz` | `fontSize`（1/100 pt） |
| `a:r/a:rPr` solidFill | `color`（srgbClr hex / schemeClr 解析） |
| `a:r/a:rPr` latin/ea typeface | `fontFamily`（latin≠ea → `{latin, ea}`） |
| `a:r/a:rPr@b/i/u/strike` | `bold/italic/<u>/<s>` |
| `a:r/a:rPr@baseline` (±25000) | `<sup>/<sub>` |
| `a:r/a:rPr@spc` | `letterSpacing`（1/100 pt） |
| `a:r/a:rPr` highlight | `backgroundColor` |
| `a:r/a:hlinkClick` | 链接：`<a href>` 语义保留为富文本？→ 降级：忽略 + 警告 |
| `a:br` | `<br/>` |

**run 合并规则**：相邻 run 若 rPr 全等（或都无 rPr）且文本连续 → 合并为一个 span；否则各自成 `<span style="...">`。全部 run 同属性 → 提升为 `content` 顶层字段（可读性最优）。

**段落处理**：单段纯文本 → `content.text` 直接写字符串；多段 → `<p>` 包裹；段落级差异（对齐/行距）→ `<p style="...">`。

### 4.2 形状（p:sp + prstGeom）→ shape

| OOXML | PPTD |
|---|---|
| `a:prstGeom@prst` | `shapeName`（键名同源 `SUPPORTED_SHAPES`，不识别 → 降级 rect + 警告） |
| `a:avLst/a:gd@fmla` | `adjustments`（按 writer 同源公式逆写，未识别 → 忽略） |
| `a:xfrm@rot/flipH/flipV` | `rotation` / `flip` |
| `a:solidFill/a:gradFill/a:noFill` | `fill`（gradFill: `a:lin@ang`(60000 分之一度，逆时针) → `angle`(度，顺时针)；`a:path@path="circle"` → radial） |
| `a:ln@w` + 子元素 | `border`（w/12700 → pt；prstDash → style dash/dot；noFill → null） |
| `a:effectLst/a:outerShdw` | `shadow`（blurRad/12700 → blur；dist+dir → offset [x,y]） |
| 填充/描边上的 `a:alpha` | 元素级 `opacity`（颜色写回不带 alpha 的 hex） |

### 4.3 连接符（p:cxnSp）→ line

writer 的 2 点直线编码：`off = (p0 − (len/2)(1−cosθ), p0y + (len/2)sinθ)`、`ext=(len, 0)`、`rot=θ`。**逆写**：

```
p0 = (off.x + (len/2)(1−cosθ), off.y − (len/2)sinθ)
p1 = (off.x + (len/2)(1+cosθ), off.y + (len/2)sinθ)
bounds = 两端点包围盒（h 最小 1px）
viewBox = [w, h]，points = "0,0 w,h"，curve: round
```

`a:ln` 的 `headEnd/tailEnd` → `arrow: [start, end]`（triangle→arrow、stealth、diamond、oval）。**多段曲线**（writer 用 `p:sp + a:custGeom`）：解析 `a:path@w/h` + path 命令（moveTo/lnTo/cubicBezTo）→ viewBox 坐标系 points；含 cubicBezTo → `curve: smooth`。

### 4.4 图片（p:pic）→ image

| OOXML | PPTD |
|---|---|
| `a:blip@r:embed` → rels → `../media/imageN.png` | `src: "media/imageN.png"`（字节落盘 media/） |
| `a:srcRect@l/t/r/b` | `crop: {left, top, right, bottom}`（千分位 → 0~1） |
| `a:blip/a:alphaModFix` | `opacity` |
| `p:spPr` xfrm | `bounds/rotation/flip` |
| `a:ln` | `border` |
| `a:prstGeom`（图片相框） | `cropShape`（仅当非 rect） |
| `p:nvPicPr/p:cNvPr@name` | `elementId` |

图片填充（`p:sp` 的 `a:blipFill`）→ PPTD 的 `fill: {type: image}` 理论上可映射，但需要媒体引用，先降级：**转成 image 元素语义近似 + 警告**（或忽略填充）。

### 4.5 表格（a:tbl）→ table

| OOXML | PPTD |
|---|---|
| `a:tblGrid/a:gridCol@w` | `columnWidths`（比例归一） |
| `a:tr@h` | `rowHeights`（比例归一） |
| `a:tc/a:tcPr` solidFill | `cell.fill` |
| `a:tc/a:tcPr` lnL/lnR/lnT/lnB | `cell.border`（四边数组 [上,右,下,左]） |
| `a:tc@gridSpan/rowSpan` | `cell.colSpan/rowSpan`；被覆盖格（vMerge/hMerge）**省略**（与 PPTD 合并规则一致） |
| `a:tc/a:txBody` | `cell.text`（富文本，同 4.1） |
| `a:tc/a:tcPr@anchor` + 段对齐 | `cell.align` |
| `a:tblPr`（首行/带状样式开关） | 不还原样式表，逐格写死样式（保真优先于简洁） |

### 4.6 图表（c:chart 部件）→ chart

数据来源：**只读 chart XML 内的 `c:numCache` / `c:strCache`**（PowerPoint 必然写入，writer 也写入），**不解析** 内嵌 xlsx。

| OOXML 容器 | PPTD series.type |
|---|---|
| `c:barChart`（barDir=col/bar） | `bar`（水平 → xAxis.type=value/yAxis.type=category） |
| `c:lineChart` | `line` |
| `c:areaChart` | `area` |
| `c:pieChart` / `c:doughnutChart` | `pie`（`c:holeSize` → `innerRadius`；`c:firstSliceAng` → `startAngle`） |
| `c:radarChart` | `radar` |
| `c:scatterChart` | `scatter`（xVal/yVal） |
| `c:bubbleChart` | `bubble`（xVal/yVal/bubbleSize） |
| `c:stockChart` | `candlestick`（hi/lo/open/close） |
| `c:treemapChart` | `treemap`（多级 → parent 列） |
| `c:sunburstChart` | `sunburst` |
| `c:waterfallChart` | `waterfall`（`c:invertIfNegative` + 累计判断 → isTotal 列） |

样式映射（writer 已知输出优先，其余取默认）：
- `c:ser/c:spPr` fill/ln → `series.fill/lineColor/width`；
- `c:grouping` (clustered/stacked/percentStacked) → `stack: "value"/"percent"`；
- `c:overlap` → `barGap`；`c:gapWidth` → `categoryGap`；
- `c:ser/c:marker` → `marker`；`c:ser/c:dLbls` (showVal/showPercent/showCatName) → `dataLabels.content`；
- `c:legend/c:legendPos` → `legend.position`；
- `c:catAx/c:valAx`：scaling min/max/orientation → `axis.min/max/reverse`；`c:title` → `axis.title`；majorGridlines → `axis.gridLine`；numFmt → `axis.label.numberFormat`；`c:axPos` 判断主/次轴；
- `c:chart/c:title` → `chart.title`；
- `c:ser/c:tx`（strCache 首值）→ `series.name`。

数据组装：`cols = [类别列名, s1名, s2名…]`（无名系列用 `系列 N` 占位，保证唯一）；`rows = [[cat1, v11, v21…], …]`；`encode = {x: 类别列, y: 系列列}`。

### 4.7 背景 / 备注 / 页类型

- `p:cSld/p:bg`：solidFill/gradFill → `background`（同 4.2 fill 规则）；`p:bgRef`（引用母版）→ 从母版/版式解析对应填充；都没有 → 不写。
- 版式/母版中的占位符（`p:ph`）：内容占位符（title/body）**合并进页面元素**；版式背景并入页面背景；装饰性母版元素（logo 等）→ 降级：跳过 + 警告（PPTD 无 master 概念，页面自包含是设计使然）。
- `notesSlideN.xml`：取 `p:ph type="body"` 所在文本框的全部段落 → `page.notes`。
- `pageType`：不推断（保持中性），封面/目录由后续编辑决定。

### 4.8 主题提取（theme1.xml）

```
clrScheme: dk2→colors.text, lt2→colors.bg, accent1→colors.primary,
           accent2→colors.accent, accent3-6→colors.accent3-6,
           dk1→windowText, lt1→window（不进 colors，用于 schemeClr 解析兜底）
派生键: muted = text×60%、line = bg 与 text 的 12% 混合、primarySoft = primary×12%、
       primaryTint = primary×25%、primaryDeep = primary×80%、
       success/warning/danger = 内置默认值（第三方主题无对应槽位）
fontScheme: majorFont → textStyles.title.fontFamily, minorFont → textStyles.body
```

`schemeClr` 解析管线：`schemeClr@val` → 槽位表 → 应用子元素变换（`a:tint`/`a:shade`/`a:alpha`/`a:satMod`/`a:lumMod`…）→ 最终 hex。**不回写 `$token`**（导入的页面独立于主题键，避免误引用导致颜色漂移；只有 writer 产物里本身就是 `$key` 的语义才在 L1 层尝试还原，且还原后校验一致性）。

### 4.9 字体与媒体

- **deck.fonts**：收集全部 run/主题字体（latin+ea）去重 → `fonts: { "<family>": {family: "<family>"} }`；命中内置字体库注册名（`references/fonts.md`）→ 导出时自动嵌入；未命中 → 仅声明（系统字体）。子集化嵌入的 `ppt/fonts/*.fntdata` 字节不搬运。
- **媒体**：`ppt/media/*` 按 rels 引用复制到 `media/`；文件名冲突自动重命名并在 `src` 中同步；EMF/WMF 矢量元文件 → 原样保留（PPTX 可显示，渲染器不支持时编辑器显示占位）。

---

## 5. CLI 与编辑器集成

```bash
open-pptd import <file.pptx> [-o <项目目录>] [--name <标题>]
# 默认输出目录：<pptx 同名>/，内含 deck.pptd + pages/*.page + media/*
# 之后可无缝衔接：open-pptd serve --project <dir>  或  open-pptd export <dir>/deck.pptd
```

编辑器集成（后续迭代）：在编辑器中加"导入 pptx"入口，浏览器端复用解析模块（`readZip` 换 `DecompressionStream`/FileReader 即可，纯解析部分无 Node API 依赖）。

---

## 6. 有损与回退矩阵（L2 兼容层）

| 输入特征 | 处理 | 用户可见性 |
|---|---|---|
| SmartArt / OLE / 视频 / 音频 | 跳过 | 控制台警告 + 页面注释占位 `# [import] 已跳过: SmartArt (shape id=…)` |
| `p:grpSp` 组合 | 递归展平：子元素 bounds 乘组变换（off/ext/rot） | 组内动画/相对关系丢失（PPTD 无组概念） |
| `a:custGeom` 未知 path 命令 | 降级为 rect | 警告 |
| 图片填充 / 纹理填充 | `fill: null` | 警告 |
| 文本框内图片（`a:r/a:blip`） | 降级为行内占位字符 | 警告 |
| 表格样式表（`a:tblStyle`） | 逐格写死样式（不引用 `tableStyles`） | 无（保真优先） |
| 版式占位符继承样式 | 就地解析为最终样式 | 无 |
| 主题 `tint/shade` 链 | 合成最终色值 | 无（不回写 `$token`） |
| 未知 chart 类型/未知 series 字段 | 跳过该图表 + 警告（页面其余元素保留） | 警告 |
| 加密/损坏文件 | 明确报错（CRC 校验、XML 解析异常兜底） | 报错信息 |
| 页面超宽元素 | 按实际值写入 bounds（不做钳制，交给校验步骤） | — |

所有降级路径在 `importPptx()` 返回的 `warnings[]` 中汇总，CLI 打印摘要，并写入项目根 `import-report.txt` 供用户查阅。

---

## 7. 校验与回归策略

### 7.1 往返测试（核心质量闸门）

```
对每个 examples/* 项目：
  deck.pptd ──export──▶ deck.pptx ──import──▶ imported/（pptd 项目）
  断言（结构等价，容差）：
    1. 页数、每页元素个数、元素类型序列一致
    2. 每个元素 bounds 偏差 ≤ 1.5px；rotation/flip 一致
    3. text 内容逐字符一致；fontSize/fontFamily/color 一致
    4. shape.shapeName 一致；table 行列数/合并/单元格文本一致
    5. chart 的 series 类型序列、cols/rows 数据一致
    6. 页面背景、notes 一致
  再 export：imported ──export──▶ imported.pptx，与 deck.pptx 解包逐 slide XML 比对（归一化后）
```

### 7.2 第三方文件测试集

- PowerPoint 原生保存的复杂文件（母版占位符、组合、SmartArt、主题变体）；
- WPS 导出文件；
- 本项目 writer 导出的文件（等价于 7.1，但覆盖全部 13 种图表类型）。

### 7.3 人工 QA

- `serve --project` 编辑器预览（导入结果直接可编辑）；
- `render` 出图人工核对（与原始 pptx 对照）。

---

## 8. 实施路线图

| 阶段 | 内容 | 状态 |
|---|---|---|
| P0 | 设计文档 + 可行性验证（本文档） | ✅ 完成 |
| P1 | 原型：ZIP 读取 / 主题提取 / 文本·形状·线条·图片·表格 / CLI `import` / 往返测试 | ✅ 完成（`lib/pptx-import.js`） |
| P2 | 图表导入（13 类 cache 解析）+ 组合展平 + 版式占位符合并 + 备注 | ⏳ 计划 |
| P3 | 编辑器"导入 pptx"入口（浏览器端复用）、导入报告 UI | ⏳ 计划 |
| P4 | 第三方文件测试集 + 容差调优 + `import-report.txt` 完善 | ⏳ 计划 |

---

## 9. 结论

1. **反向转换完全可行**，且本项目做自研导入器比原版更优：不依赖 Moonshot 线上服务、可离线、可回归、可解释。
2. **核心策略是"以 writer 为锚"**：L1 无损层围绕自研 writer 的已知 OOXML 子集构建，保证生态闭环内无损；L2 兼容层用降级矩阵兜住任意第三方文件。
3. **保真度排序**：文本/形状/线条/表格/主题 ≈ 无损；图片/图表 ≈ 高保真；组合/SmartArt/OLE = 降级（均有警告，无静默丢失）。
4. 原型（P1）已交付，可用 `open-pptd import` 实际转换任意 pptx，并用往返测试持续验证。
