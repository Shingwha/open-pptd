# 编辑器 v2 UX 改造方案（主题配色 + 面板对齐 + 清理）

> 状态：方案定稿 ｜ 执行方式：fork 子线程按本文件实施 ｜ 决策日期：2026-08-11
> 背景：编辑器 UI 落后于 v2 PPTD 属性模型；主题配色（17 套）在 v2 对齐时被删除；
> 目标：加回「一套颜色」粒度的主题配色支持（官方格式）、面板补齐 v2 字段、
> 浮动编辑条规范化、清理过时代码。**不做**：主题编辑对话框（textStyles/tableStyles 可视化）、
> 坐标轴/图例 UI、表格高级样式 UI（列二期）。

---

## 0. 已核实的现状事实（探索结论，勿再重复探索）

1. **编辑器架构**：`types/registry.js` 注册表机制，每组件声明 `props`（右侧属性面板分组）+ `quickbar`（浮动快调条）。浮动条 + 面板双轨制已存在，无需重构。
2. **渲染/导出层已支持大量 v2 字段但 UI 未暴露**：rotation / opacity / flip / shadow（全部 7 种组件）、渐变填充、图片背景、演讲者备注 notes、HEX8 颜色。补 UI 不需要动 writer。
3. **主题落盘机制**（writer/parts.js `themeColorSlots`）：PPTX theme1.xml 的 clrScheme 槽位映射为
   `dk2→colors.text, lt2→colors.bg, accent1→colors.primary, accent2→colors.accent,`
   `accent3→accent3||success||primary, accent4→accent4||warning||accent,`
   `accent5→accent5||danger||primary, accent6→accent6||primaryDeep||accent`。
   **其余 colors 键（muted/line/primarySoft 等）不进 PPTX 主题**，导出时经 `resolveColor` 解析成 hex 直接写 `srgbClr`。→ 因此「在 theme.colors 中加新键」完全安全，格式始终合法（`Record<string, Color>`）。
4. **官方 PPTD 图表取色**（references/pptd.md §3.1/§5.2）：系列默认色 = **Theme.colors 主题色循环**（按系列出现顺序逐一取色循环）。当前实现 `core/chart.js` 硬编码 `DEFAULT_CHART_PALETTE`（8 色常量），**违反官方语义**，是"删主题"遗留的尾巴。
5. `app/io.js` 的 `applyTheme()` 仍完好（深拷贝写 `state.deck.theme` → 重新 `normalizeTheme` + `mergeFonts`），直接复用。
6. v1 的 17 套配色完整色值在 git 历史（`d3f5b50~1:editor/core/theme-presets.js`）可参考。
7. 残留/过时代码：`editor/index.html` 有空壳 `<label class="theme-pick">主题</label>`；`bin/open-pptd.js` 仍解析并传递 `--theme` 参数（lib 端支持已删）；`theme-presets.js` 文件头注释重复两份；`core/model.js` 头部注释过时（"基础5+预置几何21 / 7常用类型"，实为 187 预置 / 13 图表类型）。

---

## 1. 主题配色系统（本期核心）

### 1.1 结构（严格官方格式）

- 配色 = `deck.theme.colors`（`Record<string, Color>`，值均为 hex）。
- 键集固定 17 键，全部显式 hex（预览=导出一致，无动态派生）：
  - 9 语义色：`primary / accent / bg / text / muted / line / success / warning / danger`
  - 3 派生色：`primarySoft / primaryTint / primaryDeep`（表头浅底/卡片/深底场景，显式写死）
  - **5 图表系列色（新增）：`accent3 / accent4 / accent5 / accent6`**（accent1/2 槽位固定 = primary/accent）
- 每套预设 = 一个完整的 colors 对象。键集必须齐全（否则 textStyles 的 `$text/$muted` 与图表循环悬空）。

### 1.2 图表系列色机制（对齐官方 "theme color cycle"）

- 新增 `themeChartPalette(theme)`：返回 6 色数组，按 **PPTX 主题槽位语义**取值：
  `[accent1, accent2, accent3, accent4, accent5, accent6]` = `[primary, accent, accent3, accent4, accent5, accent6]`
  （accent3-6 走与 `themeColorSlots` 相同的回退链：`accent3||success||primary` 等）。
- `core/chart.js` `normalizeChart`：`const palette = DEFAULT_CHART_PALETTE` → `const palette = themeChartPalette(theme)`。
  渲染器（预览）与 writer（导出）共用 normalizeChart，自动同步。
