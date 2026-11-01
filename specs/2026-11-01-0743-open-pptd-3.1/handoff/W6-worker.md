# W6 handoff · 编辑器性能（纯函数度量 + 缩略图增量化）

> 分支 `feat/3.1-w6-perf`，起点 `main b6c2303`；Windows 10.0.28120 + Git Bash + Node 24；零新增依赖；本机 Chrome。
> 写入仅 `editor/app/view/{view,thumbnails,viewport,dom-measure}.js`、`editor/app/api.js`、`editor/app/project/{io,loader}.js`、`editor/interaction/design-panel.js`（2 行 render 分类）、`tests/perf/editor-perf.mjs`、`package.json`（scripts +1）、本文件。未改 `packages/**`、`editor/preview.js|editor.js|main.js`、`editor/interaction/{canvas,stage}.js`、`editor/gallery.js`、`editor/styles/**`、`tests/{golden,projects,contract}`、`contract.json`、`skill/**`；未 merge/push/tag；未碰主检出与其他 worktree、未重启 55173。

## A. 自测真实输出

```text
# 基线（b6c2303，开工前）
$ node tests/tools/dump-formula-mml.mjs → 204/204
$ node tests/run-all.mjs → 39/39 ✅
$ node tests/e2e/{editor-minimal,page-ops,editor-ops,preview-shell,feedback-fixes,add-elements,browser-export,incremental-load}.mjs
  → 21/21、17/17、22/22、23/23、21/21、12/12、15/15、5/5 ✅
$ node tests/tools/golden-diff.mjs → 字节一致 156 页 ✅
# 完工（最终代码重跑）
$ node tests/run-all.mjs → 39/39 ✅；dep-graph → ✓；contract → 契约通过 ✅
$ 同上 8 个 e2e → 21/21、17/17、22/22、23/23、21/21、12/12、15/15、5/5 ✅；render → 9/9 ✅
$ node tests/tools/golden-diff.mjs → 24 项目/156 页；字节一致 156、感知一致 0；无未登记漂移 ✅
$ npm run test:perf → 13/13 阈值项全 PASS（六茶 p50 12.0/p95 14.7、全量 28.1；青山全量 5.6、切页 14.1）
```

前后对比（同一台机器，headless Chrome 1440×900；前=用 `git archive b6c2303` 的代码树跑同一探针，后=本分支）：

| 场景 | 优化前 | 优化后 |
|---|---|---|
| 六茶 `refreshPreview` ×10 p50 / p95 | 50.2 / 60.1ms | **12.0 / 14.7ms** |
| 六茶 `duplicateSelected()+undo()` ×5 p50 / p95 | 131.7 / 187.2ms | **62.3 / 68.0ms** |
| 六茶全量渲染（thumbs all）p50 | 63.9ms | **28.1ms** |
| 六茶 `refreshPreview` 内 `getBoundingClientRect` | 570 次 / 13 次刷新（≈44/次） | **0 次** |
| 青山切页 `goToPage` ×10 p50 / p95 | 176.5 / 202.3ms | **14.1 / 19.5ms** |
| 青山全量渲染（thumbs all）p50 | 152.8ms（全同步） | **5.6ms 同步**（11 张非当前卡 rAF 分批，≈165–235ms 补齐） |
| 青山内容编辑 duplicate / undo | （含在上条全量里） | 8–15 / 6–11ms |

缩略图重建计数（MutationObserver 统计被重画的 `.thumb-canvas` 卡片）：切页 **0**；青山内容编辑 **1**；青山全量 **12**；六茶全量 **1**；六茶 `refreshPreview` **0**；`.thumb-item` 新增节点 0/0/0（全量走卡片复用，不再 `innerHTML=""`）。

DOM measure 删除证据：`git grep -nE "dom-measure|domMeasure|createDomMeasure|isDomMeasureAvailable|measurePort" -- editor tests` → 无匹配；`editor/app/view/dom-measure.js` 已删除（`git status` 记 D）；编辑器 `layout()` 不再传 MeasurePort，`refreshPreview` 内 0 次 `getBoundingClientRect`（前 44 次/次）。

## B. 实现 / 偏差 / 坑

**T1 纯函数度量**：`view.renderCanvas` 的 `layout({...}, measurePort)` 改为 `layout({...})`（默认 `fontMetricsMeasure`），删除 `dom-measure.js` 与 import/常量，注释改为“编辑器/导出/headless 同一度量”。六茶海报截图与 W2 的 `docs/images/editor.png` 画布像素一致，文字几何无可见变化。

