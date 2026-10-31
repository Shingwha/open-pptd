# W5 handoff · 纯度量 + TableFacts + golden rebaseline
> 分支 `feat/3.0-w5-table`，起点 `a153ec0`（main）；Windows 10.0.28120 + Git Bash + Node v24.21.0；零 npm 依赖。

## A. 自测真实输出

```text
# 开工基线（HEAD a153ec0）
$ node tests/tools/dump-formula-mml.mjs → KaTeX MathML 生成: 204/204
$ node tests/run-all.mjs                → 结果: 29/29 通过 ✅
$ node tests/runtime/run.mjs            → runtime: 92/92 通过 ✅
$ node tests/export/run.mjs             → export: 56/56 通过 ✅
$ node tests/regression/type-manifest.mjs → TypeManifest 契约通过 ✅
$ node tests/regression/dep-graph.mjs   → 依赖方向与环境全局检查通过
$ node tests/contract/public-api.mjs    → 契约通过 ✅
$ node tests/tools/golden-diff.mjs --whitelist tests/golden/whitelist.json
  → 24 项目/156 页；感知一致 151；白名单 4 页；未登记漂移 1 处（shanmingji#7）

# 完工（真实输出）
$ node tests/regression/table-facts.mjs        → 全部通过 ✅（样式 10/11/13、rowSpan 2/3 余数、padding、rowHeights 长度、frame/cy、writer facts）
$ node tests/regression/measure-consistency.mjs → 全部通过 ✅（24 项目/36 表格；21 个表格缩短；PPTX 21 表 cy/tr 全对齐）
$ node tests/run-all.mjs                       → 结果: 29/29 通过 ✅（新测试未接入 run-all，由 lead 加两行）
$ node tests/runtime/run.mjs                   → runtime: 92/92 通过 ✅
$ node tests/export/run.mjs                    → export: 56/56 通过 ✅
$ node tests/regression/type-manifest.mjs      → TypeManifest 契约通过 ✅
$ node tests/regression/dep-graph.mjs          → 依赖方向与环境全局检查通过 ✅
$ node tests/contract/public-api.mjs           → 契约通过 ✅
$ node tests/e2e/render.mjs                    → render 冒烟测试 9/9 通过 ✅（timeouts=0）
$ node tests/tools/golden-render.mjs           → 24 套/156 页；sanity gate 全过；89.6s
$ node tests/tools/golden-diff.mjs（连续两遍）  → 两遍均 156/156 字节一致、0 未登记漂移 ✅

# golden rebaseline 前后统计（manifest JSON 对照）
页数/尺寸：24 项目/156 页不变；尺寸不变
sha256 变化 156/156（旧基线 2026-09-29 与本机渲染环境差异）
dHash/aHash 任一变化 36 页；超过容差(>2) 5 页，恰为既有 5 处漂移（text#3/#7/#8、tide#5、shanmingji#7）
表内行高变化（如 table#9）在 9×8 感知哈希下落在容差内，但 sha 明确变化；白名单已清空为 []

# 字节抽查（CLI export）
chart 837227 → 837227；text 141748 → 141748（非表格项目零变化）
table 250837 → 250833（预期表格页变化）

# table 项目 layout facts（frame == box == totalHeight == sum(rowHeights)）
p1 tb1 declared=220 frame=108 total=108 sum=108；p6 tb1 121/121/121
p9 tb1 declared=200 frame=108 total=108 sum=108（样式 $title 22pt）；p9 tb2 134/134/134
# PPTX 抽查
slide1 tb1 a:ext cy=1371600（108px）a:tr=30/26/26/26（和=cy）
slide9 tb1 tr=41/41/26（和=108=cy）；tb2 tr=30/26/26/26/26（和=134=cy）
```

## B. 实现、偏差与审计

