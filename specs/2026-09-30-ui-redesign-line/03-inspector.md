# Spec 03 · 属性面板细线化（波次 W3）
> 分支 `feat/ui-line-inspector`；前置：W1 已合并；深读：`00-overview.md`、`editor/interaction/properties.js`、`editor/interaction/fields.js`、`editor/styles/inspector.css`
> 状态：✅ 2026-09-30 已合并 @ feat/ui-line-inspector → main（4 commits）

## 目标

右侧属性面板按 D1 细线化：**视觉统一、去冗余显示**，不改字段数据面（`types/*.js` 的 `props()` 定义与顺序是 W2 禁触、本波同样只读）。面板继续承载全部属性——浮条收敛后这里是属性的完整入口。

## 工单（按序执行，每项一个 commit）

### T1 项头与冗余显示清理（properties.js）
- 单选项头（properties.js:127-141）：删除 elementId 代码文本（如 `meta-right`——内部实现细节，无用户价值）；保留类型徽章 + 复制 + 删除。
- 多选头、页面属性（演示文稿/页面设置）保持结构。
- 面板头部（index.html 的 inspector-head 不动本波？——index.html 属 W1 已合并内容，本波**可读不可改**；若必须改 markup 记入偏差上报 lead）。

### T2 分区视觉统一（inspector.css 重写为主）
- `.group`：标题 12px medium `--sub`、chevron 右侧、可折叠不变；分区之间用 1px `--line` 上边线（或 16px 白间隙），**去掉任何填充色块分区**。
- 字段节奏统一：label 11px `--faint` 在上、控件 28px 在下，cell 间距 8px/12px；`.prop-grid` 两列对齐线拉直。
- 图标钮组（对齐 8 钮、层级 2 钮）：透明底 + 1px 边、hover `--hover`，active 态 accent 边；高度 28px。
- checks（水平/垂直翻转等）：开关/复选细线化，去掉重底色。
- 颜色控件：色块 20px + hex 输入，描边 `--chip-border`；滑杆/下拉保持。
- hint 文本：`--faint` 11px，行距 1.5。
- 窄屏 sheet 形态（55vh、grabber、mask）样式在 inspector.css 的部分一并细线化；responsive.css 不属本波，动不到的不动。

### T3 多选与混合态核对
- 多选分区（位置尺寸混合占位/对齐选区/分布/变换）样式与单选统一；「混合」占位 italic `--faint` 保持语义。
- 无行为变化，纯样式。

### T4 回归
- `node tests/run-all.mjs` 全绿（独立 `echo $?`）；`node --check` 改动 js。

## 验收
1. `node tests/run-all.mjs` 全绿
2. grep：inspector.css 无 `#[0-9a-fA-F]{3,8}`/`rgba(` 字面量（全走 var(--)）
3. properties.js 单选头部无 elementId 文本节点（徽章/复制/删除保留）
4. 字段高度统一 28px（`grep -n "height" editor/styles/inspector.css` 人工核对）

## 禁触清单
`editor/types/*.js`、`editor/app/view/view.js`、`editor/ui.js`（W2）、`editor/styles/{tokens,primitives,layout,canvas,panels,responsive}.css`、`editor/index.html`、`editor/gallery.js`、`editor/interaction/{theme-panel,font-panel}.js`、`packages/`、`tests/`。

## 最终报告格式
工单状态表 / commit 清单 / 自测真实结论 / 偏差与取舍 / 未决问题
