# W7 · 最小编辑器 + Design 面板 + 页面操作

> 分支/前置：W4/W5/W6 已合并；写入范围 `editor/**`（editor.js/main.js 的拆分为 W8，本波先改 UI/交互/类型/页面操作）、`tests/e2e/{editor-minimal,page-ops}.mjs`。
> 本波按 `ref/editor-ux.md` 删除多余编辑 UI，保留内容编辑/变换/多选/参考线/页面操作/Design 面板。

## 目标

- 删除：属性面板、快捷条、元素右键菜单、add-menu 旧结构、字体/主题/页面背景 popover、表格/图表样式面板、行列尺寸、group/align/distribute/layers/clipboard/duplicate、形状/线条/图片/图标内容编辑/新增、页面多选/批量/复制页。
- 保留：单选/多选/框选、拖动/缩放/旋转、智能参考线、删除、undo/redo；文字/表格/图表内容编辑 + 基础颜色；新增文字/表格/图表；页面单页前插/后插/前移/后移/置顶/置底/删除 + 拖拽；Design 面板（主题/字体/外观）。
- 内容编辑器按 `ref/editor-ux.md` 的字段；表格/图表用 `measureTable` 最终行高。
- 页面操作：`insertPage(at)`；`＋` 插当前页后；页面菜单；单页；undoable。
- 只读元素：形状/线条/图片/图标/group 成员可选中/变换/删除；无内容/样式编辑。

## 范围

- `editor/index.html`、`editor/styles/**`、`editor/app/{state,api,toolbar,keyboard,view/view}.js`、`editor/interaction/{canvas,stage,drag-select,align-guides,excel-grid,dialogs/{table,chart},...}`、`editor/types/{text,table,chart,index}.js`、新 `design-panel`。
- 删除/收窄：`properties/add-menu/contextmenu/font-panel/theme-panel/page-background/icon-editor/arrange(align/distribute)/clipboard/group/layers/duplicate` 等。
- Design 面板：主题库/自定义颜色/字体库/外观；复用 W6 数据 API；删除旧两个 popover。
- 测试：内容编辑/颜色/变换/多选/参考线/添加/删除/页面操作/undo；表格/图表编辑器。

## 非目标

- 不做 createPreview/createEditor 自包含拆分（W8）。
- 不改 runtime/export/measure/theme 核心（已合并）。
- 不做保存原子化（W9）。
- 不恢复已删除功能；不做隐藏入口。

## 验收

1. 全量回归 + dep-graph/contract 绿。
2. 最小功能 e2e：文字/表格/图表内容、颜色、变换、多选、参考线、添加/删除、页面操作/undo。
3. 删除项无 DOM/CSS/JS 残留入口；旧组件/面板无引用。
4. Design 面板主题应用/保存/自定义颜色/字体导入/外观可用。
5. 表格/图表编辑后的 preview 与 layout/PPTX 表格 facts 一致（抽验）。
6. 写入范围外零 diff；无新增依赖。

## 前置上下文

- 必读顺序：`ref/repo-map.md` → `ref/editor-ux.md`（全文，功能矩阵）→ `ref/theme-font.md` §6/§7（Design 面板）→ `ref/interfaces.md` §10（Editor API）→ `handoff/W4-worker.md`/`W5-worker.md`/`W6-worker.md` → 本工单。
- 基线命令（开工先跑，贴真实输出）：`node tests/tools/dump-formula-mml.mjs`；`node tests/run-all.mjs` → 34/34；`node tests/e2e/render.mjs` 9/9；`node tests/e2e/incremental-load.mjs`；`node tests/regression/dep-graph.mjs`；`node tests/contract/public-api.mjs`；`node tests/tools/golden-diff.mjs`。
- 稳定区（勿重读/勿改）：`packages/**`（W4/W5/W6 已交付；本波只消费 API）、`tests/golden/**`、`tests/projects/**`、`tests/run-all.mjs`、`package.json`、`contract.json`、barrels。
- 现有事实（lead 已核实）：
  - 删除面：`editor/interaction/{properties,add-menu,contextmenu,font-panel,theme-panel,arrange}.js`、`editor/interaction/dialogs/{page-background,icon-editor}.js`、`editor/types/{shape,line,image,icon,group,menu}.js`；`fields.js` 仍被 table/chart editor 使用（保留，仅删 properties 专用用法）；`popover.js` 被 file-menu/ui 使用（保留）。
  - 功能串：clipboard/duplicate/group/layer/align 散落在 `editor/app/{state,api,keyboard,toolbar}.js`、`editor/interaction/{canvas,stage,contextmenu}.js`、`editor/app/view/{view,thumbnails}.js`，需要逐处删除，不能只删模块。
  - `editor/index.html` 有 `#btn-fonts`、`#btn-theme`、`#inspector`、`#quickbar`、`#add-menu`、`#btn-add`、`#btn-inspector-open`；样式在 `editor/styles/**`。
  - `editor/types/index.js` 仍注册 8 类型 UI shard；`buildAddItems` 目前从 shard 菜单收集。
  - W6 已提供 `packages/model/index.js` 的 `listBuiltinThemes/createThemeStore/applyTheme/colorTokenUsage/listColorTokens/createFontLibrary` 与 server `/api/themes`、`/api/fonts`（loopback）。
  - headless 路径 `editor/app/shot.js` → createEditor(chrome:"shot") 只走非交互装配，不能把 Design 面板/内容编辑器依赖带进该路径。
