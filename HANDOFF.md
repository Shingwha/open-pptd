# open-pptd v2 交接文档

> 最后更新：2026-08-10（阶段 A ✅ + C1 ✅ + B ✅ 主题/表格官方化 + 表格 4 项比对修复 + 测试扩充，下一步 C2）
> 本文档写给下一个接手的人：当前做到哪、怎么测试、下一步做什么、参考文件在哪。

---

## 1. 项目目标

把 v1（`~/.pi/agent/skills/open-pptd`）重构为 **v2**：自研编辑器 + 导出器严格对照 **PPTD 官方格式**（Kimi 官方编辑器使用，规范源在 `references/official/pptd.md`），做到：

- 编辑器生成的 `.pptd/.page` 文件与官方格式**字段级一致**（官方编辑器可互读）
- 导出的 PPTX **PowerPoint 打开零修复弹窗**、渲染与预览一致
- 不保留 v1 的随意扩展与兼容代码（发现 v1 兼容路径直接删除）

---

## 2. 当前状态（阶段 A ✅ + C1 ✅ + B ✅，下一步 C2）

### 2.1 已完成模块

| 模块 | 状态 | 说明 |
|---|---|---|
| Git 基线 | ✅ | `2e06118` 导入 v1；`fa3f8b6` 起为 v2 开发；当前 HEAD `090b40c` |
| 富文本 DSL | ✅ | `p/span/strong/em/u/s/sup/sub/a/ul/ol/li` + `style="..."` 属性，与官方 Rich Text Rules 一致（**无 `**` Markdown 语法**） |
| **LaTeX 公式混排** | ✅ | `\(...\)` 富文本内嵌；行内 `a14:m + m:oMath`、独占段 `m:oMathPara + m:jc`，整框包 `mc:AlternateContent`（PowerPoint 原生结构）；KaTeX→MathML→OMML 全本地管线（204 用例 vs 微软官方 XSLT 字节一致） |
| TextContent 字段 | ✅ | `color/fontSize/fontFamily/bold/italic/backgroundColor/lineHeight/lineHeightPx/letterSpacing/marginTop/textDirection/wrap/align/gradient/shadow` + 元素级 `rotation/opacity/flip` |
| 默认值 | ✅ | 文字 `align [left,top]`、`fontFamily "MiSans"`；表格 `align [center,middle]`、`border {solid,1,#000}` |
| 透明度 | ✅ | run 级 `solidFill > 颜色元素 > a:alpha`（无色用 `schemeClr tx1`）；HEX8 `#RRGGBBAA` 官方语法 |
| 渐变 | ✅ | `a:gs pos = position*100000`（100% = 100000） |
| 阴影 | ✅ | `outerShdw` 颜色直接子元素（不包 solidFill） |
| 图标 | ✅ | 官方 `iconName: "style:name"`：`bs:` 本地 Bootstrap 192 个 + `fas:/far:/fab:` → FA→Bootstrap 映射表（401 条，`editor/core/icon-name.js`）；源文件在 `assets/icons/`（`scripts/gen-icons.mjs` 生成 `icon-library.js`） |
| autofit | ✅ | `spAutoFit` + 编辑器渲染后同步 bounds 高度（`view.js autoGrowTexts`） |
| 主题色 | ✅ | `$key→schemeClr` 槽位（text/dk2、bg/lt2、primary/accent1、accent/accent2，其余 colors 键 srgbClr）+ theme1.xml 定义，预览/导出一致（`tests/color-consistency.mjs` 45+39 项回归） |
| **形状 187 种** | ✅ | ECMA-376 附录全量（`preset-geometry.data.js`：中文标签/14 菜单分类/多路径含明暗面与描边细节）；求值器支持 arcTo/quadBezTo/Q/A 全命令；修复 `3cd4` 数字前缀角度常量与 `cat2/sat2/at2` OOXML 参数序（arc 形状 4 方程验证） |
| **自定义路径** | ✅ | `shapeName:"custom"` + viewBox + path → `a:custGeom`（M/L/H/V/C/S/Q/T/A/Z 全命令 + 相对坐标；近重合端点整圆拆两段 180° 弧保持内外环顺逆时针；旋转弧贝塞尔降级） |
| **线条 curve** | ✅ | `sharp/round/smooth`：sharp=折线尖角、round=折线圆角、smooth=贝塞尔（首尾锚点 + 中间控制点）；曲线导出 `cxnSp + custGeom`（viewBox 坐标系随 bounds 拉伸）；箭头方向取端点切线 |
| **图片 crop/cropShape** | ✅ | crop→fit→cropShape 全管线：`cropFitSrcRect` 合成源矩形（cover/contain/fill 数学，含负值外扩）；cropShape 支持全部 187 种 + custom（spPr 几何轮廓）；预览 object-view-box + clip-path |
| **Theme 官方化** | ✅ | 严格 `{colors, textStyles, tableStyles}` 三字段（pptd.md §3），删除全部 v1 扩展（见 §5.1 完成清单） |
| **tableStyles 官方化** | ✅ | `Record<string, TableStyleConfig>` + 官方继承链消费（writer/renderer 同源），见 §5.1 |
| **表格 4 项比对修复** | ✅ | 与用户 PowerPoint 手工修改版逐字节比对：ln 边框结构/Cell 字段继承链/默认居中对齐/合并省略规则（见 §2.3 新增 4 条 + §3 参考文件） |
| 项目清理 | ✅ | `themes/`（v1 演示主题）、主题画廊（根 index.html + gallery.js）、v1 文档（docs/ 存档 + references 三件）、SKILL.md 已删；`icons/` → `assets/icons/`；根入口重定向到编辑器 |
| 测试重构 + 扩充 | ✅ | `tests/projects/` 每组件一个项目、产物入各项目 `out/`（gitignore `tests/projects/*/out/`）；table 8 页 / text 8 页 / icon 2 / line 2；`tests/run-all.mjs` 一键回归 11/11 |

