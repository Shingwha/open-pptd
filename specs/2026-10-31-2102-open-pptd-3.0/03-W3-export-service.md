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

待 W2 合并后补：runtime API、Node provider、W2 handoff、baseline 命令、稳定区、已知坑。
