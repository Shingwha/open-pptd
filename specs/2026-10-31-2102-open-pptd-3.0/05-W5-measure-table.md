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

- 必读顺序：`ref/repo-map.md` → `ref/interfaces.md` §7.1（TableFacts）→ `ref/decisions.md` D5/D6/D7/D8 → `ref/testing.md` §4/§5.3 → `handoff/W4-worker.md` → 本工单。
- 基线命令（开工先跑，贴真实输出）：`node tests/tools/dump-formula-mml.mjs`；`node tests/run-all.mjs` → 29/29；`node tests/runtime/run.mjs`；`node tests/export/run.mjs`；`node tests/regression/type-manifest.mjs`；`node tests/regression/dep-graph.mjs`；`node tests/contract/public-api.mjs`；`node tests/tools/golden-diff.mjs`（记录基线漂移）。
- 稳定区（勿重读/勿改）：`packages/runtime/**`、`packages/export/**`、`packages/server/**`、`packages/cli/**`、`packages/model/types/**`（table schema 除外）、`packages/renderer/headless/**`、`editor/**`（仅 table-editor 的最小调用替换）。
- 当前事实（lead 已核实）：
  - `measureTable(table, fonts)` 不读 theme：`measureCell` 只用 cell.fontSize（默认 13），未消费 `cellTextStyle`；rowSpan 用 `measureCell()/rowSpan` 再逐行 ceil。
  - `layoutTable` 用 `frame.h = max(bounds.h, totalHeight)`；`renderer/table` 用 layout facts（若无则 estimate）；`writer/table` 自己调用 `measureTable`，`a:ext cy = bounds[3]`。
  - W1 基线：table 项目 page1 tb1 declared h=220 → totalHeight=108、frame 仍 220；page6 tb1 rowHeights [30,38,26,27] total 121。修复后 frame 将变为 totalHeight（D6 预期变化）。
  - golden：24 项目/156 页。main 上既有漂移 5 处（text#3/#7/#8、tide-festival#5、shanmingji#7）；`tests/golden/whitelist.json` 只登记前 4 处。
- 已知坑：golden 依赖本机 Chrome，`tests/tools/ui-shots.mjs` 的 9247 端口不要并行；PNG 本体不入库，只提交 manifest；Office 不可用、不做像素级 PPTX 对照。

## 本波实施口径（lead 已拍板）

1. **度量 API**：`measureTable(table, opts?)`，`opts = { theme, fonts }`；保持 `measureTable(el)`（无 theme）可用。`measureCell` 保持不变（无 theme 的直接调用者仍可用）；样式解析在 `measureTable` 内用 model/theme 的 `resolveTableStyle` + `cellTextStyle` 得到 fontSize/fontFamily/lineHeight，再交给 `measureCell`（padding 只加一次）。
2. **rowSpan 算法**：先按 `estimateTableLayout` 得基础行高；非跨行单元格取 max(base, measureCell)；跨行单元格 required = measureCell（含一次 padding），available = 跨度行当前和；deficit>0 时整数均分：`q=floor(deficit/span)`，余数 `rem` 依次给前 rem 行（各 +1），保证总和 >= required 且无二次取整。总高 = 行高和。
3. **唯一高度**：`layout.frame.h = tableFacts.totalHeight`（不再 max bounds.h）；`frame.grown = totalHeight > declared.h`；renderer box 高 = totalHeight；writer `a:ext cy = totalHeight`、`a:tr h = rowHeights`；selection/overflow 用同一 frame。`bounds.h` 只作 `estimateTableLayout` 的 rowHeights 比例种子。
4. **writer 消费 facts**：`buildPptx(deck, opts)` 内计算一次 `layout(deck)`（已加 writer→layout 依赖边），通过 `ctx` 把每页 LayoutTree 传给 toXml；`tableXml` 用 `ctx` 里的 facts，禁止自行 `measureTable`。text/shape 等其它 writer 行为零变化；导出字节除表格页外不变（表格页预期变化）。
5. **rowHeights 生命周期**：model/table 提供以下纯函数并测试：
   - `normalizeRowHeights(el)`：长度 != rows 时返回 null（不静默当作有效比例）；
   - `adjustRowHeightsForRowChange(ratios, rows, index, delta)`：插入/删除行后同步长度并保持归一；
   - validate 的 table schema 对“rowHeights 长度与 rows 不一致”给出 warning（不是 error），消息写明实际/期望。
6. **table editor**：仅把 `estimateTableLayout` 调用换成 `measureTable(el, {theme})` 并用最终 rowHeights；不做 UI 改动。
7. **golden**：
   - 代码修复 commit 与 golden 基线 commit 分开；
   - 在 `tests/tools/golden-render.mjs` 加 sanity gate：每页尺寸等于项目 size、PNG 非空、页面数>0、无全白页；失败中止不写 manifest；
   - 全量 rebaseline 后 `golden-diff` 第二遍必须零未登记漂移；`whitelist.json` 如需清理在基线 commit 内说明。
8. **测试**：新增 `tests/regression/table-facts.mjs`、`tests/regression/measure-consistency.mjs`（自跑，lead 接入 run-all）；覆盖样式 10/11/13、rowSpan 2/3、padding、余数、rowHeights 长度、frame==box==cy==totalHeight、writer 不吃 measureTable。不改 `tests/run-all.mjs`/package.json/contract.json/barrels。