### 2.2 关键文件地图

```
bin/open-pptd.js        CLI（serve / export / export-project）
lib/editor-server.js    本地服务器（静态 + /events SSE + /api/save 写回）
lib/pptd-export.js      项目包导出（deck+pages+media → zip）
editor/
  core/
    pptd-io.js          PPTD YAML ↔ 统一模型（宽容解析 / 子集序列化）
    model.js            统一数据模型 + SUPPORTED_SHAPES（187 种全量）
    richtext.js         富文本解析（含 \(...\) 公式 → formula run）
    style.js            文字样式继承链（computeBaseStyle）
    theme.js            主题解析（normalizeTheme/resolveColor/resolveFont/
                        mergeFonts/resolveTextStyle/resolveTableStyle/
                        resolveTableCellStyle + THEME_NAMES）
    theme-presets.js    内置主题数据（默认 + 17 套色系预设，官方结构）
    chart.js            图表模型（CHART_META + DEFAULT_CHART_PALETTE）
    table.js            表格布局（内容高度自适应，预览/导出共享）
    preset-geometry.js  预置形状求值器（ECMA-376 公式/路径 → SVG d，含 A/Q 命令）
    preset-geometry.data.js  187 种形状几何（AUTO-GENERATED）
    icon-library.js     内置图标库（AUTO-GENERATED，源在 assets/icons/）
    icon-name.js        iconName 解析（bs:/fas: 映射）
  writer/
    pptx.js             PPTX 组装入口（buildPptx）
    shape.js            p:sp 导出（prstGeom/custGeom + p:style）
    custgeom.js         SVG path → a:custGeom（整圆拆分/旋转弧贝塞尔/命令解析）
    line.js             p:cxnSp 导出（直线旋转 / 曲线 custGeom）
    image.js            图片导出（cropFitSrcRect 全管线 + cropShape 几何）
    text.js             文本框导出（a14 公式/渐变/阴影/透明度/spAutoFit）
    table.js            表格导出（官方继承链 + BorderSpec + Cell 字段 + ln 结构）
    chart.js            图表导出（bar/pie 简化）
    drawing.js          通用片段（xfrm/fill/border/shadow/presetGeom/shapeDefGeom）
    formula.js          公式 run 样式注入
    font.js             字体嵌入管线（deck.fonts 资源表扩展）
    parts.js            theme1.xml / 包部件
  renderer/             shape/line/image/text/table/chart/…（与 writer 同源）
  types/                元素类型注册表（menu/props/quickbar/render/toXml）
  interaction/dialogs/  表格网格 / 图表 / 图标编辑器
  app/                  state/view/io/toolbar/font-manager/…
assets/icons/           Bootstrap Icons 源（192 个 SVG，生成 icon-library.js）
references/
  official/             官方规范源（pptd.md/shapes.md/fonts.md/slides_categories.md）
  font-embedding.md     PPTX 字体嵌入实现手册（PowerPoint COM 实测结论）
scripts/
  gen-preset-geometry.mjs  187 形状数据生成（输入 ECMA-376 presetShapeDefinitions.xml）
  gen-icons.mjs             图标库生成
  gen-reference-shapes.py   python-pptx 全量参考生成（tests/reference 基准）
tests/                  见 §4
```

