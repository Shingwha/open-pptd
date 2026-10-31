# W3 · ExportService + checkProject（含 PNG/headless 与图表 DPR）

> 分支/前置：W2 已合并；写入范围 `packages/export/**`、`tests/export/**`、`tests/regression/parity-png.mjs`、CLI export/render 内部调用（不改命令面）、`packages/renderer/headless/**` 的最小修复。
> 本波把 check/pptx/bundle/png 的编排收进一个服务；不迁编辑器浏览器导出（W9）。

## 目标

- `ExportService` 统一 `checkProject` + `pptx`/`bundle`/`png`；CLI `export`/`export-project`/`render` 内部改调它（外部命令暂不变，W10 再换面）。
- 修复图表 DPR：headless 在第一次 paint 前确定 scale；setDeviceMetricsOverride 后重绘第 1 页；后续页同策略；`pixelRatio=scale` 不依赖 `window.devicePixelRatio`。
- 统一 ExportReport/CheckReport、strict/offline/fetch、错误类型。
- PNG 仍允许两条浏览器 backend；本波至少 Node/headless 后端。

## 范围

- `packages/export/`：`checkProject`、`exportProject`、format routers、RenderBackend 接口、headless backend、report/errors。
- `packages/renderer/headless/shoot.js`：DPR 修复 + 可选 `pixelRatio`/scale 传递；shot 页面 repaint。
- CLI `export.js`/`render.js`/`bin.js` 内部调用 ExportService；**不改命令名/帮助**（W10）。
- ProjectRuntime 已有 load/resolve/serialize；ExportService 消费它。
- 测试：check/pptx/bundle/png；strict/offline；report；chart page1/2 scale2 parity；无浏览器 SKIP。

## 非目标

- 不改编辑器 saver/export-image（W9）。
- 不改 CLI 5 命令面（W10）。
- 不改表格/measure/type manifest（W4/W5）。
- 不做 Office/WPS 渲染。
- 不做图片版 PPTX。

## 验收

1. 全量回归 + dep-graph/contract 绿；旧 CLI 命令输出保持兼容（本波仅内部替换）。
2. `build/export` 的 pptx/bundle 与现有输出一致；ExportReport JSON 稳定。
3. chart 项目 scale=2 第 1 页/第 2 页图表区域不糊；尺寸 1920×1080；与第 2 页清晰度同档（采样/边缘断言）。
4. 无 Chrome 时 PNG 返回明确错误/SKIP；pptx/bundle 不受影响。
5. 写入范围外零 diff；无新增依赖。

## 前置上下文

- 必读顺序：`ref/repo-map.md` → `ref/interfaces.md` §4–6（ProjectRuntime / ExportService / RenderBackend）→ `ref/decisions.md` D2/D9/D10 → `handoff/W2-worker.md` → 本工单。
- 基线命令（开工先跑，贴真实输出）：
  - `node tests/tools/dump-formula-mml.mjs`；`node tests/run-all.mjs` → 27/27（W2 起 runtime 已接入）；
  - `node tests/runtime/run.mjs` → 92/92；`node tests/regression/dep-graph.mjs`；`node tests/contract/public-api.mjs`。
- 稳定区（勿重读/勿改）：`packages/runtime/**`（要用就调 API）、`packages/model/**`、`packages/writer/**`、`packages/layout/**`、`packages/measure/**`、`editor/**`。
- W2 已交付：`loadProject/parseProject/createProject/resolveProject/serializeProject/checkProject`；Node `createDiskProjectSource`/`createFsResourceProvider`（`packages/server/runtime-node.js`）；错误码 `ERR_*`；`checkProject` 为同步。
- 已知坑：
  - 2.x 单页 `renderDeck({page:n>1})` 竞态：`goto(i)` 后立即截图，常在重绘前截到上一页；scale>1 时 `setDeviceMetricsOverride` 后未重绘 page 0，图表首屏按 scale=1 栅格化。两处都在 `packages/renderer/headless/shoot.js`，本波修。
  - PPTX 导出字节含 zip DOS 时间戳，sha256 不稳定；验收用输出字节数（chart=837227）。
  - 公式 fixture 不入库；不要提交生成物。
  - 零依赖；`packages/export` 是双端包，禁止 `node:`/DOM（dep-graph 已配 export 边表）。

## 本波实施口径（lead 已拍板）

1. **分层**：`packages/export/` 只做纯编排（format 路由、check→export 流程、report/errors、RenderBackend 接口）；Node/headless backend 工厂放 `packages/renderer/headless/backend.js`（Node-only），由 CLI 注入 `env.renderBackend`。`packages/export` 不得 import renderer/server/cli。
2. **API**：按 `interfaces.md` §5 的 `exportProject(project, options, env)`；返回 report（含 `bytes/files` 由 `env.sink` 写出或直接返回内存结果）。错误用 `ERR_*` code；report 形状本波冻结，W9/W10 复用。
3. **CLI 内部替换**：`packages/cli/export.js`（export/export-project）与 `render.js` 改调 ExportService；命令名、帮助文本、人类输出、JSON、退出码、默认输出路径、产物字节数全部不变。`export-project` 用 `bundleMode:"raw"`。
4. **DPR/单页修复**：`pixelRatio=scale` 在第一次有意义的 paint 前确定；`setDeviceMetricsOverride` 后必须重绘 page 0 并等待 ready；每次 `goto(i)` 后等待 ready 再截图。不得依赖 `window.devicePixelRatio`。
5. **测试**：`tests/export/run.mjs` 自跑（check/pptx/bundle/png、strict/offline、report 形状、无 Chrome 时 PNG 明确报错且 pptx/bundle 不受影响、scale1/2 尺寸）。PNG parity 与 `tests/fixtures/parity/baseline.json` 对照：尺寸 1920×1080、page1/2 图表区域 `distinctColors/nonWhiteRatio` 不低于基线同档，不做 sha 断言。
6. **接入 run-all 由 lead 做**：不要改 `tests/run-all.mjs`、`package.json`、`contract.json`、barrels、dep-graph。