- 导出落盘不变：系列色经 `resolveColor` 解析为 hex 写 `srgbClr`（当前行为，预览=导出）。
- 删除 `DEFAULT_CHART_PALETTE` 常量（无引用后）；`themeChartPalette` 放 `core/theme.js`。
- 注意：默认主题的图表色序会变（8 色 → 6 色循环，第二系列变为 accent 金色）。若 chart 测试断言具体色序，需同步更新断言。

### 1.3 10 套预设（完整色值表）

文件：`editor/core/theme-presets.js`，导出 `THEME_PALETTES`（键序即展示序），保留 `DEFAULT_THEME`（= 第 1 套「咨询蓝」，同时补 accent3-6 键）。

> 2026-08 配色重设计：每套独立色彩家族（主色+点缀色有性格）；图表系列色 6 槽与家族和谐且彼此可区分；primarySoft/Tint/Deep 严格由主色派生；白字压主色表头对比度达标（≥4.4:1）；中性色带家族色相。

| # | 键 | 名称 | primary | accent | accent3 | accent4 | accent5 | accent6 |
|---|---|---|---|---|---|---|---|---|
| 1 | consult | 咨询蓝（默认） | #16324F | #C9962E | #3D6B99 | #7FA6CB | #C26B4E | #5D8A72 |
| 2 | tech | 科技青 | #0B7C8D | #F5A623 | #23A5B8 | #79C7D4 | #8C5BC4 | #5C7D8C |
| 3 | orange | 活力橙 | #C0531F | #2A6E72 | #E0804A | #F2B48E | #3E8A8F | #8FB5B8 |
| 4 | green | 森林绿 | #1D6B45 | #D0A437 | #3E8B60 | #7FB593 | #B56A3E | #7C93A5 |
| 5 | red | 沉稳红 | #B02A3A | #2E4A6E | #C94B57 | #E3A0A6 | #4E6F9E | #9AA9C4 |
| 6 | purple | 优雅紫 | #5A2E8C | #C99A3A | #7B4FA8 | #AC8CCB | #C26B8A | #5E7FA3 |
| 7 | mono | 高级灰 | #20272F | #C9993E | #55606E | #A0A9B4 | #3E8A8C | #B05A4A |
| 8 | brown | 大地棕 | #6D4A2C | #D19A4B | #8D6742 | #C4A57E | #7E8C5A | #A68B4F |
| 9 | morandi | 莫兰迪 | #64725F | #B7A187 | #8FA08A | #C3CDC0 | #AE8B92 | #8E9BA5 |
| 10 | sakura | 樱花粉 | #BC4F76 | #7FA87C | #D97FA4 | #EFB8CD | #4E8A62 | #A98AC0 |

每套其余 8 键（bg/text/muted/line/success/warning/danger + primarySoft/Tint/Deep）：

| 键 | consult | tech | orange | green | red | purple | mono | brown | morandi | sakura |
|---|---|---|---|---|---|---|---|---|---|---|
| bg | FFFFFF | FFFFFF | FFFFFF | FFFFFF | FFFFFF | FFFFFF | FFFFFF | FFFFFF | FFFFFF | FFFFFF |
| text | 16222E | 142B33 | 2E241E | 172A20 | 2C2022 | 2A2136 | 232A33 | 2E241D | 33352E | 3A2831 |
| muted | 5C6C7E | 5B7376 | 78685C | 5C6E62 | 75676A | 6E6480 | 66707C | 7A6B5C | 76796F | 8A6E78 |
| line | E3E8EF | DDEBEC | F0E6DE | E2EAE3 | F0E3E4 | E9E2F2 | E7E9EC | EDE5DA | E6E5DE | F5E4EA |
| success | 2F7D52 | 2E9E5B | 3D7A4F | 2F8A52 | 3D7A52 | 3D7A52 | 3D8A57 | 4F7A4E | 5E7A60 | 4F8A5C |
| warning | A86A1F | D98A1F | C07A12 | B07816 | B07A14 | AD7513 | B0781C | B57A1C | A88A4E | C08A2E |
| danger | C0524E | D64545 | C0503C | C05248 | C64A3E | BF4A56 | C7504A | B55242 | B07A70 | C0504E |
| primarySoft | EEF2F7 | EFF7F8 | FCF3EC | F0F6F1 | FBF1F2 | F6F2FA | F2F3F5 | F7F4F0 | F4F6F2 | FCF4F7 |
| primaryTint | DCE4EE | DFEFF2 | F8E6D8 | E0EDE4 | F5E2E4 | ECE4F5 | E3E6EA | EFE8DF | E8ECE4 | F9E9EF |
| primaryDeep | 0E2236 | 075E6A | 9A3A12 | 124D31 | 831C28 | 3F1E63 | 141A23 | 4E341E | 4A5646 | 8C3A5B |

