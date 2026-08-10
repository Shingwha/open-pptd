# open-pptd v2 交接文档

> 最后更新：2026-08-10（阶段 A 完成，下一步 C1 + B）
> 本文档写给下一个接手的人：当前做到哪、怎么测试、下一步做什么、参考文件在哪。

---

## 1. 项目目标

把 v1（`~/.pi/agent/skills/open-pptd`）重构为 **v2**：自研编辑器 + 导出器严格对照 **PPTD 官方格式**（Kimi 官方编辑器使用，规范源在 `C:/Users/法法/Desktop/open-kimi-ppt/reference/pptd.md`），做到：

- 编辑器生成的 `.pptd/.page` 文件与官方格式**字段级一致**（官方编辑器可互读）
- 导出的 PPTX **PowerPoint 打开零修复弹窗**、渲染与预览一致
- 不保留 v1 的随意扩展与兼容代码

## 2. 当前状态（阶段 A：text 组件 ✅ 完成）

### 2.1 已完成

| 模块 | 状态 | 说明 |
|---|---|---|
| Git 基线 | ✅ | `2e06118` 导入 v1；`fa3f8b6` 起为 v2 开发 |
| 富文本 DSL | ✅ | `p/span/strong/em/u/s/sup/sub/a/ul/ol/li` + `style="..."` 属性，与官方 Rich Text Rules 一致 |
| **LaTeX 公式混排** | ✅ | `\(...\)` 富文本内嵌；行内 `a14:m + m:oMath`、独占段 `m:oMathPara + m:jc`，整框包 `mc:AlternateContent`（PowerPoint 原生结构）；KaTeX→MathML→OMML 全本地管线 |
| TextContent 字段 | ✅ | `color/fontSize/fontFamily/bold/italic/backgroundColor/lineHeight/lineHeightPx/letterSpacing/marginTop/textDirection/wrap/align/gradient/shadow` + 元素级 `rotation/opacity/flip` |
| 默认值 | ✅ | `align [left,top]`、`lineHeight 1`、`fontSize 18`、`fontFamily "MiSans"` |
| 透明度 | ✅ | run 级 `solidFill > 颜色元素 > a:alpha`（无色用 `schemeClr tx1`） |
| 渐变 | ✅ | `a:gs pos = position*100000`（100% = 100000） |
| 阴影 | ✅ | `outerShdw` 颜色直接子元素（不包 solidFill） |
| 图标 | ✅ | 官方 `iconName: "style:name"`：`bs:` 本地 Bootstrap 192 个 + `fas:/far:/fab:` → FA→Bootstrap 映射表（401 条，`editor/core/icon-name.js`） |
| autofit | ✅ | `spAutoFit` + 编辑器渲染后同步 bounds 高度（`view.js autoGrowTexts`） |
| 主题色 | ✅ | `$primary→accent1` 等 schemeClr 槽位 + theme1.xml 定义，预览/导出一致（`tests/color-consistency.mjs` 47 项回归） |

### 2.2 关键文件地图

