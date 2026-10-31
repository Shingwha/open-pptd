# W5 · 纯度量 + TableFacts + golden rebaseline

> 分支/前置：W4 已合并；写入范围 `packages/measure/**`、`packages/layout/**`、`packages/model/table.js`、`packages/renderer/table.js`、`packages/writer/table.js`、相关测试/golden。`editor/app/view/dom-measure.js` 删除由 W7 执行；本波先确保引擎无 DOM 依赖。

## 目标

- 统一纯函数度量：删除 DOM measure 的引擎侧入口/桩；preview/headless/CLI/check/gallery/golden 同 measure。
- 表格 TableFacts 唯一高度：
  - `totalHeight` 为 layout frame/renderer box/writer a:ext/selection 的唯一高度；
  - `bounds.h` 只作 rowHeights 比例种子；
  - 无 rowHeights = 内容高；纵向缩放统一写 rowHeights。
- 表格样式感知：measure 使用 cellTextStyle 的字体/字号/行高/字距；宽度扣 padding/边框。
- rowSpan 补差：所需高度 − 跨度已有高度，平均分给跨度行；padding 一次；整数一次分配。
- rowHeights 生命周期：insert/delete row 同步；长度/列数校验；table editor 用最终 measure 行高。
- writer 消费 layout facts，不自行 measureTable。
- 表格修复后 golden 自动 rebaseline（sanity gate + 二次稳定性）。

## 范围

- measure/font-metrics 样式感知 measureCell/measureTable；table estimate/rowHeights 规范化。
- layout TableFacts；frame.h=totalHeight；overflow。
- renderer/table box height=totalHeight；tr 行高；不残留 min-height 语义冲突。
- writer/table 消费 facts；`a:ext cy=totalHeight`；单元格样式与 preview 同源。
- editor table editor（若仍存在旧实现）先接 `measureTable`；完整最小编辑器 W7。
- 测试：样式表、rowSpan、rowHeights 长度、writer frame、table editor、measure parity；golden。

## 非目标

- 不做主题/字体库（W6）。
- 不做最小编辑器 UI 删除（W7）。
- 不做 Office 渲染。
- 不新增表格样式编辑器（已删除）。

## 验收

1. 全量回归 + dep-graph/contract 绿。
2. 样式感知：fontSize 10/11 的表格行高正确；默认 13 不再误用。
3. rowSpan 2/3 行、不同内容、padding、整数余数测试通过；总高不低于合并内容。
4. `layout.frame.h == renderer box == writer a:ext cy == tableFacts.totalHeight`。
5. rowHeights insert/delete/长度 mismatch 测试；不静默丢。
6. golden rebaseline：sanity gate 通过、第二遍零差异；基线更新单独 commit。
7. 写入范围外零 diff；无新增依赖。

## 前置上下文

待 W4 合并后补：TypeManifest/layout hook、checkProject、baseline table values、W4 handoff、golden 命令/环境、已知坑。
