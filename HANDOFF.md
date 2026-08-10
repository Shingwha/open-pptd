# open-pptd v2 交接文档

> 最后更新：2026-08-10（阶段 A ✅ + C1 ✅ + 项目清理完成，下一步 B）
> 本文档写给下一个接手的人：当前做到哪、怎么测试、下一步做什么、参考文件在哪。

---

## 1. 项目目标

把 v1（`~/.pi/agent/skills/open-pptd`）重构为 **v2**：自研编辑器 + 导出器严格对照 **PPTD 官方格式**（Kimi 官方编辑器使用，规范源在 `references/official/pptd.md`），做到：

- 编辑器生成的 `.pptd/.page` 文件与官方格式**字段级一致**（官方编辑器可互读）
- 导出的 PPTX **PowerPoint 打开零修复弹窗**、渲染与预览一致
- 不保留 v1 的随意扩展与兼容代码（发现 v1 兼容路径直接删除）

---

## 2. 当前状态（阶段 A ✅ + C1 ✅，下一步 B）

### 2.1 已完成模块

| 模块 | 状态 | 说明 |
|---|---|---|
| Git 基线 | ✅ | `2e06118` 导入 v1；`fa3f8b6` 起为 v2 开发；当前 HEAD `c305193`（清理） |
| 富文本 DSL | ✅ | `p/span/strong/em/u/s/sup/sub/a/ul/ol/li` + `style="..."` 属性，与官方 Rich Text Rules 一致 |
| **LaTeX 公式混排** | ✅ | `\(...\)` 富文本内嵌；行内 `a14:m + m:oMath`、独占段 `m:oMathPara + m:jc`，整框包 `mc:AlternateContent`（PowerPoint 原生结构）；KaTeX→MathML→OMML 全本地管线（204 用例 vs 微软官方 XSLT 字节一致） |
| TextContent 字段 | ✅ | `color/fontSize/fontFamily/bold/italic/backgroundColor/lineHeight/lineHeightPx/letterSpacing/marginTop/textDirection/wrap/align/gradient/shadow` + 元素级 `rotation/opacity/flip` |
| 默认值 | ✅ | `align [left,top]`、`lineHeight 1`、`fontSize 18`、`fontFamily "MiSans"` |
| 透明度 | ✅ | run 级 `solidFill > 颜色元素 > a:alpha`（无色用 `schemeClr tx1`） |
| 渐变 | ✅ | `a:gs pos = position*100000`（100% = 100000） |
| 阴影 | ✅ | `outerShdw` 颜色直接子元素（不包 solidFill） |
| 图标 | ✅ | 官方 `iconName: "style:name"`：`bs:` 本地 Bootstrap 192 个 + `fas:/far:/fab:` → FA→Bootstrap 映射表（401 条，`editor/core/icon-name.js`）；源文件在 `assets/icons/`（`scripts/gen-icons.mjs` 生成 `icon-library.js`） |
| autofit | ✅ | `spAutoFit` + 编辑器渲染后同步 bounds 高度（`view.js autoGrowTexts`） |
| 主题色 | ✅ | `$primary→accent1` 等 schemeClr 槽位 + theme1.xml 定义，预览/导出一致（`tests/color-consistency.mjs` 47 项回归） |
| **形状 187 种** | ✅ | ECMA-376 附录全量（`preset-geometry.data.js`：中文标签/14 菜单分类/多路径含明暗面与描边细节）；求值器支持 arcTo/quadBezTo/Q/A 全命令；修复 `3cd4` 数字前缀角度常量与 `cat2/sat2/at2` OOXML 参数序（arc 形状 4 方程验证） |
| **自定义路径** | ✅ | `shapeName:"custom"` + viewBox + path → `a:custGeom`（M/L/H/V/C/S/Q/T/A/Z 全命令 + 相对坐标；近重合端点整圆拆两段 180° 弧保持内外环顺逆时针；旋转弧贝塞尔降级） |
| **线条 curve** | ✅ | `sharp/round/smooth`：sharp=折线尖角、round=折线圆角、smooth=贝塞尔（首尾锚点 + 中间控制点）；曲线导出 `cxnSp + custGeom`（viewBox 坐标系随 bounds 拉伸）；箭头方向取端点切线 |
| **图片 crop/cropShape** | ✅ | crop→fit→cropShape 全管线：`cropFitSrcRect` 合成源矩形（cover/contain/fill 数学，含负值外扩）；cropShape 支持全部 187 种 + custom（spPr 几何轮廓）；预览 object-view-box + clip-path |
| 项目清理 | ✅ | `themes/`（v1 演示主题）、主题画廊（根 index.html + gallery.js）、v1 文档（docs/ 存档 + references 三件）、SKILL.md 已删；`icons/` → `assets/icons/`；根入口重定向到编辑器 |
| 测试重构 | ✅ | `tests/projects/` 每组件一个项目（text/shape/line/image/icon/table/chart）；`tests/run-all.mjs` 一键回归 11/11 通过；isolate 逐项目逐页隔离导出 |

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
    style.js            样式继承链（computeBaseStyle）
    theme.js            主题解析（normalizeTheme/resolveColor/mergeFonts/resolveTableStyle）
    theme-presets.js    内置主题数据（默认 + 15 套色系预设，B 阶段转官方格式）
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
    drawing.js          通用片段（xfrm/fill/border/shadow/presetGeom/shapeDefGeom）
    formula.js          公式 run 样式注入
    parts.js            theme1.xml / 包部件
  renderer/             shape/line/image/text/…（与 writer 同源）
  types/                元素类型注册表（menu/props/quickbar/render/toXml）
  app/                  state/view/io/toolbar/…