### 2.3 已修复的判损根因（防回归清单，勿回退）

| 特性 | 根因 | 正确结构 |
|---|---|---|
| 公式混排 | 裸 `<m:oMath>` 不是 a:p 合法子元素 | 整框 `mc:AlternateContent`（Choice Requires=a14）+ `a14:m` 包装；Fallback 降级 LaTeX 源码 |
| 文字高亮 | `a:highlight` 多包 `a:solidFill` | `<a:highlight><a:srgbClr …/></a:highlight>`（CT_Color 直接子元素） |
| 形状/图片阴影 | `a:outerShdw` 多包 `a:solidFill` | `<a:outerShdw …><a:srgbClr …/></a:outerShdw>` |
| rPr 子元素顺序 | effectLst 排在 latin/ea/cs 后 | fill → effectLst → highlight → latin/ea/cs → hlinkClick |
| 渐变 | `a:gs pos` 单位错（*1000） | `pos = position * 100000` |
| 文字透明度 | spPr `alphaModFix` 是形状填充语义 | run 级 `solidFill > 颜色元素 > a:alpha`（无色用 `schemeClr tx1`） |
| 删除线 | `strike="sng"` 非法 | `strike="sngStrike"`（ST_TextStrikeType） |
| autofit | normAutofit 缩字与预览矛盾 | `spAutoFit` + 编辑器增高 bounds |
| 元素翻转 | — | `a:xfrm flipH/flipV`（PowerPoint 对文字自动回正，属 PPT 行为，保留字段） |
| 图片预载（v1 遗留） | `io.js` 扩展名正则无捕获组 → mime 恒 null → 图片回退相对路径 404 | 正则 `/\\.([a-z0-9]+)$/i`（CDP 无头浏览器定位） |
| 自定义路径不可见 | `a:path` 内 `moveTo/lnTo` 漏 `a:` 前缀 → 不属于 DrawingML 命名空间 | `a:moveTo/a:lnTo` 全前缀（writer/custgeom.js） |
| 标注引线消失 | 预设几何内部线条由 `p:style lnRef` 驱动，spPr 无 `a:ln` 时回退 lnRef | 形状输出 `p:style`（lnRef idx=1 + fillRef/effectRef/fontRef）；**注意** spPr 有 `a:ln`（含 noFill）会覆盖 lnRef |
| avLst 默认值写法 | 总是写满默认调整值 vs PowerPoint「默认值留空」 | 未显式设置 adjustments 时输出空 `<a:avLst/>` |
| **表格边框全无** | tcPr 的 `a:lnL` 内错误包一层 `a:ln`——lnL/lnR/lnT/lnB 本身就是 CT_LineProperties（w/cap/cmpd/algn 属性直接在 lnL 上） | `<a:lnL w="12700" cap="flat" cmpd="sng" algn="ctr"><a:solidFill>…</a:solidFill><a:prstDash …/></a:lnL>`；无边框输出空 `<a:lnX/>` |
| **单元格字段不生效** | writer/renderer 只消费 cell.text/fill/border/span，Cell 内联字段（color/bold/fontFamily/fontSize/italic/backgroundColor/lineHeight/letterSpacing/marginTop/textStyle/align）被忽略 | 官方继承链：富文本 > span 内联 > 段落 > **Cell 内联** > **Cell.textStyle（"$key"）** > 位置分类 > bodyStyles > cellStyle > 默认（writer/table.js + renderer/table.js 同源实现） |
| **表格默认左对齐** | writer 的 `paragraphProps` 兜底 `algn="l"`（文字框默认）误用于表格 | 表格单元格默认对齐 = 官方 `[center, middle]`：tcXml 显式 `base.textAlign = align[0]`（cell.align > 分类 align > 默认居中） |
| **合并单元格失效** | 页面写错：被合并覆盖的位置未省略 + 缺 columnWidths → grid 列数不匹配 | 官方省略规则：2×2 合并后 row1 只剩 1 个元素（(1,2)）；columnWidths 必写且各项和为 1 |
| 富文本 Markdown 混淆 | 测试页用 `**加粗**`（Markdown）——官方 DSL 只有 `<strong>` | 富文本一律用官方标签（strong/em/u/s/sup/sub/a/span） |

