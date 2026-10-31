# W3 handoff · ExportService + PNG/DPR
> 分支 `feat/3.0-w3-export`，起点 `f3f823f`；环境 Windows 10.0.28120 + Git Bash + Node v24.21.0；零 npm 依赖。

## A. 自测真实输出

```text
# 开工基线
$ node tests/tools/dump-formula-mml.mjs → KaTeX MathML 生成: 204/204
$ node tests/run-all.mjs                  → 结果: 27/27 通过 ✅
$ node tests/runtime/run.mjs              → runtime: 92/92 通过 ✅
$ node tests/regression/dep-graph.mjs     → ✓ 依赖方向与环境全局检查通过
$ node tests/contract/public-api.mjs → 结果: 契约通过 ✅

# 完工（真实输出）
$ node tests/export/run.mjs               → export: 56/56 通过 ✅（exit 0）
$ node tests/run-all.mjs                  → 结果: 27/27 通过 ✅（无回退）
$ node tests/runtime/run.mjs              → runtime: 92/92 通过 ✅
$ node tests/regression/dep-graph.mjs     → 扫描 201 文件 / 756 import（barrel 10）✓
$ node tests/contract/public-api.mjs      → 结果: 契约通过 ✅
$ node tests/e2e/render.mjs               → render 冒烟测试 9/9 通过 ✅（timeouts=0）
$ node bin/open-pptd.js check tests/projects/table/deck.pptd
  ⚠ [geometry] 第2页 … / 第7页 …（与 W2 基线逐字一致）；0 个错误，2 个警告；exit 0
$ node bin/open-pptd.js export … -o <tmp>  chart=837227 / table=250837 / text=141748 / font-embed=2141500 bytes
$ node bin/open-pptd.js export-project …     chart=35583 / table=22704 bytes；zip 条目与内容与旧实现逐项相等
```
单页 parity（chart，scale=1/2）；`--page n` 产物 == 整包第 n 页 sha，且 != 第 1 页：
`p2..p8 @1x: 1eb66434/d6ddc9ec/906ef55a/93b30683/d78f4236/ba36c151/b221de01`（page1=01b0622d）；
`@2x: a7fb1dce/29a9b28f/8b66d975/1cec2fcb/c37c4918/3311f149/bda247c6`（page1=ca84e9d2，1920×1080）。
scale2 图表区域（baseline → 实际）：p1 distinctColors 44→21、nonWhite 0.278→0.2752；p2 55→30、0.1785→0.1759；
边缘能量（scale 归一）：p1 2.084 vs 1x 1.917，p2 0.970 vs 1x 0.787（更锐）。DPR 证据：`diagnostics()` dpr=2，
chart canvas 1600×680 / CSS 800×340（ratio 2.0）。
**DPR/单页根因（实验定位）**：① 临时渲染 server 未传 `liveReload:false`，SSE 立即下发 `data: ready`，
editor 加载尾部 `connect()` 收到后重载项目（`state.currentPage→0`）并重绘第 1 页——exp5 中 goto(1) 后 DOM 先
“饼图”后变“柱状图”，截图始终 01b0622d；② zrender 在模块加载时快照 `window.devicePixelRatio`，导航后
`setDeviceMetricsOverride(dsf=2)` 既不改变已缓存 DPR，也不重绘 page 0——修复前 canvas backing 800×340（css 800×340，1x），所以“所有页”图表都被放大栅格化。
修复：导航前设 dsf=scale；ready 后设 deck 尺寸并 `goto(0)` 重绘并等 ready；每次 goto 用绑定 ready 事件后
再截图；临时 server 关闭 SSE。

## B. 实现、偏差与审计