```
editor/
  core/richtext.js      富文本解析（含 \(...\) 公式 → formula run）
  core/icon-name.js     iconName 解析（bs:/fas: 映射，严格 style:name）
  core/style.js         样式继承链（computeBaseStyle）
  core/theme.js         主题解析（normalizeTheme/resolveColor/resolveFont）
  writer/text.js        文本框导出（a14 公式/渐变/阴影/透明度/spAutoFit）
  writer/drawing.js     buildFill/buildShadow/buildLn/colorElement（含 opacity）
  writer/formula.js     injectRunStyle（公式 run 样式注入）
  writer/parts.js       theme1.xml（themeColorSlots）
tests/
  projects/text/        text 专项测试项目（6 页全特性，serve 用）
  projects/isolation/   隔离测试项目（14 页逐组件）
  reference/test-text.pptx  用户 PowerPoint 手工制作的官方结构基准
  isolate.mjs           逐页导出 iso-NN.pptx（定位弹修复）
  split-shape.mjs       形状逐个拆分导出
  package-integrity.mjs 包内引用一致性（rels/rId/Content_Types）
  color-consistency.mjs 预览/导出颜色一致性
references/official/    官方规范源（pptd.md/fonts.md/shapes.md/slides_categories.md）
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

## 3. 参考文件说明

| 路径 | 内容 | 用途 |
|---|---|---|
| `references/official/pptd.md` | 官方格式规范全文（TS 接口 + 字段表 + 示例） | **一切格式决策的唯一依据** |
| `references/official/fonts.md` | 官方字体清单（MiSans/Noto Sans SC/思源宋体…） | 字体选择器、默认字体 |
| `references/official/shapes.md` | 官方 177 种预置形状 + 调整值约束 | 阶段 C1 扩展 shapeName |
| `tests/reference/test-text.pptx` | **用户用 PowerPoint 手工制作的官方结构基准**：背景高亮 / 公式混排 / 渐变文字 / 翻转 / 30%·50% 透明文字 | 解包比对 writer 输出的权威样本（`python + zipfile` 解包读 `ppt/slides/slide1.xml`） |
| `docs/pptd-format.v1.md`、`docs/fonts.v1.md` | v1 自定义格式存档 | 仅供理解历史，**不得作为实现依据** |

比对方法（已固化）：解包用户参考文件 → 找目标效果的官方 XML 片段 → 与 `editor/writer/` 输出逐字节对照 → 修复 → 回归。

## 4. 测试流程（用户如何参与）

### 4.1 回归测试（接手后每次改动必跑）

```bash
# 1. 导出 text 专项项目
node bin/open-pptd.js export tests/projects/text/deck.pptd -o /tmp/check.pptx
# 2. 包内引用一致性（rels/rId/Content_Types/超链接）
node tests/package-integrity.mjs /tmp/check.pptx 6
# 3. 颜色两端一致性（预览 resolveColor vs 导出 schemeClr）
node tests/color-consistency.mjs
# 4. 公式转换回归（204 用例 vs 微软官方 XSLT）
node tests/formula/test-formula.mjs
# 5. 图标导出回归
node tests/icon/test-icon.mjs
```

### 4.2 PowerPoint 验证（需要用户参与）

1. **启动编辑器**：`node bin/open-pptd.js serve --project tests/projects/text` → 用户访问 `http://127.0.0.1:55173/editor/?deck=project/deck.pptd`（挂载路径随项目变）
2. **用户网页导出** → PowerPoint 打开 → 检查：**无修复弹窗** + 效果正确（对照 `tests/projects/README.md` 的测试项目登记表逐页看）
3. **弹修复定位法**：`node tests/isolate.mjs` 生成 `tests/out/iso-NN.pptx`（每页一种组件）→ 用户逐个打开，报编号 → 二分定位组件 → 必要时 `node tests/split-shape.mjs` 再拆
4. **官方结构比对**：用户在 PowerPoint 里手工做目标效果 → 另存 `tests/reference/test-<特性>.pptx`（**必须关闭 PowerPoint，避免 `~$` 锁文件**）→ 告知 → 解包比对修复

> 用户参与的完整约定见 `tests/projects/README.md`「PowerPoint 参考文件比对法」。

## 5. 下一步任务（C1 + B，已与用户确认）

### 5.1 C1：shape / line / image 字段对齐官方（优先）

隔离测试已证明这三个组件的 XML 导出**不弹修复**（iso-09/10/11），缺的是**字段语义对齐**：