---

## 3. 参考文件说明

| 路径 | 内容 | 用途 |
|---|---|---|
| `references/official/pptd.md` | 官方格式规范全文（TS 接口 + 字段表 + 示例） | **一切格式决策的唯一依据** |
| `references/official/shapes.md` | 官方 177 种预置形状 + 调整值约束 | 形状数据核对（实现按 ECMA-376 附录，两者一致） |
| `references/official/fonts.md` | 官方字体清单（MiSans/Noto Sans SC/思源宋体…26 款） | 字体选择器、默认字体 |
| `references/font-embedding.md` | PPTX 字体嵌入实现手册（PowerPoint COM 实测：子集化协议/金标准样本） | 字体嵌入功能实现依据（deck.fonts 资源表扩展） |
| `tests/reference/test-text.pptx` | 用户 PowerPoint 手工制作：背景高亮/公式混排/渐变文字/翻转/透明文字 | 文字 writer 官方结构基准 |
| `tests/reference/test-shape.pptx` | 用户 PowerPoint 手工制作：25 个形状 + 手绘 custGeom | 形状 prstGeom/avLst/p:style 结构基准 |
| `tests/reference/test-shapes-all.pptx` | python-pptx 全量基准（187 预置 + 7 自定义路径） | 逐形状对照导出渲染 |
| `tests/projects/table/out/check-table-修改后.pptx` | **用户 PowerPoint 手工修改版**（表格 4 项修复的比对基准：边框清空/对齐/合并/字体/颜色） | 表格 writer 官方结构基准（解包 slides/ 逐单元格比对） |

比对方法（已固化）：解包参考文件 → 找目标效果的官方 XML 片段 → 与 `editor/writer/` 输出逐字节对照 → 修复 → 回归。

---

## 4. 测试流程

### 4.1 自动回归（每次改动必跑）

```bash
npm test                      # = node tests/run-all.mjs
# 覆盖：全部组件项目导出（产物入 tests/projects/<项目>/out/check-<项目>.pptx）
#       → 包内引用一致性 → 颜色两端一致性 → 预置形状全量（187）
#       → 公式转换（204 用例 vs 微软官方 XSLT）→ 图标导出
```

单项：
```bash
node tests/isolate.mjs        # 逐项目逐页隔离导出（产物入各项目 out/iso-<项目>-NN.pptx）
node tests/package-integrity.mjs <out.pptx> <slideCount>
node tests/preset-shapes.mjs  # 形状全量（含 ST_ShapeType 枚举合法性）
node tests/color-consistency.mjs tests/projects/table   # 颜色一致性可指定项目
```

### 4.2 PowerPoint 验证（需要用户参与）

1. **启动编辑器**：`node bin/open-pptd.js serve --project tests/projects/table` → 用户访问打印的 URL
2. **用户网页导出** → PowerPoint 打开 → 检查：**无修复弹窗** + 效果正确
3. **弹修复定位法**：`node tests/isolate.mjs` → 用户逐个打开各项目 `out/iso-*.pptx`，报编号 → 二分定位组件
4. **官方结构比对**：用户在 PowerPoint 里手工做目标效果（或修改我们导出的文件）→ 另存到对应位置告知路径（**必须关闭 PowerPoint 避免 `~$` 锁文件**）→ 解包比对修复

### 4.3 E2E（真实浏览器，需 Chrome/Edge）

```bash
npm run test:live             # SSE 实时刷新 + 保存写回磁盘
npm run test:incremental      # 渐进加载（写入中的项目逐页显示）
```

### 4.4 测试项目覆盖点（tests/README.md 有完整表格）

