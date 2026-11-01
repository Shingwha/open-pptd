# W3b-D handoff · editor/bin 注释整理

> 分支 `feat/3.1-w3b-d`，起点 `main b60f4f0`；Windows 10.0.28120 + Git Bash + Node 24；零新增依赖。
> 写入范围：`editor/**`（63 JS + 11 CSS）与 `bin/open-pptd.js`，共 74 文件；本文件以外零改动。
> 体量：14,305 → 13,470 行（-835），注释行 2,610 → 1,778（-832，-31.9%）；无 >20 行 banner（保留项见 B）。

## A. 自测真实输出

```text
# 基线（main b60f4f0，先补不入库的公式 fixture）
$ node tests/tools/dump-formula-mml.mjs → KaTeX MathML 生成: 204/204
$ node tests/run-all.mjs → 结果: 39/39 通过 ✅
$ node tests/regression/dep-graph.mjs → ✓ 依赖方向与环境全局检查通过
$ node tests/contract/public-api.mjs → 结果: 契约通过 ✅

# 完工（HEAD f8ea385）最终代码重跑
$ node tests/run-all.mjs → 结果: 39/39 通过 ✅
$ node tests/regression/dep-graph.mjs → ✓ 依赖方向与环境全局检查通过
$ node tests/contract/public-api.mjs → 结果: 契约通过 ✅
$ node tests/e2e/editor-minimal.mjs → 21/21 通过
$ node tests/e2e/page-ops.mjs → 17/17 通过
$ node tests/e2e/editor-ops.mjs → 22/22 通过
$ node tests/e2e/preview-shell.mjs → 23/23 通过
$ node tests/tools/golden-diff.mjs → 24 项目/156 页；字节一致 156、感知一致 0；无未登记漂移 ✅
$ 逐文件 node --check（editor/bin 全部 .js/.mjs）→ ALL-OK（包含 bin/open-pptd.js）

# 历史标记扫描
$ grep -rnE '\bW[0-9]+\b|RP-C|\bM[1-6]\b|spec [0-9]+|editor-ux|\bD[0-9]+\b|contract [45]|3\.0 |3\.1 ' \
    --include='*.js' --include='*.mjs' --include='*.css' --include='*.html' editor bin
→ (none)

# CSS 零声明变化（去掉 /* */ 后逐字节比较 main 与 HEAD）
→ all 11 stylesheets identical
```

## B. 实施、删除、判据、偏差

**文件头**：所有被改文件头统一为 3–6 行 `<path> — <purpose>` + 关键不变量；删除 `// ====` / `/* ==== */` 长 banner 与 `---` 装饰分隔线（JS 约 40 处、CSS 约 30 处），节标题降为单行 `// Sections` / `/* topbar */`。

**删除的历史/设计编号**：`W1/W2/W7/W9`、`RP-C`、`M6`、`spec 10/22`、`editor-ux §*`、`decisions.md D1/D4/D13`、`contract 1/2/3/4`、`B3`、`3.0/3.1 W2`、`theme-font §7`、`design.md §4`、`interfaces.md §3/§5/§6/§10`、`work order 09`、`v3 #6`、`#7 merge`、`2.x`、`被删除的 3.0 能力` 叙述。`editor/index.js` 的 contract 4 入口也改为纯 `open-pptd/editor` 描述（barrel 无需保留 contract 3.0 行以外的编号）。

**保留的公共 JSDoc/约束**：`createPreview/createEditor` 签名与销毁语义、Editor API 的 clipboard/page/selection 契约、`ui` context 字段、DOM 契约（`[data-element-id]`、`[data-handle]`、`[data-rotate-handle]`、`#canvas`、`#page-count`、`.thumb`/`.thumb-item`、`#sel-actions`）、`normalizeChrome`、`applyThemeTokens/defaultTokens`、`createExcelGrid` 的完整 opts 清单（26 行，属工单明确保留项）、表格/图表编辑器字段、拖拽/缩放/参考线/剪贴板/内容编辑器事务、导出/保存/revision 冲突处理、PNG capture→foreignObject 回退与浏览器安全约束、SSR/无 DOM 降级。