> 注：v1 的 blue/mckinsey 合并为 consult；yellow/olive/vermilion/pine/rose/gray/cyan 未入选（10 套上限，色系重复度高者剔除）。2026-08 起各套不再共享语义色（success/warning/danger 等按家族色温单独取值），`primarySoft/Tint/Deep` 由主色派生。

### 1.4 UI：顶栏「配色」按钮 + 配色浮层

- **入口**：`editor/index.html` 顶栏，把空壳 `<label class="theme-pick">主题</label>` 替换为 `<button id="btn-theme">`（配色图标 + 「配色」文案），绑定在 `app/toolbar.js`。
- **浮层面板**（复用 add-menu 的浮层样式思路，新建 `interaction/theme-panel.js`，约 150 行）：
  1. **预设区**：10 套横排色卡（每张 6 个色块 = primary/accent/accent3-6 + 名称），当前应用套高亮边框；点击 = `beginChange → api.applyTheme({ colors: {...preset} }) → endChange`，全页 `$key` 引用与图表系列色立即联动。
  2. **语义色编辑区**：17 键每行 = 色块 + 中文键名 + `input[type=color]` + hex 文本（支持 #RRGGBBAA）。改单键 = 只替换该键（`{...deck.theme?.colors, [key]: v}`）。
  3. **恢复默认** 按钮（应用 consult 套）。
- **API 接线**：`app/api.js` 暴露 `applyTheme`（内部调 `io.applyTheme`，注意 io 是后创建的 → 与 `fontOptions` 同样延迟绑定，或直接把 applyTheme 提为 api 方法，io 侧已有现成实现，查看 io.js 导出方式后决定，倾向提为 `api.applyTheme` 包装 io 的）。
- 每次应用后 `view.render()` 全量刷新（画布 + 缩略条 + 面板颜色回填）。

---

## 2. 浮动编辑条规范化

现状已接近目标形态，**只做微调，不重构**：

| 组件 | 浮动条（保持/微调） |
|---|---|
| 通用尾部 | 类型徽标 + 删除（保持） |
| 文字 | 字体 / 字号 / B / I / 水平对齐 / 颜色（保持 6 项） |
| 形状 | 填充色 / 边框色 / 边框粗细（保持 3 项） |
| 图标 | 颜色 / 更换图标（保持） |
| 线条 | 线宽 / 颜色 / 箭头（保持） |
| 图片 | 适配模式：`cover/contain/fill` 三选项（补 `fill`，现缺） |
| 表格 | 「数据…」按钮（保持） |
| 图表 | 类型 / 「数据…」按钮（保持） |

原则：浮动条只放高频直觉操作；低频/精调全部进属性面板；两处不重复放同一控件。

---

## 3. 属性面板补齐（一期字段清单）

### 3.1 通用区新增「变换」分组（interaction/properties.js `renderCommon`，所有组件生效）

- 旋转 rotation（numInput，-360~360）
- 透明度 opacity（numInput，0~1，step 0.05）
- 水平翻转 / 垂直翻转（两个 checkbox，写 `flip: [bool, bool]`）

### 3.2 组件级补齐

- **文字**（types/text.js）：
  - 高亮背景色 backgroundColor（colorInput）
  - 段前距 marginTop（numInput）
  - 水平对齐选项补 `justify`（两端对齐）/ `distributed`（分散对齐）
- **形状**（types/shape.js）：
  - 边框样式下拉 solid/dash/dot（写 `border.style`）
  - 填充类型 select：纯色 / 渐变；选渐变时展开「起始色 / 结束色 / 角度」（线性 2-stop，写 `fill: {type:"gradient", gradientType:"linear", angle, stops:[{position:0,...},{position:1,...}]}`）；色值保留 `$` 引用能力（resolveColor 回填）
- **页面背景**（interaction/properties.js `renderPageProps`）：渐变补「角度」控件；**不做**图片背景（列二期）
- **其余组件**：本期不加新字段（rotation/opacity/flip 已由通用区覆盖）

### 3.3 面板结构

- `ui.group()` 支持折叠：分组标题加折叠箭头，点击 toggle 内容区（默认全部展开；CSS + 少量 JS，不动现有调用点，group 返回的节点带 title 事件）。
- 分组顺序统一：`位置与尺寸 → 变换 → 类型专属…`（现状 renderCommon 先位置，变换组紧随其后）。
- 颜色控件升级：`ui.colorInput` 增加可选 `swatches` 参数（主题语义色 9 键一行小圆点，点击填入 `$key`）；各类型调用点传入 `swatches: state.theme.colors`（经 helpers 注入）。取色器不支持 alpha → hex 文本输入兜底（在 swatch 行旁加一个 7~9 字符 text input）。