- **table 8 页**：样式对比（compact/colorful/noframe）、BorderSpec 四边/虚线/外框/单元格级、对齐、合并（官方省略规则）、填充（Table.fill/渐变/主题引用）、字体（字符串/{latin,ea}/分类/span）、颜色（HEX6/HEX8/引用/高亮/装饰）
- **text 8 页**：富文本/公式/布局/效果/图标/颜色体系/字体体系
- **shape 8 页**：187 全量 + custGeom；**icon 2 / line 2 / chart 2 / image 1**

---

## 5. 下一步任务

### 5.1 B：theme / tableStyles 官方化（✅ 完成，2026-08-10）

> 2026-08-10 已清理 v1 主题体系（themes/ 目录、主题画廊、v1 文档、SKILL.md）。

**完成清单：**

- [x] **Theme 严格官方化**（pptd.md §3）：`{colors, textStyles, tableStyles}` 三字段；删除 v1 扩展——`name`（→ `THEME_NAMES` 映射）、`chartStyles`（→ colors 键回退 + 内置 `DEFAULT_CHART_PALETTE`）、`colors.series` 数组、`fonts.latin/ea` 槽（→ 官方默认 "MiSans"）、动态派生令牌 `$primary-soft/tint/deep`（→ 预设 colors 显式 `primarySoft/primaryTint/primaryDeep` hex）、透明度令牌 `$xxxAA`（→ 官方 HEX8）
- [x] **tableStyles 官方化**：`resolveTableStyle` + `resolveTableCellStyle`（官方继承链 + rowOverColumn 仲裁）；writer/renderer 消费 Cell 全字段（填充链/BorderSpec 四边/align/字体/颜色）
- [x] **17 套色系预设官方化**（每套只写 colors）；tests/projects/table 官方 tableStyles 示例；新建表格默认 `style: "$default"`
- [x] **字体槽迁移**：组件槽废弃（warn+忽略）；字体资源表扩展保留（字体嵌入管线）
- [x] **序列化永远写对象**（applyTheme/applyHistory 展开 + 深拷贝）
- [x] **表格 4 项比对修复**（§2.3）+ 测试页修正（strong 语法/合并规则/columnWidths）
- [ ] 剩余（并入阶段 D）：重写主题体系（原 themes/ 演示模板以官方格式重建）

### 5.2 C2：table Cell 对象模型（**下一步，优先**）

> 字段消费已完成一半（writer/renderer 的官方继承链），剩下是编辑器 UI 与模型规范化。

- [ ] **裸值单元格规范化**：`parseDeck`/编辑器模型把 `string/number → {text}`（读旧项目宽容转换）；**序列化永远写 Cell 对象**（`{text}`），不再输出裸值行
- [ ] **table-editor 对话框增强**（`editor/interaction/dialogs/table-editor.js` 目前只有网格文本编辑）：
  - 单元格样式编辑：选中单元格 → color/fontSize/bold/italic/fontFamily/fill/align/backgroundColor
  - 合并/拆分：选中区域 → 合并（写 rowSpan/colSpan + 省略被覆盖位）/拆分
  - 被合并覆盖位置在网格中可视化（灰显）
  - 行高/列宽编辑（rowHeights/columnWidths 比例，官方约束 [0,1] 且和=1）
- [ ] **约束校验**：columnWidths/rowHeights 和=1 校验（parseDeck warn + 编辑器 UI 提示）
- [ ] **渲染器细节**：Cell.lineHeight/lineHeightPx/letterSpacing/marginTop 在 td 样式消费（目前 line-height 固定 1.35）
- [ ] **BorderSpec 编辑器 UI**：四边独立编辑（[上,右,下,左] 数组）或 null 清除
- [ ] 测试页补充：单元格 textStyle "$key" 引用、bodyStyles 非 2 项循环（3 色循环）

### 5.3 C3：chart 13 系列 + ChartData（暂缓）

