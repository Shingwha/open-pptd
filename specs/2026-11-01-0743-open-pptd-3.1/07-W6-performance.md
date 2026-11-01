# W6 · 编辑器性能优化（DOM 度量移除 + 缩略图增量化）

> 分支由 lead 派工时创建。最高约束：不改引擎渲染/导出语义；headless/golden 必须保持 156/156 字节一致。编辑器预览允许因“纯函数度量”与导出对齐而产生预期的文字几何变化。

## 目标

把“六大茶艺”海报（`examples/poster-six-tea-types`：1 页 97 元素，57 text / 35 shape / 4 icon / 1 chart，720×1080）的编辑卡顿降到可接受水平，并消除同类大元素量页面的系统性问题：

1. **编辑器改用纯函数度量**：删除 `editor/app/view/dom-measure.js` 与 view 中的 MeasurePort 注入；`layout` 使用默认 `fontMetricsMeasure`。与 3.0 D5（预览/headless/CLI 同一度量）对齐，消除每个文本元素一次强制布局/`getBoundingClientRect`。
2. **缩略图增量化**：内容编辑/撤销/粘贴只刷新当前页缩略图；切页只更新 active 状态与画布，不重画全部缩略图；只有载入/增删页/移动页/应用主题才全量重建。
3. **缩放适配缓存**：`viewport.applyScale()` 避免每次 render 都 `getBoundingClientRect` 重算 fit；尺寸/缩放变化时失效。
4. **性能基线工具**：新增 headless Chrome 性能测试，覆盖六茶海报画布重绘、内容渲染、青山 12 页切页/全量渲染；无 Chrome SKIP；不进 run-all（避免计时波动），`npm run test:perf` 手动/发布前跑。

## 前置上下文

- 必读：`ref/repo-map.md` → `handoff/W2-worker.md`（UI/截图）→ `handoff/W5-worker.md`（六类添加）→ 本工单。
- 基线命令：`node tests/run-all.mjs` 39/39；全部 e2e（editor-minimal/page-ops/editor-ops/preview-shell/feedback-fixes/add-elements/browser-export/incremental）；`golden-diff` 156/156。
- 实测（lead，无头 Chrome，2026-11-01）：
  - 六茶海报：canvas-only `refreshPreview` ≈ **44–61ms**；`layout` 纯度量 ≈ **1.2ms**，DOM 度量 ≈ **32–39ms**（33× 差）。
  - 青山 12 页：首次全量渲染 ≈ **184ms**；canvas-only ≈ **6–10ms**；12 个缩略图共 634 个节点。
  - JS profile：`getBoundingClientRect` 46%、`fitScale` 5.2%、`domTextHeight` 4.3%、ECharts ~4%。
  - 现状 `view.render()` 每次 `thumbnails.renderThumbnails()` 全量重建所有页缩略图（`disposeChartInstances(bar)` + innerHTML=""）。
- 现有相关文件：
  - `editor/app/view/view.js`：`measurePort`（DOM 适配器）、`renderCanvas`、`render`、`thumbnails.renderThumbnails()`。
  - `editor/app/view/dom-measure.js`：offscreen DOM 文本测量（待删除）。
  - `editor/app/view/thumbnails.js`：`renderThumbnails` 全量重建、`refreshThumb(pg)` 单页刷新、`renderStat`。
  - `editor/app/view/viewport.js`：`fitScale`/`applyScale`/`applyScale` 读 stage 尺寸。
  - `editor/app/api.js` 的 `render()`/`repaint()` 与各操作调用点；`io`/`design-panel` 的主题应用、载入路径。
- 稳定区（勿改语义）：`packages/**`、`editor/preview.js`、`editor/editor.js`、`editor/main.js`、`editor/interaction/{canvas,stage}.js`、`tests/golden/**`、`tests/projects/**`、`contract.json`、`skill/**`。

## 工单

### T1 移除 DOM 度量
- `editor/app/view/view.js`：删除 `createDomMeasure/isDomMeasureAvailable` import、`measurePort` 常量；`layout({...}, undefined)` 或直接 `layout(deck)`；更新注释（纯函数单源）。
- 删除 `editor/app/view/dom-measure.js`（grep 确认无其他 import/测试引用）。
- 验证编辑器文字位置/高度与导出/pure 一致；e2e 全过；golden 不受影响（headless 本来纯度量）。
- 允许改：view.js、dom-measure.js（删除）、相关注释/测试引用。