assets/icons/           Bootstrap Icons 源（192 个 SVG，生成 icon-library.js）
references/
  official/             官方规范源（pptd.md/shapes.md/fonts.md/slides_categories.md）
  font-embedding.md     PPTX 字体嵌入实现手册（PowerPoint COM 实测结论，B 阶段用）
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
| 标注引线消失 | 预设几何 fill="none" 描边路径（标注引线/弧线/括号中线）用形状线条样式画：spPr 无 `a:ln` 时回退 `p:style lnRef`，无 p:style 则不画 | 形状输出 `p:style`（lnRef idx=1 + fillRef/effectRef/fontRef，与参考文件逐字节一致）；**注意** spPr 有 `a:ln`（含 noFill）会覆盖 lnRef（python-pptx 实验证实） |
| avLst 默认值写法 | 总是写满默认调整值 vs PowerPoint「默认值留空」 | 未显式设置 adjustments 时输出空 `<a:avLst/>`（与参考文件一致） |

---

## 3. 参考文件说明

| 路径 | 内容 | 用途 |
|---|---|---|
| `references/official/pptd.md` | 官方格式规范全文（TS 接口 + 字段表 + 示例） | **一切格式决策的唯一依据** |
| `references/official/shapes.md` | 官方 177 种预置形状 + 调整值约束 | 形状数据核对（实现按 ECMA-376 附录，两者一致） |
| `references/official/fonts.md` | 官方字体清单（MiSans/Noto Sans SC/思源宋体…） | 字体选择器、默认字体 |
| `references/font-embedding.md` | PPTX 字体嵌入实现手册（PowerPoint COM 实测：子集化协议/金标准样本） | B 阶段 fonts 资源表嵌入功能的实现依据 |
| `tests/reference/test-text.pptx` | 用户 PowerPoint 手工制作：背景高亮/公式混排/渐变文字/翻转/透明文字 | 文字 writer 官方结构基准 |
| `tests/reference/test-shape.pptx` | 用户 PowerPoint 手工制作：25 个形状（标注/箭头/流程图/括号/立方体/泪滴 + 手绘 custGeom） | 形状 prstGeom/avLst/p:style 结构基准 |
| `tests/reference/test-shapes-all.pptx` | python-pptx 全量基准（187 预置 + 7 自定义路径，`scripts/gen-reference-shapes.py` 生成） | 逐形状对照导出渲染 |

