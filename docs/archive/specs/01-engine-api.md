# Spec A1 · engine-api：包级入口与契约冻结（W1）

> agent 代号 A1，分支 `feat/p0-api`。深读：`docs/specs/ref/integration-plan.md` §3.3 契约 4、§4.2 L0、附录 D.1。
> 前置阅读：`docs/specs/00-overview.md`（范围/红线/环境）。

## 目标

把 300+ 深路径收敛为 8 个稳定入口，机器可读契约 `contract.json` 落地，`CONTRACT_VERSION = 2`，并以契约测试 + dep-graph 新规则冻结。**功能零变化**——本 spec 不改任何既有运行时行为。

## 工单（按序执行，每项一个 commit）

### T1 包级 barrel（纯新增）

新增 4 个 barrel + 1 个根模块。导出名以 `docs/specs/ref/integration-plan.md` 附录 D.1 为准，逐一核对源文件真实导出名后再写（发现 D.1 与实际不符时，以实际为准并在 commit message 里注明差异）：

1. `packages/model/index.js`——导出 `parseDeck/serializeDeck/createDeck/createPage/nextElementId/deckSize/PAGE_WIDTH/PAGE_HEIGHT/PAGE_TYPES/SUPPORTED_SHAPES/registerType/getType/allTypes/ELEMENT_TYPES/resolveTheme/resolveColor/resolveFont/DEFAULT_THEME/DEFAULT_FONT/THEME_PALETTES/mergePaletteColors/validateDeck/registerRule/walkElements/collectImageSrcs/shapePaths/shapeMenuIcon/PRESET_SHAPES`；命名空间导出 `chart`（CHART_META/buildChartOption/resolveChartSpec 等）、`icons`、`fonts`、`bytes`（各自源文件的全部公开导出）。
2. `packages/renderer/index.js`——导出 `renderPage/autoGrowTexts/disposeChartInstances/iconThumb` + 命名空间 `renderers`（renderText/renderShape/renderLine/renderImage/renderIcon/renderTable/renderChart/pageBackground）。**不得**导入 `headless/`（Node 专用，浏览器会拉进 Node 代码）。
3. `packages/writer/index.js`——导出 `buildPptx/downloadPptx/downloadBlob/magicMatches/ZipWriter` + 命名空间 `xml`/`parts`/`text`。
4. `packages/cli/index.js`——导出 `runCheck/exportDeck/exportProject/runRender/runFonts/runIcons/runGallery`（把 `bin.js` 的编排暴露为可编程 API；实现不足处补薄包装函数，不复制逻辑）。
5. `packages/index.js`——`export const CONTRACT_VERSION = 2;` + 再导出 model/renderer/writer/server/cli 五个子入口的全部公开名（可直接 `export * from`）。**不得**导入 `editor/`（dep-graph 红线）。`./paths`、`./config` 的再导出由 A3 在 W2 追加（在本文件留一行注释 `// TODO(W2/A3): re-export paths/config`）。

**浏览器安全约束**：model/renderer/writer 三个 barrel 的传递闭包里不得出现 Node 专用模块（`node:*`、`fs`）。renderer barrel 不含 headless；model barrel 的字体/图标模块走注入式 fs，确认无需改动后仅引用。

### T2 `package.json`：`exports` map + `files` 收口

一次性写全（后续波次只落地文件、不改 map）：

```json
{
  "exports": {
    ".":              "./packages/index.js",
    "./model":        "./packages/model/index.js",
    "./renderer":     "./packages/renderer/index.js",
    "./writer":       "./packages/writer/index.js",
    "./server":       "./packages/server/index.js",
    "./cli":          "./packages/cli/index.js",
    "./editor":       "./editor/index.js",
    "./paths":        "./packages/paths.js",
    "./config":       "./packages/config.js",
    "./editor/index.html": "./editor/index.html",
    "./package.json": "./package.json",
    "./internal/*":   "./*"
  },
  "files": ["bin", "packages", "editor", "contract.json", "index.html", "README.md", "LICENSE", "assets/icons/registry.json", "assets/fonts/registry.json"]
}
```

注意：`./editor`、`./paths`、`./config` 指向的文件由 A2/A3/lead 随后落地；**本波次内不得 import 这三个入口**（契约测试也只断言已存在者）。`version` **不改**（W5 统一 bump 2.0.0）。若仓库无 `LICENSE` 文件，从 `files` 里去掉该项并在 commit message 注明。

### T3 `contract.json`（包根，机器可读契约清单）

```json
{
  "name": "open-pptd",
  "contractVersion": 2,
  "entries": {
    "model": "packages/model/index.js",
    "renderer": "packages/renderer/index.js",
    "writer": "packages/writer/index.js",
    "server": "packages/server/index.js",
    "cli": "packages/cli/index.js",
    "editor": "editor/index.js",
    "paths": "packages/paths.js",
    "config": "packages/config.js"
  },
  "bin": "./bin/open-pptd.js"
}
```

### T4 契约测试 `tests/contract/public-api.mjs`

- 断言：五个已存在 barrel 的导出名齐全（与 T1 清单逐一比对）；`CONTRACT_VERSION === 2`；`contract.json` 可解析、`entries` 与 `package.json` `exports` 的条目**一一对应**（防口径漂移）；`contract.json.entries` 指向的文件存在（editor/paths/config 三个文件落地前跳过并打印 SKIP，lead 在 W1.5/W2 后收紧为 FAIL）。
- 断言 model/renderer/writer barrel 在无 DOM / 无 Node 环境语义下可静态导入（用 `new Function` 或直接 import 后抽查函数类型即可，勿过度设计）。
- 新建 `tests/contract/README.md` 一段说明（运行方式：`node tests/contract/public-api.mjs`）。

### T5 dep-graph 加固（第一组，纯增量、立即为绿）

`tests/regression/dep-graph.mjs` 追加规则：**`packages/*/index.js` 与 `packages/index.js` barrel 不得导入 `editor/`**。编辑器侧深路径禁令由 lead 在 W1.5 追加（此刻不能加，编辑器尚未迁移）。保持既有四条不变。

### T6 `docs/embedding.md`

面向下游的契约文档：5 组契约中契约 4 的完整说明 + `contract.json` 用法（含 `pathToFileURL` 动态 import 示例与 `contractVersion` fail-fast 语义）+ 不变量（零依赖、从任意绝对路径 import 不触发依赖解析）+ 弃用策略（`./internal/*` 不保证稳定，3.0 移除）+ 其余 4 组契约的"规划中"占位（由后续 spec 落地后补全，本波次列出签名即可，签名抄附录 D.2–D.5 中不依赖本波次的部分——`createEditor`/`ProjectSource`/主题三组标"规划中，W1–W2 落地"）。

## 验收（完成前自测）

1. `node tests/contract/public-api.mjs` 绿。
2. `node tests/regression/dep-graph.mjs` 绿（含新规则）。
3. `node tests/run-all.mjs` 20/20 绿（package-integrity 因 `files` 改动必须过）。
4. `node -e "import('file:///C:/Users/法法/.pi/agent/skills/open-pptd/packages/index.js').then(m=>console.log(m.CONTRACT_VERSION))"` 输出 2（worktree 路径替换）。
5. `npm pack --dry-run` 不含任何 `*.ttf`、含两个 `registry.json` 与 `contract.json`。

## 禁触清单

`editor/**`、`packages/` 下既有文件（只新增 index.js）、`scripts/`、`.github/`、`SKILL.md`、`references/`、`assets/`、`tests/` 下既有文件（只新增 `tests/contract/`，dep-graph.mjs 除外）。
