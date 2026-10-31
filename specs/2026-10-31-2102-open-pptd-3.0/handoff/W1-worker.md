# W1 handoff · 基线 + 清理

> 分支 `feat/3.0-w1-baseline`，起点 `7af07eb`；T1–T4 各一个 commit，本文件为第 5 个 commit。
> 环境：Windows 10.0.28120 x64 + Git Bash + Node v24.21.0；零依赖、零构建；本机 Chrome `C:/Program Files/Google/Chrome/Application/chrome.exe`。

## A. 自测真实输出

```text
$ node tests/tools/dump-formula-mml.mjs
KaTeX MathML 生成: 204/204
$ node tests/regression/formula.mjs
公式转换回归: 204/204 与官方 XSLT 字节一致

$ node tests/run-all.mjs          # 最终验收
结果: 26/26 通过 ✅               # exit 0, 22s（T1 首跑 31s，差异来自 OS/缓存）
  ✓ 导出 + 包一致性 chart（24 页）… text（8 页）共 9 套
  ✓ 包级公开契约（contract 4）… 智能参考线吸附（align-guides）

$ node tests/regression/dep-graph.mjs
✓ 依赖方向与环境全局检查通过      # 3 处登记豁免（font-registry lazy path import、writer downloadPptx ×2）
$ node tests/contract/public-api.mjs
结果: 契约通过 ✅

$ node tests/e2e/render.mjs
PASS 页面数一致 count=24 / 输出文件数一致 files=24 / 耗时 4553ms
PASS 全部 PNG 尺寸 960×540 / 非空 >5KB / scale=2 1920×1080 / 右下角有内容 colors=13
✓ render 冒烟测试 9/9 通过        # exit 0, 10s

$ node tests/tools/parity-baseline.mjs
parity baseline → tests/fixtures/parity/baseline.json
  chart: page1@1x 960x540 8733B, page2@1x 960x540 10753B,
         page1@2x 1920x1080 29118B, page2@2x 1920x1080 41400B
  tables: 24 · text frames: 68 (grown 7)    # exit 0；重复运行 byte-identical
```

CLI：`--help` 全文见 `ref/baseline-cli.txt`；`export tests/projects/chart/deck.pptd` → exit 0、1s、837227 bytes；`check tests/projects/table/deck.pptd` → 0 error / 2 geometry warning。`tests/projects/*/out/check-*.pptx` 共 9 个（run-all 生成，已 ignore）。最终 `git status --short` 为空；`tests/golden/**`、`tests/projects/**` 基线数据零 diff。

## B. 删除清单、消费者证据与坑

**T2 死代码**（证据均为全仓 grep，排除文件自身）：

- `editor/components/{datagrid,dialog,field,panel,popover,section,toolbar,tooltip,index}.js`：`grep -rn "components/<name>\.js"` 零命中，无任何 import/HTML script。
- 保留 `button.js`（consumer：`editor/ui.js:13`）、`menu.js`（`editor/app/file-menu.js:13`、`editor/interaction/contextmenu.js:17`）；`file-menu.js`/`ui.js`/`contextmenu.js` 未删。
- `packages/measure/adapters/dom.js`：`createDomMeasure/isDomMeasureAvailable/DOM_MEASURE_UNAVAILABLE` 仅命中 `editor/app/view/dom-measure.js` 自己的同名实现；无 import 指向 measure/adapters，包内也无 barrel 导出。
- 根 `index.html`：删除重复 `<script type="module" src="./editor/gallery.js">`；保留 inline module（`import { showGallery }` + 调用）。`gallery.js` 无顶层自执行，inline 才是实际入口。

**T3 docs**：删除 `docs/archive/**`（24 文件）、`specs/2026-09-30-ui-redesign-line/**`（7）、`specs/ref/dsh-theme-mapping.md`（1）。保留 `docs/release-workflow.md`、`docs/images/**`、`docs/embedding.md`（W10 删）、`docs/image-generation.md`（W11 删）和当前 3.0 spec 组。
`git grep -nE "docs/archive|docs/specs|dsh-theme|integration-plan|DSH"`（排除已删路径）只剩 `docs/embedding.md:4` 一句“历史设计已删除，见 git 历史”。
断链修复：`docs/embedding.md` 6 处（开头权威设计、深路径映射、4 个附录引用、`dsh-app://` 示例）、`tests/contract/README.md`、`tests/regression/ui-token-literals.mjs`；DSH 注释改为“embedding hosts”（dialogs/gallery/render/server/public-api）。

**坑 / 偏差**：

1. **2.x 单页 `renderDeck({page:n})` 有竞态**：n>1 常截到第 1 页（文件名却是第 n 页）。实测 `--page 2` 两次均 8733B/hash `01b0622d…`（=第 1 页）；`--page 3` 一错一对；`--page 4` 正确；`--page 5/6/7/8` 全错。整 deck 渲染稳定 24 页/24 个不同 hash。T4 因此渲染整 deck 再抽 page 1/2；W3 修 DPR/单页路径后可收紧。
2. 3 个 barrel 只改了注释：`packages/model/index.js`（T2 点名）、`packages/measure/index.js`（删 adapter 后消除指向已删文件）、`packages/server/index.js`（DSH 措辞）。导出/行为零变化，contract 通过；与“barrel 零 diff”字面冲突，按 T2“修正 stale 注释”执行，特此披露。
3. 无 Chrome 时脚本走 `findBrowser` 抛错 → `SKIP` + exit 0；本机有 Chrome，该分支未能实机触发，仅代码路径审阅。
4. `tests/projects/*/out/` 不入库，check pptx 只能由 `run-all` 生成；依赖字体/浏览器的测试在本机全绿。

## C. 文件 / commit 指针

| commit | message |
|---|---|
| `40e2f4e` | docs(w1): 记录 2.x 全量基线（测试/CLI/图表 PNG/表格度量） |
| `1fb2a46` | chore(w1): 删除未接线组件与度量桩，清理重复入口和过期注释 |
| `e358331` | chore(w1): 删除 docs/archive、旧 UI spec 与 DSH 文档并修复断链 |
| `81da93f` | test(w1): 新增 parity 基线采集工具与图表/表格/文字基线 |
| （本文件） | docs(w1): 写 W1 交接 |

- 基线：`specs/2026-10-31-2102-open-pptd-3.0/ref/baseline.md`、`ref/baseline-cli.txt`。
- parity：`tests/tools/parity-baseline.mjs` → `tests/fixtures/parity/baseline.json`。
  字段：`version/generator/capturedOn/environment`；`chart.renders[] = {page,scale,width,height,bytes,sha256,chartRegion{distinctColors,nonWhiteRatio}}`；`tables[] = {project,page,elementId,declared,columnWidths,rowHeights,totalHeight}`；`textFrames.elements[] = {page,elementId,declaredH,frameH,grown,lines,contentHeight}`。
- 保留待后续波次：`docs/embedding.md`（W10 删）、`docs/image-generation.md`（W11 迁 skill 后删）、`packages/cli/ensure.js`（W10 删）。