---

## 4. 清理清单（过时/无必要代码）

| # | 位置 | 内容 | 处理 |
|---|---|---|---|
| 1 | editor/index.html | 空壳 `<label class="theme-pick">主题</label>` | 替换为配色按钮（§1.4） |
| 2 | bin/open-pptd.js | `--theme` 参数解析与传递（lib 支持已删） | 删除相关行 |
| 3 | editor/core/theme-presets.js | 文件头注释重复两份 | 合并为一份 |
| 4 | editor/core/model.js | 头部注释「基础5+预置几何21/7常用类型」过时 | 更新为现状描述 |
| 5 | editor/core/chart.js | `DEFAULT_CHART_PALETTE` 常量 | 删除（由 themeChartPalette 取代） |
| 6 | editor/types/registry.js | 注释中 props/quickbar 职责描述 | 微调为最终形态（可选） |
| 7 | SKILL.md | 「无预设主题库」表述 | 改为「内置 10 套配色预设 + 生成时仍可直接写 deck.theme」 |
| 8 | README.md（若有主题相关段落） | 同步一句 | 可选 |

清理前先 `grep` 确认无其他引用（尤其 2、5 两项）。

---

## 5. 实施步骤（文件级改动清单，供 fork 线程执行）

1. **editor/core/theme-presets.js**：重写为 `DEFAULT_THEME`（补 accent3-6 键）+ `THEME_PALETTES`（10 套，§1.3 色值表）；合并重复头注释；导出 `THEME_PALETTES`。
2. **editor/core/theme.js**：新增 `themeChartPalette(theme)`（§1.2 回退链逻辑，与 `themeColorSlots` 保持一致：accent1=primary, accent2=accent, accent3=accent3||success||primary, accent4=accent4||warning||accent, accent5=accent5||danger||primary, accent6=accent6||primaryDeep||accent；值经 `resolveColor` 解析为 hex）；re-export `THEME_PALETTES`。
3. **editor/core/chart.js**：`normalizeChart` 用 `themeChartPalette(theme)` 替换 `DEFAULT_CHART_PALETTE`；删除常量。⚠️ normalizeChart 签名需能拿到 theme（确认当前签名，若只有 el 则调用方传入 theme——renderer/chart.js 与 writer/chart.js 都有 theme）。
4. **editor/index.html + editor/app/toolbar.js**：配色按钮 + 浮层绑定。
5. **新建 editor/interaction/theme-panel.js**：预设色卡 + 语义色编辑 + 恢复默认（§1.4）。
6. **editor/app/api.js**：暴露 `applyTheme`（包装 io.applyTheme，延迟绑定与 fontOptions 同法）。
7. **editor/interaction/properties.js**：通用「变换」分组；页面背景渐变角度；helpers 注入 swatches。
8. **editor/ui.js**：`group` 折叠支持；`colorInput` swatches 参数（含 hex 文本兜底）。
9. **editor/types/text.js / shape.js / image.js**：§3.2 字段补齐（image 仅浮动条补 fill 选项）。
10. **清理清单 §4** 各项。
11. **editor/styles.css**：配色浮层、色卡、swatch 圆点、折叠分组、折叠箭头样式。
12. **测试与回归**（见 §6）。

## 6. 验证

- `npm test`（11/11 回归，含 chart/table/color 一致性）
- `npm run test:isolate`（51 导出无损坏）
- 手动（浏览器 `serve` 后打开编辑器）：
  1. 新建空白 → 加文字（$title 样式）+ 形状（$primary 填充）+ 柱状图 → 顶栏「配色」切 3 套不同配色 → 画布预览全部联动变色、图表系列色随之变化
  2. 语义色编辑区改 primary → 全页 $primary 引用即时联动
  3. 保存项目 → 重开 → 配色保持
  4. 导出 PPTX → PowerPoint 打开 → 颜色与预览一致（重点核对：$primary/$accent 形状与文字、图表系列色、表头色）
  5. 面板：选中文字/形状 → 变换分组旋转/透明度/翻转生效；形状渐变填充预览与导出一致
  6. 浮动条：图片适配多出 fill 选项
- 若 chart 测试断言系列色序，更新断言并记录。

## 7. 二期（本期明确不做）

- 坐标轴/图例/数据标签内容配置 UI；图表系列样式编辑（fill/lineColor/marker）
- 表格：行高/逐边边框/阴影/内联 TableStyleConfig 可视化
- 页面背景图片、radial 渐变、多 stop
- 画布旋转手柄、多选、对齐分布
- 主题导出为 PPTX 主题槽位联动（PowerPoint 内换主题时 $primary 跟随——当前导出写死 hex，本期保持预览=导出一致）