- 已知坑：`tests/tools/ui-shots.mjs` 固定 CDP 9247，多 agent/多次运行不要并行；e2e 需 Chrome；本波只改编辑器 UI，**不得改变 headless/golden 渲染**；删除文件后必须 `grep` 确认无 import/HTML 引用。

## 本波实施口径（lead 已拍板）

1. **按功能矩阵删除，不留隐藏入口/兼容层**：属性面板、快捷条、元素右键菜单、旧 add-menu、字体/主题/页面背景 popover、表格/图表样式面板、行列尺寸、group/align/distribute/layers/clipboard/duplicate、形状/线条/图片/图标内容编辑与新增、页面多选/批量/复制页。删除后 `grep -R` 无残留 import、DOM id、CSS 选择器、快捷键。
2. **保留能力**：单选/多选/框选/拖动/缩放/旋转/智能参考线/删除/undo/redo；文字/表格/图表内容编辑 + 基础颜色；新增 3 类；页面单页前插/后插/前移/后移/置顶/置底/删除 + 拖拽；Design 面板（主题/字体/外观）。
3. **页面操作**：state/api 提供 `insertPage(at)`、`deletePage(index)`、`movePage(from,to)`（至少 1 页、当前页跟随、undoable）；`＋` 插当前页后；页面菜单含前插/后插/前移/后移/置顶/置底/删除；拖拽排序保留。
4. **内容编辑器收窄**（`ref/editor-ux.md` §4）：
   - text：内容/字体/字号/对齐/颜色/粗斜体；删行距/字距/段前距/高亮/方向/样式 preset/自动换行。
   - table：单元格文字、增删行列、合并/拆分、单元格字色/填充；删样式面板/字体/字号/粗斜体/对齐/边框/textStyle/行列尺寸对话框；行高用 `measureTable` 最终值（W5 已接）。
   - chart：数据/类型/系列增删/值列/系列名/系列颜色；删轴/图例/标签/样式/气泡/线型等高级面板。
5. **Design 面板**：顶栏一个“设计”入口（删 `#btn-fonts`/`#btn-theme`）；tabs：
   - 主题：当前主题/内置+用户主题列表（`/api/themes` 可用时含用户库，静态站只用内置）；应用（`applyTheme(current, theme, {deck})` + 保留 referenced 报告 + undo）；保存当前（命名 → POST）；导入/导出/删除；颜色令牌全部 token + 添加/编辑/删除（被引用阻止）。
   - 字体：当前 deck 字体状态（ready/system/missing）、内置+用户库（`/api/fonts`）、本地/URL 导入、删除、全局嵌入说明。
   - 外观：浅色/深色/跟随系统（复用 `editor/theme.js` 的 bindThemeMode/applyThemeTokens，不写 deck）。
   - 面板懒加载，不影响 headless 装配。
6. **类型 UI**：`editor/types/` 只保留 text/table/chart 的 contentEditor/label 边界；删除 shape/line/image/icon/group/menu shard；添加菜单只有 3 项；文字创建后选中、表格/图表创建后打开编辑器。
7. **API**：按 `interfaces.md` §10.2 收窄；删除 group/ungroup/align/distribute/layer/clipboard/duplicate/page batch 方法；保留/新增页面操作与 `save/exportPptx/exportPng/exportBundle`（导出暂沿用现有实现，W9 再接 ExportService）。
8. **测试**：新增 `tests/e2e/editor-minimal.mjs`、`tests/e2e/page-ops.mjs`（CDP + 临时项目，可复用 `tests/e2e/incremental-load.mjs` 的启动/求值方式）；覆盖内容编辑/颜色/变换/多选/参考线（至少选中与拖动渲染）/添加/删除/页面操作/undo/Design 面板主题应用与颜色 token/旧入口不存在。浏览器缺失时输出 SKIP 并 exit 0。
9. **不碰 W8 拆分**：`createPreview`/自包含 shell 留给 W8；本波仍在现有 editor.js/main.js 结构上改。
10. **门禁**：run-all 34/34 不回退；render 9/9；incremental-load 全过；golden 零漂移；dep-graph/contract 绿；删除项 grep 无残留。