**T2 缩略图增量化**：`view.render(options)` 支持 `thumbs:"all"|"current"|"none"`（默认 all 保兼容）。`thumbnails.renderThumbnails()` 仅结构变化时全量；新增 `refreshCurrent()`（只重画当前卡）、`setActive(index)`（只移 `.thumb.active` + 页码 + 必要时滚动）；`refreshThumb(pg)` 保留。结构守卫 `structureSig` = 每页 `pageType + 首个 elementId` + deck 尺寸（**不含元素数量**，否则增删元素会误判全量）；签名不符自动回落全量，因此撤销页操作也安全。卡片盒尺寸只量首卡（原来每卡 `clientWidth` 各强制一次布局）。
调用点分类：**all** = `loader.finishLoad` 首帧/字体、`io.newProject`、`api.insertPage/deletePage/movePage`、`design-panel` 主题与颜色令牌 `endChange({thumbs:"all"})`、`preview.js/editor.js` 的 resize 与 `present.js` 退出（默认 all）；**current** = `api` 内容编辑 `onDone`、增删/paste/duplicate/cut、`endChange` 默认、`loader.applyHistory`（撤销/重做）；**none** = `api.goToPage`、缩略图点击（`thumbnails.reload`）；纯选择不 render（`api.select→lightSelect`）。
**卡片复用 + 分帧绘制**：结构签名一致时 `repaintAll()` 原地重画（不 `innerHTML=""`、不重挂 handler），当前卡同步画，其余卡按 `PAINT_BUDGET_MS=24` 每帧分批（`requestAnimationFrame`，重建/销毁时取消队列）。`ensureActiveVisible()` 只在当前卡不在可视区时 `scrollIntoView`（原先每次都调，单次 ~8ms）。

**T3 viewport 缓存**：`stage.clientWidth/Height` 缓存进 `stageBox()`，`applyScale/fitScale` 共用；`ResizeObserver(stage)` + window resize + `followStageWidth` 每帧失效，隐藏态 0 尺寸不缓存；`destroy()` abort 监听并 disconnect。resize/窄屏/抽屉行为由 preview-shell/editor-minimal/feedback-fixes 覆盖全过。

**偏差（需 lead 知悉）**：① 非当前页缩略图绘制改为分帧（最多 24ms/帧），青山 12 张卡片在 ~0.2s 内补齐；这是达到“青山全量 ≤80ms”的必要手段——12 张 ECharts 卡片的同步绘制下限实测 ~123ms（ECharts init/draw ~48ms + 页面布局 ~63ms + GC），无法在同步路径内压到 80ms。截图/全部 e2e 均在等待后与优化前一致。② `api.endChange` 默认 `{thumbs:"current"}`，design-panel 两处显式传 `all`（主题/颜色令牌）。③ `view.render` 默认仍 `all`（外部 resize/present 调用点语义不变）。

**坑**：缩略图循环里每卡 `clientWidth` 会触发布局抖动；`scrollIntoView` 全量重建时成本高；签名不能含元素数量（paste/duplicate 会误判）；rAF 队列在快速连续 render 时需取消重建；headless 下字体收尾的第二次 `view.render()` 可能晚于 ready，性能取数需等“无空缩略卡”。

## C. commit / 文件 / 探索审计 / 未决

| commit | message |
|---|---|
| `aa02cdc` | perf(editor): 删除编辑器 DOM 文本度量，布局统一走纯函数 fontMetricsMeasure |
| `c07010d` | perf(editor): 缩略图增量化（内容编辑只重画当前页、切页只移动 active、结构变化才全量） |
| `53b03ea` | perf(editor): viewport 缓存 stage 尺寸，render 路径不再强制布局 |
| `bc3c044` | perf(editor): 缩略图卡片复用与分帧绘制，全量渲染不再同步重画所有页 |
| `9ab769e` | test(perf): 新增编辑器性能基线（六茶刷新/全量、青山切页/全量，npm run test:perf） |
| （本提交） | docs(w6): 写 W6 交接 |

新增 `tests/perf/editor-perf.mjs`（临时 server + headless Chrome，无 Chrome SKIP+exit 0，不进 run-all）；删除 `editor/app/view/dom-measure.js`；修改 `editor/app/view/{view,thumbnails,viewport}.js`、`editor/app/api.js`、`editor/app/project/{io,loader}.js`、`editor/interaction/design-panel.js`（2 处 render 分类）、`package.json`（`test:perf` 一行）。
`git diff --name-only b6c2303 -- packages editor/preview.js editor/editor.js editor/main.js editor/interaction/{canvas,stage}.js editor/gallery.js tests/golden tests/projects tests/contract contract.json skill editor/styles` → 空。

**探索审计（只读）**：`specs/.../07-W6-performance.md`、`ref/repo-map.md`、`handoff/{W2,W5}-worker.md`；`editor/{preview,editor,main,skeleton,dom,ui,theme}.js`、`editor/app/{state,api,present,shot,toolbar,keyboard}.js`、`editor/app/project/{io,loader,source,saver,images}.js`、`editor/app/view/*`、`editor/interaction/{canvas,design-panel,dialogs/{table,chart}-editor,excel-grid}.js`、`packages/layout/index.js`、`packages/renderer/{page,chart,shell,text}.js`、`packages/model/model.js`、`packages/server/index.js`、`packages/renderer/headless/{browser,cdp}.js`、`tests/e2e/*`、`tests/regression/measure.mjs`、`tests/tools/{golden-diff,ui-shots}.mjs`、`examples/{poster-six-tea-types,qingshan-coffee-review-12p}`。未全仓重读。

**未决**：① `docs/images/{editor,gallery}.png` 与当前代码仅顶栏品牌字形差异（`OPEN/PPTD` vs `OPEN PPTD`，W2 之后的既有差异，非本次改动；画布/缩略图像素 0 差异），故未重生成。② 主题切换时非当前卡晚一帧可见（≤0.2s），如需更快可调大 `PAINT_BUDGET_MS` 或改为一次性补齐。③ 六茶 `endChange` 单次提交约 40–54ms（含 `syncDirty` 全 deck JSON 对比 + 画布 + 当前卡），仍在 60ms 预算内。