**顺带修正的过期注释**：`stage.js` “blank >4px = pan” 改为实际 marquee；`viewport.js` 删除已不存在的 `.inspector`；`thumbnails.js` 删除旧 140×79 断点与“page multi-select”；`theme.js` 的旧 U1/`--primary*` 别名叙述改为“仅 probe 列表保留、以 tokens.css 实际声明为准”；`tokens.css` 的 compat 段不再复述已删除别名；`present.css` 的 `open-pptd render` 改为 `open-pptd build --format png`；`handle-store.js` 删除“restore card”残留；`main.js` 删除“3.0 无 session-restore card”历史句。

**零行为变化证据**：只改注释与空行；`node --check` 全过；run-all 39/39、dep-graph、contract、四条 e2e（21/17/22/23）、golden 156/156 字节一致。CSS 去掉注释后 11 个文件与 main 逐字节相同。

**门禁命令偏差（需 lead 知悉）**：`git diff -U0 main..HEAD -- editor bin | grep -E '^[+-][^+-]' | grep -vE '^[+-][[:space:]]*(//|/\*|\*|$)'` 输出并非空，只有两类、均为纯注释：
1. `editor/app/project/loader.js` 一行尾注释 `el.title = text; // … (D4)` → `…// …`（代码段逐字相同；尾注释移除 D4 必然改动该行）；
2. CSS 旧多行注释的续行（如 `   canvas.css — …`）不以 `*` 开头，删除时被该过滤器当作代码行。
改用更强校验：JS/HTML 过滤后仅上述 1 行；CSS 用“去注释后逐字节比较”证明 11 个文件声明零变化。

**保留的 >20 行注释块**：仅 `editor/interaction/excel-grid.js` 的 opts JSDoc（26 行），工单验收第 4 条明确要求保留；其余扫描为 0。

## C. commit / 文件 / 审计

| commit | message |
|---|---|
| `ddc2bf7` | docs(editor): 压缩壳层与组件注释，移除历史编号与长 banner |
| `10cd510` | docs(editor): 整理 app 层注释（状态/视图/项目 IO） |
| `7d61d2a` | docs(editor): 整理 interaction 层注释（手势/面板/编辑器） |
| `f8ea385` | docs(editor): 压缩样式表注释与 banner，清理 bin 入口 |

修改：`editor/{context,dom,skeleton,editor,preview,gallery,main,theme,coords,ui,popover,dialogs,icons,index}.js`、`editor/types/*`、`editor/components/*`、`editor/app/**`、`editor/interaction/**`、`editor/styles/*.css`、`bin/open-pptd.js`。新增仅本 handoff。未改 `packages/**`、`contract.json`、`package.json`、`tests/**`、`skill/**`；未 merge/push/tag；未触碰主检出与其他 worktree。

**探索审计（只读）**：`specs/.../04-W3b-comment-cleanup.md`、`ref/repo-map.md`、`handoff/W2-worker.md`、`handoff/W3a-a-worker.md`；全量阅读 74 个改动文件的现有注释与相关代码（editor 壳层、app、interaction、styles、bin）；`tests/run-all.mjs` 输出、`tests/e2e/*`、`tests/tools/golden-diff.mjs`、`tests/regression/ui-token-literals.mjs`。未全仓重读非 editor 模块。

**未决/偏差**：① 上述门禁过滤器对 CSS 旧注释续行与单行尾注释的误报（已用去注释比较补证）；② `theme.js` 的 `TOKENS` 数组仍列 `--primary/--primary-strong/--sh-pop/--sh-modal` 等已不在 tokens.css 声明的别名——属代码不可改，仅将注释改为“仅在 probe 列表保留、以实际声明为准”；③ `formatBytes` 的最早共性说明等历史措辞按需保留，无行为影响。