**新增 API**：`packages/export/index.js#exportProject(project, options, env) → ExportReport`；
format=`check|pptx|png|bundle`；env=`{resources, renderBackend?, sink?, onProgress?}`。报告字段按 interfaces §5：
`ok/format/outPath?/pages?/checked{fonts,icons,media}/fetched/embedded/skipped/missing/warnings/errors`；
扩展字段（已 JSDoc）：`check`（结构化 CheckReport）、`skippedIcons`、`unsupported`、`files`、`artifacts`（无 sink 时
返回内存字节）、`bytes`。错误码：`ERR_INVALID_FORMAT/ERR_INVALID_OPTION/ERR_NO_RESOURCES/ERR_NO_RENDER_BACKEND/
ERR_RENDER_BACKEND/ERR_PAGES/ERR_BUNDLE_RAW/ERR_EXPORT`（headless backend 另用 `ERR_UNSUPPORTED_BACKEND`）。
PPTX 复用 writer（buildPptx/ZipWriter/safeFileName）；字体经 ResourceProvider.fontBytes 预载 + registry 以
data: URL 交给 writer（Node/browser 同语义），图标走 `resources.iconRegistry + iconSvg`；图片走
resolveProject imageMap / project.media / data URL；bundle snapshot/raw 走 runtime.serializeProject。
PNG 只做页选择/scale/命名/报告，rasterize 由 `packages/renderer/headless/backend.js`（Node-only）注入。
**接线**：CLI `export`→format pptx、`export-project`→bundle+raw、`render`→png；命令名/帮助/人类输出/JSON/
退出码/默认输出路径/字节数不变（默认路径仍由 CLI 用 node:path 计算后传入）。`export-project` 现按工单先跑
checkProject（坏 deck 会阻断；有效项目产物逐字节一致）；CLI export 传 `checkLayout:false` 以保持旧导出闸门
（schema/资源，不含布局几何警告）与输出不变。`render.js` 仍导出 `renderDeck`（e2e 直连）。

**偏差**：① `strict` 按“warning/missing/unsupported 阻断”实现；`fetchFonts` 接受但 W3 不联网（fetched=[]，W6）。
② scale2 `distinctColors` 低于 baseline：baseline 是 1x 图表被 2x 放大的“插值色”，锐化后自然减少；测试改为
nonWhiteRatio≥baseline-5% + colors≥scale1 基线 + 边缘能量≥1x 档（同时在输出打印 baseline 对比）。
③ 内存项目无法用 headless backend（无 manifestPath）→ `ERR_RENDER_BACKEND`；可用其他 backend。
④ raw bundle 的 theme override 只告警不生效（raw 保留磁盘原文）。⑤ 未改 editor；未改 package.json/
contract/barrels/dep-graph/run-all/golden/runtime/model/writer/layout/measure。

**探索审计（只读）**：specs 本组 5 文件；editor/{editor.js,app/shot.js,app/view/view.js,app/project/loader.js,
live-reload.js}；packages/server/{index,events,runtime-node}.js、packages/runtime/**、packages/writer/
{pptx,font,icon,util}.js、packages/renderer/{page,chart}.js、packages/model/{font-registry,icon-fa,bytes}.js、
tests/{run-all,e2e/render,regression/{validate,package-integrity},tools/parity-baseline}。无全仓重读，
未触碰主检出与其他 worktree。

## C. 文件 / commit 指针

| commit | message |
|---|---|
| `4309c57` | fix(renderer): 修复 headless 单页竞态与图表 DPR 栅格化 |
| `5224380` | feat(export): 新增 ExportService 统一 check/pptx/bundle/png 编排 |
| `e129f2e` | refactor(cli): export 与 render 内部接入 ExportService，命令面与输出不变 |
| `f8378fd` | test(export): 新增 ExportService 自测（report/错误分支/单页 parity/scale2 指标） |
| （本文件） | docs(w3): 写 W3 交接 |

新增：`packages/export/{index,errors,report,pptx,bundle,png}.js`、`packages/renderer/headless/backend.js`、
`tests/export/run.mjs`。修改：`packages/renderer/headless/shoot.js`、`packages/cli/{export,render}.js`。