**measure**：`measureTable(table, opts?)`，`opts={theme,fonts}`；仍兼容 `measureTable(table, fonts)`（按 `metricsFor` 识别）。样式经 `resolveTableStyle` + `cellTextStyle` 全链解析后交给 `measureCell`（字号/字体/行高/字距/marginTop），padding 只加一次；无 theme 走 `EMPTY_THEME`，与旧 `cell.fontSize` 路径逐值一致。算法：`estimateTableLayout` 种子**一次 ceil** → 非跨行 `max(seed, content)` → 跨行 `required - 跨度现有和`，`q=floor(deficit/span)`、前 `rem` 行 +1，跨度总和精确等于 required（D7）。`measureTextRuns` 新增可选 `letterSpacing`，无该字段时零变化。
**layout**：`frame.h = tableFacts.totalHeight`（不再 max bounds.h）；`grown` 仍表示高于声明。表格主题按需 `resolveTheme(deck)`（补默认 textStyles lineHeight 与 deck.fonts），使裸 deck（CLI check/validate）与预览/导出同值；无表格 deck 不额外解析，文本布局零变化。
**writer**：`buildPptx` 内 `layout({...deck, theme})` 只算一次，`buildSlide` 收到 `layoutPage` 并通过 `ctx.layoutOf(el)` 下发；`tableXml` 只读 `ctx` facts，`a:ext cy = totalHeight`、`a:tr h = rowHeights`，不再 import/调用 `measureTable`；直接调用（无 layoutPage）仅回退 `estimateTableLayout` 最小高。其它类型输出零变化。
**model**：`normalizeRowHeights(el)`（长度/数值/和校验，非法→null，合法→归一到 1）；`adjustRowHeightsForRowChange(ratios,rows,index,delta)`（插入均分+按比例缩放，删除裁剪后归一，删空/长度不一致→null）；`estimateTableLayout` 改用前者，stale 数组回退最小行高。`table` schema 对长度不一致返回 `level:"warning"`，消息含实际/期望行数。
**editor**：仅替换 `estimateTableLayout` → `measureTable(el,{theme})`，UI 未动。
**golden**：`golden-render` 写入 manifest 前逐页校验：尺寸==deck.size（支持 720×960 等）、文件非空、页数>0、至少一个非白像素；失败即 exit(1) 且不写 manifest。基线 commit 与代码 commit 分离；历史 whitelist 清空。
**偏差（需 lead 知悉）**：① `packages/model/validate.js` 增加一行 `...(issue.level ? { level: issue.level } : {})`（schema 钩子原本只能产 error，工单 #5 要求 warning；既有钩子不带 level，输出零变化）。该文件不在红名单，属完成验收的最小必要越界。② 表格主题在 layout 内 `resolveTheme`，文本布局仍沿用原 themeOf 语义（避免扩大本波视觉面）。③ `golden-diff` 的 9×8 感知哈希无法区分本波细小行高变化，rebaseline 真实性依赖 sanity gate + sha + 两遍字节一致。
**探索审计（只读）**：specs 本组 repo-map/interfaces §7.1/decisions D5–D8/testing §4/§5.3/handoff W4/工单；packages/{measure,layout,model/{table,types/table,theme,validate,style},writer/{pptx,slide,table,types},renderer/{page,table},cli/export,runtime/resolve}；editor/{app/view/view,app/project/loader,interaction/dialogs/{table-editor,base}}；tests/{run-all,runtime/run,export/run,regression/{layout,measure,validate,type-manifest,dep-graph},tools/golden-*,lib/unzip}。未全仓重读，未触碰主检出/其他 worktree。

## C. 文件 / commit 指针

| commit | message |
|---|---|
| `c1f9b81` | feat(measure): measureTable 样式感知与 rowSpan 整数补差 |
| `e49d8a5` | feat(model): rowHeights 规范化为纯函数并为长度不一致发 warning |
| `c8e1574` | refactor(layout): 表格 frame.h 统一为 totalHeight（D6） |
| `f3215db` | refactor(writer): 表格高度消费 LayoutTree facts，a:ext cy=totalHeight |
| `f8410dd` | refactor(editor): 表格编辑器行高改用 measureTable 最终值 |
| `aaf6f45` | test(table): 新增 TableFacts 与度量一致性回归 |
| `0c97dd8` | test(golden): rebaseline 前增加尺寸/非空/页数/全白 sanity gate |
| `61ef707` | chore(golden): 表格修复后全量 rebaseline（24 项目/156 页，清空历史白名单） |
| `d80e85e` | refactor(layout): 表格主题按需解析（无表格 deck 零额外开销） |
| `（本文件）` | docs(w5): 写 W5 交接 |

新增：`tests/regression/{table-facts,measure-consistency}.mjs`。修改：`packages/measure/{font-metrics,index}.js`、`packages/layout/index.js`、`packages/model/{table,validate}.js`、`packages/model/types/table.js`、`packages/writer/{pptx,slide,table}.js`、`editor/interaction/dialogs/table-editor.js`、`tests/tools/golden-render.mjs`、`tests/golden/{manifest,whitelist}.json`、`tests/regression/layout.mjs`（仅 D6 期望）。
未决：lead 合并时把两个新测试接入 `tests/run-all.mjs`（各一行）；`validate.js` 的 schema level 支持请 lead 确认是否保留/转正。
