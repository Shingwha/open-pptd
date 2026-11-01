# W3a · 代码去重 / 删死代码

> 分支/前置：W2 已合并；写入范围按文件组（见下），不改行为/接口。
> 本波只做**可证明等价**的合并与零引用删除；有争议的跨层合并（memorySource、font 就绪模型、sfnt 解析）后移。

## 目标

- 删除零引用函数/未使用 import/死导出（不改公共合同面）。
- 合并逐字重复逻辑与安全的单文件重复。
- 测试工具去重（PNG 解码/断言/临时目录/ZIP 读取）。
- 保持 `run-all`、e2e、contract、dep-graph 全绿；导出/保存语义零变化。

## 范围（按安全等级）

**A. 零引用删除**
- `packages/paths.js: cleanTempParts`
- `packages/writer/font.js: skipReasonText`
- `editor/app/project/font-manager.js: registerRegistryFontFace`
- `editor/app/project/icons.js: getIconRegistrySync, queryIconEntries`（合并后确认）
- `editor/components/button.js: iconButton, buttonRow`（如确认无消费者）
- `editor/interaction/fields.js: fieldHandlers, renderGroup`
- `editor/types/index.js: contentEditorTypeIds`（如确认无消费者）
- 未使用 import：`packages/cli/project.js`、`editor/interaction/design-panel.js` 及测试文件（见 survey §2.4）

**B. 安全合并**
- `editor/app/project/source.js` + `saver.js`：`revisionOfSourceFiles` 去重（留一份导出）。
- `editor/app/project/saver.js` + `export-image.js` + `design-panel.js`：字节格式化统一；saver 内 chip 构造抽一份。
- `packages/server/{themes,fonts}.js`：抽出 `server/http-util.js`（readJsonBody/sendJson/sendError/isLoopback）并复用。
- `packages/server/api.js` + `export-image.js`：readBody 参数化/JSON responder 合并（语义不变）。
- `packages/cli/project.js`：去掉对 manifest 的二次 `yaml.load`（runtime 已解析），或复用 `prepareProject`。
- `packages/cli/check.js`：`checkDeck` 复用 `prepareProject`（若形状允许）。
- `scripts/pack-release.mjs`：复用 `writer/zip` 的 `dosDateTime`（导出）。
- `tests/lib/unzip.js` + `tests/skill/zip.mjs`：ZIP 读取合并（测试侧）。
- `editor/interaction/dialogs/base.js` 按钮复用 `components/button.js`。
- `editor/interaction/design-panel.js` 下载复用 writer `downloadBlob`。

**C. 测试工具（可选，独立 commit）**
- PNG 解码/paeth/chartRegionSample/edgeEnergy 统一到 `tests/tools/golden-lib.mjs`。
- `withTempDir()` / `walk()` / `check()` 共享到 `tests/lib/`。
- 不改变断言覆盖；测试数量可保持不变。

## 非目标

- 不合并 `memorySource` 两份、sfnt 解析（model vs script）、字体就绪模型、Node host env 装配（风险高，后移）。
- 不删除仅测试消费者但属于规格 API 的 `adjustRowHeightsForRowChange` / `types/load.js`（保留）。
- 不改注释风格（W3b）、不改 UI（W2）。

## 验收

1. `run-all` 39/39；dep-graph/contract；e2e 全过；golden 零漂移。
2. 删除项 grep 零引用；合并后无行为 diff（package-integrity/导出结构/PNG 尺寸）。
3. `git diff` 仅限工单文件；无新增依赖。
4. 公共导出面变化为零（contract 测试通过）；如删除非合同导出，先在 handoff 列出。

## 前置上下文

- 必读顺序：`ref/repo-map.md` → `handoff/W1-worker.md`、`handoff/W2-worker.md` → 本工单 → `specs/2026-10-31-2102-open-pptd-3.0/handoff/W9-worker.md`（revision/导出）与 `W10-worker.md`（CLI/契约）。
- 基线命令（两路各自开工先跑，贴真实输出）：`node tests/tools/dump-formula-mml.mjs`；`node tests/run-all.mjs`（39/39）；`node tests/e2e/{editor-minimal,page-ops,editor-ops,preview-shell}.mjs`；`node tests/regression/dep-graph.mjs`；`node tests/contract/public-api.mjs`；`node tests/tools/golden-diff.mjs`（156/156）。
- 两路并行、文件不相交：
  - **A 生产代码**：packages/{paths.js,writer/font.js,writer/zip.js,server/**,cli/project.js,cli/check.js}、scripts/pack-release.mjs、editor/app/project/{source,saver,export-service,icons,font-manager}.js、editor/app/export-image.js、editor/interaction/{design-panel,dialogs/base}.js、editor/components/button.js、editor/interaction/fields.js、editor/types/index.js。
  - **B 测试工具**：tests/lib/**、tests/tools/{golden-lib,parity-baseline}.mjs、tests/export/run.mjs、tests/regression/{parity-png,font-library,theme-library}.mjs、tests/runtime/run.mjs、tests/docs/run.mjs、tests/skill/{run,zip}.mjs、tests/e2e/render.mjs。
- 具体候选（按 survey，行号以当前 main 为准，动手前重新 grep）：
  - A 零引用：`paths.cleanTempParts`、`writer/font.skipReasonText`、`font-manager.registerRegistryFontFace`、`icons.getIconRegistrySync/queryIconEntries`、`components/button.{iconButton,buttonRow}`、`fields.{fieldHandlers,renderGroup}`、`types/index.contentEditorTypeIds`；未用 import（`cli/project.js` readFileSync、`design-panel.js` colorTokenUsage）。
  - A 合并：`source/saver` 的 `revisionOfSourceFiles` 逐字重复 → 留一份；`saver/export-image/design-panel` 的字节格式化 → 一份；`saver` 内 chip 构造重复 3 次 → 抽一份；`server/{themes,fonts}` 的 readJsonBody/sendJson/sendError/isLoopback → 新 `server/http-util.js`；`server/{api,export-image}` 的 readBody/JSON responder（语义不变才合并）；`server/runtime-node.writeAtomic` → `paths.atomicWriteFile`；`cli/project` 二次 yaml.load / `cli/check` 复用 `prepareProject`（形状允许才做）；`pack-release` 复用 `writer/zip.dosDateTime`（导出该函数）；`dialogs/base` 按钮复用 `components/button`；`design-panel` 下载复用 writer `downloadBlob`；`export-service` 图标解析复用 `icons.ensureIcon`。
  - B：ZIP 读取统一到 `tests/lib/unzip.js`（支持 store+deflate）；PNG 解码/paeth/chartRegion/edgeEnergy 统一到 `tests/tools/golden-lib.mjs` 并被 export/parity/render/parity-baseline 复用；`tests/lib/test-utils.js`（check/checkEq/throwsCode/withTempDir/walk）替换最重复的 5–8 个套件；删未用 import。
- 排除（后移）：`memorySource` 两份统一、sfnt 解析（model vs script）、字体就绪模型（cli vs provider）、Node host env 装配、scale/页码校验下沉、`types/load.js`/`adjustRowHeightsForRowChange`（规格 API 保留）、跨层 MIME 表统一。
- 红线：不改公共合同导出（contract 39/39 为证）；不删除仍被 barrel/测试/e2e/字符串引用的符号；不改行为；不新增依赖；不碰 golden/projects/fixtures/contract.json/run-all。
- 两路各自写 `handoff/W3a-a-worker.md` / `handoff/W3a-b-worker.md`（A/B/C，50–70 行），lead 按 A→B 合并。