### T2 缩略图增量化
- `editor/app/view/thumbnails.js`：
  - 保留 `renderThumbnails()`（全量，仅载入/页增删/移动/主题）；
  - 增加 `refreshThumb(pg)` 复用（已有）与 `setActive(index)`（只切 `.thumb.active` + 页码 + 必要时 scrollIntoView，不重画内容）；
  - 避免每次 render 都 `disposeChartInstances(bar)`/清空 bar。
- `editor/app/view/view.js`：`render(options = {})` 接受 `thumbs: "all"|"current"|"none"`（默认 all 以保兼容）：
  - 载入/页操作/主题 -> all；
  - 内容编辑/撤销/粘贴/删除元素 -> current；
  - 切页 -> none + `setActive`；纯选择不动 render。
- `editor/app/api.js`/`io`/`design-panel`/`loader`：按上述语义改调用；找出所有 `render()` 调用点并分类。
- 验证：编辑六茶只重画当前缩略图；青山切页无 12 缩略图重建；页增删/移动/主题后缩略图正确。

### T3 viewport 适配缓存
- `editor/app/view/viewport.js`：`fitScale`/`applyScale` 缓存 stage 尺寸/deck 尺寸；stage 尺寸变化（ResizeObserver 或 resize 事件）时失效；缩放/平移行为不变。
- 只在 T1/T2 后仍占显著比例时做；必须保证窗口 resize、窄屏、deck 尺寸变化后画布仍居中/适配。

### T4 性能测试
- 新增 `tests/perf/editor-perf.mjs`（或 `tests/perf/run.mjs`）：
  - 启动临时 server + headless Chrome，载入六茶海报：测 `refreshPreview` 10 次 p50/p95；`duplicateSelected()+undo()` 5 次的全量渲染；DOM 节点数；
  - 载入青山 12 页：测切页（`goToPage`）与一次全量渲染；报告缩略图重建次数（可在测试中 patch/计数）；
  - 阈值（本机参考，留余量）：六茶 canvas p50 ≤ 20ms、p95 ≤ 30ms；六茶全量编辑 ≤ 60ms；青山全量 ≤ 80ms；切页 ≤ 40ms。
  - 无 Chrome → SKIP + exit 0；`package.json` 加 `test:perf`；不加入 run-all。
- 记录优化前后数字（同一机器）到 handoff。

### T5 视觉/回归
- 纯度量可能改变编辑器文字几何（与导出对齐）；跑全部 e2e；如截图明显变化，重跑 `tests/tools/ui-shots.mjs` 并更新 `docs/images/editor.png`/`gallery.png`。
- `golden-diff` 必须 156/156 字节一致（headless 不动）。
- 检查六茶海报编辑器：选中/拖动/缩放/复制/内容编辑/切页/undo 的响应；确认不再卡顿（主观记录）。

## 验收

1. `run-all` 39/39；dep-graph/contract；全部 e2e；golden 156/156。
2. 六茶 canvas p50 ≤ 20ms、p95 ≤ 30ms；全量编辑 ≤ 60ms；青山全量 ≤ 80ms、切页 ≤ 40ms（真实输出）。
3. 编辑当前页只刷新 1 个缩略图；切页不重建全部缩略图（测试/计数证据）。
4. 无 DOM measure 残留（grep）；`editor/app/view/dom-measure.js` 删除。
5. 写入范围外零 diff；无新增依赖。

## 禁触清单

`packages/**`、`editor/preview.js`、`editor/editor.js`、`editor/main.js`、`editor/interaction/{canvas,stage}.js`、`editor/gallery.js`、`tests/golden/**`、`tests/projects/**`、`tests/contract/**`、`contract.json`、`skill/**`。

## 交接 / 报告

最后一个 commit 写 `specs/2026-11-01-0743-open-pptd-3.1/handoff/W6-worker.md`（A/B/C，50–70 行）；报告含：优化项、前后耗时表、缩略图重建计数、DOM measure 删除证据、e2e/golden、偏差、探索审计。