比对方法（已固化）：解包参考文件 → 找目标效果的官方 XML 片段 → 与 `editor/writer/` 输出逐字节对照 → 修复 → 回归。

---

## 4. 测试流程

### 4.1 自动回归（每次改动必跑）

```bash
npm test                      # = node tests/run-all.mjs
# 覆盖：全部组件项目导出（text/shape/line/image/icon/table/chart）→ 包内引用一致性
#       → 颜色两端一致性（47 项）→ 预置形状全量（187 prst 名 + custGeom 结构）
#       → 公式转换（204 用例 vs 微软官方 XSLT）→ 图标导出（15 项）
```

单项：
```bash
node tests/isolate.mjs        # 逐项目逐页导出 tests/out/iso-<项目>-NN.pptx（定位弹修复）
node tests/package-integrity.mjs <out.pptx> <slideCount>
node tests/preset-shapes.mjs  # 形状全量（含 ST_ShapeType 枚举合法性）
```

### 4.2 PowerPoint 验证（需要用户参与）

1. **启动编辑器**：`node bin/open-pptd.js serve --project tests/projects/shape` → 用户访问打印的 URL（`/editor/?deck=project/deck.pptd`）
2. **用户网页导出** → PowerPoint 打开 → 检查：**无修复弹窗** + 效果正确
3. **弹修复定位法**：`node tests/isolate.mjs` → 用户逐个打开 `tests/out/iso-*.pptx`，报编号 → 二分定位组件（形状类可再跑 `tests/preset-shapes.mjs` 的 8 页产物）
4. **官方结构比对**：用户在 PowerPoint 里手工做目标效果（或 `scripts/gen-reference-shapes.py` 用 python-pptx 批量生成）→ 另存 `tests/reference/test-<特性>.pptx`（**必须关闭 PowerPoint，避免 `~$` 锁文件**）→ 告知 → 解包比对修复

### 4.3 E2E（真实浏览器，需 Chrome/Edge）

```bash
npm run test:live             # SSE 实时刷新 + 保存写回磁盘
npm run test:incremental      # 渐进加载（写入中的项目逐页显示）
```

---

## 5. 下一步任务

### 5.1 B：theme / tableStyles 官方化（**实施中**，2026-08-10 起）

> **2026-08-10 清理**：v1 主题体系已全部移除——`themes/`（10 套演示主题 + manifest）、`scripts/gen-themes-manifest.js`、根 `index.html` 主题画廊与 `editor/gallery.js`（根入口改为重定向到编辑器）。内置 `editor/core/theme-presets.js`（15 套色系 + 默认主题）保留为编辑器运行所需，B 阶段转成官方 theme 对象。

**已完成：**