- [ ] 官方 13 种系列类型（bar/line/area/radar/scatter/bubble/candlestick/pie/doughnut/sunburst/sankey/treemap/heatmap/waterfall）全量注册 `CHART_META`
- [ ] 官方结构：`ChartData {cols, rows}`、`seriesDefaults[type]`（§3.4 合并规则：标量覆盖/对象浅合并/数组整替）、`encode`、各类型字段（lineColor/areaColor/marker/fill 数组/upBars/downBars/colorScheme…）
- [ ] **色彩机制对齐**（§5.2）：系列 fill/lineColor/areaColor > seriesDefaults > **theme color cycle**（官方语义未明确定义 cycle 取色序——需对照官方编辑器实现或与用户确认；当前 `DEFAULT_CHART_PALETTE` 硬编码为过渡）
- [ ] writer：`c:chart` XML 各类型（现仅 bar/pie + scatter 简化）；renderer：ECharts option 同步；xlsx 数据组装
- [ ] 图表编辑器 UI（chart-editor.js：列/行/系列/类型切换/颜色）
- [ ] 测试项目扩充（现 2 页 bar/pie）→ 多类型 + 颜色变体

### 5.4 D：主题体系重建 + 编辑器 UX（暂缓）

- [ ] 以官方格式重建演示主题（原 themes/ 10 套，deck.pptd + pages/ + tableStyles）
- [ ] 编辑器主题 UX：当前 toolbar 下拉只换 colors 预设（17 套）——考虑主题编辑对话框（colors/textStyles/tableStyles 可视化编辑，写入官方 theme 对象）
- [ ] 画廊回归？（根入口已重定向编辑器；主题重建后可考虑恢复画廊或保持精简）

### 5.5 清理遗留（随各阶段推进）

- [ ] **删除 v1 兼容代码**：`writer/drawing.js` buildFill 的 `fill.color` 旧形态分支（消费端已全部写 `{type: solid, color}`）、`renderer/shape.js` 的旧形态兼容、`preset-geometry.js` 的 `shapePathD` 兼容接口（仅菜单图标用，可改走 shapePaths）
- [ ] **废弃 `elementType: formula`**：`types/formula.js` + `renderer/formula.js` + `writer/formula.js`（富文本 `\(...\)` 已完全替代；writer/formula.js 的 injectRunStyle 是公式 run 样式注入，需保留逻辑并入 richtext 导出）
- [ ] **字体嵌入验证**：deck.fonts 资源表扩展 + writer/font.js 管线已就绪但无测试覆盖——加一个带嵌入字体的测试项目（需本地字体文件，参照 `references/font-embedding.md`）
- [ ] **SKILL.md**：v2 全部完成后，直接引用 Kimi 官方标准 skill（`open-kimi-ppt`），只需修改其中编辑器/导出相关章节（serve 用法、测试流程）
- [ ] 文档同步：README/HANDOFF 随阶段推进更新

---

## 6. 注意事项

- **不引入兼容旧格式的代码**：用户明确要求"不需要兼容旧名、不需要向后兼容，始终与官方标准保持一致"，发现 v1 兼容路径直接删除
- **XML 结构必须对照 PowerPoint 真实文件**：schema 顺序（rPr/pPr/spPr/outerShdw/tcPr 子元素序列）、单位（pos/alpha/sz/EMU）、命名空间包装（a14/mc/a: 前缀），凡有疑问先用参考文件或让用户构建参考文件比对（见 §4.2）——**表格修复即靠 check-table-修改后.pptx 逐字节比对定位**
- **任何"效果类"改动**都必须走 §4.2 的 PowerPoint 验证（预览对不代表导出对，schema 违规会被静默修复）
- **标注引线/描边路径的坑**：预设几何内部线条由 `p:style lnRef` 驱动，spPr 里出现 `a:ln`（即使 noFill）会覆盖——给形状加边框时注意别让引线消失
- **表格边框的坑**：`a:lnL` 等直接承载线属性（CT_LineProperties），**不能包 `a:ln`**；无边框写空 `<a:lnX/>`；tcPr 内 lnL/lnR/lnT/lnB 必须位于填充之前
- **表格默认值**：对齐 `[center, middle]`、边框 `{solid, 1, #000000}`（官方）；单元格继承链见 §2.3
- **富文本 DSL 无 Markdown**：`**`/`*斜体*` 不是官方语法，一律用 `<strong>/<em>` 标签
- `tests/projects/*/out/` 是生成产物（.gitignore）；`tests/reference/` 的 pptx 需入库（官方基准）
- 图形源文件（ECMA-376 presetShapeDefinitions.xml）在官方下载包：`ECMA-376-1_5th_edition_december_2016.zip` → `OfficeOpenXML-DrawingMLGeometries.zip`（重新生成 187 形状数据时使用）
