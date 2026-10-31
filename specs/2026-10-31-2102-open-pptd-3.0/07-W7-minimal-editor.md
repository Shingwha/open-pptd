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

待 W6 合并后补：TypeManifest contentEditor、TableFacts、Theme/Font store API、W4/W5/W6 handoff、稳定区、已知坑。