- [x] **Theme 严格官方化**（references/official/pptd.md §3）：`{colors, textStyles, tableStyles}` 三字段，删除全部 v1 扩展——`name`（→ `THEME_NAMES` 映射表）、`chartStyles`（图表样式改用 colors 键回退 + 内置 `DEFAULT_CHART_PALETTE`，官方色循环 C3 对齐）、`colors.series` 数组、`fonts.latin/ea` 默认字体槽（→ 官方默认 "MiSans"）、动态派生令牌 `$primary-soft/tint/deep` 与透明度令牌 `$primary20`/`$xxxAA`（→ 预设 colors 显式 `primarySoft/primaryTint/primaryDeep` hex 键，预览=导出恒定；透明度用官方 HEX8 `#RRGGBBAA`）
- [x] **tableStyles 官方化**：`Record<string, TableStyleConfig>`；`resolveTableStyle(theme, "$key"|内联)` + `resolveTableCellStyle`（官方继承链：cellStyle 基底 → bodyStyles 数据行循环 → 位置分类，rowOverColumn 默认 true=行优先）；表格 writer/renderer 同步消费——填充链（cell.fill > 分类 > cellStyle > Table.fill > 透明）、BorderSpec 四边独立（null=清除）、CellStyle.align → tcPr anchor + pPr algn（官方默认 [center, middle]）、边框默认 {solid,1,#000000}
- [x] **17 套色系预设官方化**：每套只写 colors（官方结构），派生色显式算好写入；tests/projects/table 增加官方 tableStyles.default 示例 + `style: "$default"` 引用；新建表格元素默认 `style: "$default"`
- [x] **字体槽迁移**：`deck.fonts` 组件槽（latin/ea/title/body…）废弃（遇旧项目 warn + 忽略，官方等价 = `theme.textStyles.<key>.fontFamily`）；**字体资源表扩展保留**（`{key: {family, url/file, subset}}` → 本编辑器嵌入，官方编辑器宽容忽略）
- [x] **序列化永远写对象**：io.applyTheme/applyHistory 字符串主题 key 展开为对象 + 深拷贝隔离预设引用
- [ ] 剩余：浏览器验证（serve + 导出 + PowerPoint 检查表格渲染与预览一致）
- [ ] 重写主题体系（原 themes/ 演示模板已删，后续以官方格式重建，可并入阶段 D）

### 5.2 C2：table Cell 对象模型（暂缓）

- `columnWidths/rowHeights/textStyle/rowSpan/colSpan`，裸值行（string/number → `{text}`）迁移为 Cell 对象；表格 writer 改为按官方单元格模型输出（含合并单元格、单元格级填充/边框/对齐）

### 5.3 C3：chart 13 系列 + ChartData（暂缓）

- chart 13 种系列类型（bar/line/pie/radar/scatter/bubble/area/doughnut/…）+ 官方 ChartData 结构；当前仅 bar/pie 简化实现

### 5.4 清理遗留（随各阶段推进）

- [ ] **删除 v1 兼容代码**：`writer/drawing.js` buildFill 的 `fill.color` 旧形态分支（消费端已全部写 `{type: solid, color}`）、`renderer/shape.js` 的旧形态兼容、`preset-geometry.js` 的 `shapePathD` 兼容接口（仅菜单图标用，可改走 shapePaths）
- [ ] **废弃 `elementType: formula`**：`types/formula.js` + `renderer/formula.js` + `writer/formula.js`（富文本 `\(...\)` 已完全替代；writer/formula.js 的 injectRunStyle 是公式 run 样式注入，需保留逻辑并入 richtext 导出）
- [ ] **SKILL.md**：v2 全部完成后，直接引用 Kimi 官方标准 skill（`open-kimi-ppt`），只需修改其中编辑器/导出相关章节（serve 用法、测试流程）
- [ ] 文档同步：README/HANDOFF 随阶段推进更新

---

## 6. 注意事项

- **不引入兼容旧格式的代码**：用户明确要求"不需要兼容旧名、不需要向后兼容，始终与官方标准保持一致"，发现 v1 兼容路径直接删除
- **XML 结构必须对照 PowerPoint 真实文件**：schema 顺序（rPr/pPr/spPr/outerShdw 子元素序列）、单位（pos/alpha/sz）、命名空间包装（a14/mc/a: 前缀），凡有疑问先用 `tests/reference/` 参考文件或让用户构建参考文件比对（见 §4.2）
- **任何"效果类"改动**都必须走 §4.2 的 PowerPoint 验证（预览对不代表导出对，schema 违规会被静默修复）
- **标注引线/描边路径的坑**：预设几何内部线条由 `p:style lnRef` 驱动，spPr 里出现 `a:ln`（即使 noFill）会覆盖——给形状加边框时注意别让引线消失
- `tests/out/` 是生成产物（.gitignore）；`tests/reference/` 的 pptx 需入库（官方基准）
- 图形源文件（ECMA-376 presetShapeDefinitions.xml）在官方下载包：`ECMA-376-1_5th_edition_december_2016.zip` → `OfficeOpenXML-DrawingMLGeometries.zip`（重新生成 187 形状数据时使用）
