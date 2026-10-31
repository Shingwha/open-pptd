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

待 W2 合并后补：W2 handoff、当前行号/文件、并行分组、稳定区、已知坑。