- [ ] **fill 统一官方 `Fill` 类型**：`{color: "…"}` 简写 → `{type: solid, color: "…"}`（shape/line/image/icon 消费端已兼容 `Fill`，主要改：编辑器 UI 写入、主题库文件、`references/official` 对齐）
- [ ] **shape 26 → 177 种**：`editor/core/preset-geometry.data.js` 目前只有 21 种 ECMA-376 预置 + 基础 5；按 `references/official/shapes.md` 补全 177 种（名称 + 默认 adjustments + avLst 参数名），沿用"几何与 PowerPoint 同源、预览=导出"的现有机制（`preset-geometry.js` 由 `scripts/gen-preset-geometry.mjs` 生成）
- [ ] **shape 自定义路径**：官方 `shapeName: "custom"` + `viewBox` + `path`（SVG path，支持 M/L/H/V/C/S/Q/A/Z，镂空用内外环顺逆时针）——writer 需新增 `a:custGeom` 输出（从 SVG path 转 OOXML path 格式：`a:pt` + `a:lnTo/arcTo` 等，参考 PowerPoint 官方存储），渲染端用 SVG path 直接画
- [ ] **line 补 `curve` 语义**：官方 `curve: "sharp"|"round"|"smooth"`（v1 已有 points/viewBox/arrow，缺 curve 字段消费：sharp=直线段、round=圆角连接、smooth=贝塞尔，当前 v1 渲染/导出如何映射需对照）
- [ ] **image 补 `crop` / `cropShape`**：官方 `ImageCrop`（四边比例裁剪）+ `cropShape`（ShapeDef 裁剪轮廓），渲染顺序 crop → fit → cropShape
- [ ] 隔离项目补对应页（shape 更多类型 / line curve / image crop），重新走 4.2 验证

### 5.2 B：theme / tableStyles 官方化

- [ ] **manifest theme 内联对象**：`theme: {colors, textStyles, tableStyles}`（官方）——v1 的 `theme: "blue"` 字符串键是扩展，需迁移：编辑器 UI 的"主题切换"改为写入完整 theme 对象；`normalizeTheme` 保留字符串 key 解析（内部预设），但**序列化永远写对象**
- [ ] **取消 `fonts` 组件槽**（v1 扩展）：`fonts.title/body/…` 字体分工 → 迁移到 `theme.textStyles.<key>.fontFamily`（官方能力等价）；**保留字体资源表为扩展字段**（`fonts: {资源名: {family, url/file, subset}}`，官方编辑器忽略、本编辑器用于嵌入）
- [ ] **tableStyles 官方化**：v1 `{headerFill, headerColor, zebraFill…}` → 官方 `TableStyleConfig`（`cellStyle/firstRowStyle/lastRowStyle/firstColumnStyle/lastColumnStyle/bodyStyles/rowOverColumn`，CellStyle 含 fill/border/align）——**注意**：表格单元格模型（裸值行 → Cell 对象）属于 C2，本阶段只做"主题内 tableStyles 结构 + 表格 writer 按官方样式继承链消费"
- [ ] 内置 15 套色系预设转成预生成官方 theme 对象；`tests/projects/` 各项目 manifest 迁移为官方格式
- [ ] 主题库（`themes/`，v1 自定义 10 套）标注为待重写（阶段 D）

### 5.3 后续（暂缓）

- C2：table Cell 对象模型（`columnWidths/rowHeights/textStyle/rowSpan/colSpan`）
- C3：chart 13 系列 + ChartData
- 清理：废弃 `elementType: formula`（富文本已替代）、`themes/` 重写、SKILL.md/README 更新

## 6. 注意事项

- **不引入兼容旧格式的代码**：用户明确要求"不需要兼容旧名、不需要向后兼容，始终与官方标准保持一致"，发现 v1 兼容路径直接删除
- **XML 结构必须对照 PowerPoint 真实文件**：schema 顺序（rPr/pPr/spPr/outerShdw 子元素序列）、单位（pos/alpha/sz）、命名空间包装（a14/mc），凡有疑问先用 `tests/reference/test-text.pptx` 或让用户构建参考文件比对
- **任何"效果类"改动**都必须走 4.2 的 PowerPoint 验证（预览对不代表导出对，schema 违规会被静默修复）
- `tests/out/` 是生成产物（.gitignore）；`tests/reference/` 的 pptx 需入库（官方基准）
