# W2 · ProjectRuntime + ResourceProvider

> 分支/前置：W1 已合并；写入范围 `packages/runtime/**`、`tests/runtime/**`、Node adapter（CLI/server 侧）、必要契约测试。
> 本波只建共享运行时核心；不改编辑器 UI、不改 CLI 命令面、不重构导出。

## 目标

把“加载项目 → 解析 → 解析主题/字体/图片/图标 → 序列化”收进一个跨端 ProjectRuntime；Node/browser 只提供 source/provider adapter。编辑器/CLI/server 后续都通过它，禁止再写各自的 loader。

## 范围

- 新增 `packages/runtime/`（纯逻辑，无 node:/DOM）：
  - `loadProject(input,{source})`
  - `parseProject(files)`
  - `resolveProject(deck,{resources,themeLibrary?})`
  - `serializeProject(project,{mode:"snapshot"|"raw"})`
  - `checkProject(project,{resources,layout?})`
  - `ProjectSource`/`ProjectFiles`/`SourceFile`/`ResourceProvider` 类型与错误类型。
- Node adapter（CLI/server 侧 Node-only）：disk source、fs/registry provider、memory provider for tests；不在 runtime 包内引入 node:。
- 把当前 `packages/cli/export.js` 的 `loadProjectFiles`、`editor/app/project/loader/source` 的重复逻辑抽成 runtime 的调用；CLI `check` 内部先接 runtime（命令面不变）。
- 测试：memory/disk source；manifest/page/media；revision；缺失资源；serialize round-trip；checkProject 与现 check 输出对齐。

## 非目标

- 不移除 CLI 旧命令（W10）。
- 不改 editor UI（W7/W8）。
- 不改 renderer/writer/measure/table（W4/W5）。
- 不做主题/字体库（W6）。
- 不做 ExportService（W3）。

## 验收

1. 全量 `node tests/run-all.mjs` + dep-graph/contract 绿。
2. 新 runtime 测试通过；memory source round-trip；磁盘项目与现有 CLI check 输出一致。
3. 当前 `open-pptd check`/`export` 行为零变化（命令面未改）。
4. 写入范围外零 diff；无新增依赖；runtime 双端纯净（无 node:/DOM/fs）。

## 前置上下文

- 必读顺序：`ref/repo-map.md` → `ref/interfaces.md` §1–4（ProjectSource/ResourceProvider/ProjectRuntime）→ `ref/decisions.md` D2/D4 → `handoff/W1-worker.md`（只看 A/B 节）→ 本工单。
- 基线命令（开工先跑，贴真实输出）：
  - `node tests/tools/dump-formula-mml.mjs` → `KaTeX MathML 生成: 204/204`（fixtures 不入库，缺了公式回归会红）；
  - `node tests/run-all.mjs` → 26/26；`node tests/regression/dep-graph.mjs`；`node tests/contract/public-api.mjs`。
- 稳定区（已验收，勿重读/勿改）：`tests/golden/**`、`tests/projects/**`、`packages/{renderer,writer,layout,measure}/**`、`editor/app/**`（本波不动编辑器 loader）。
- lead 已在 main 更新 `tests/regression/dep-graph.mjs`：`runtime`/`export` 已加入双端包与边表（runtime → model|measure|layout；export → runtime|model|measure|layout|writer）。不要改该文件；如发现边表问题，报告 lead。
- 已知约束/坑：
  - 公式 fixture 生成物不入 git；不要提交 `tests/fixtures/formula/mml/**`。
  - 2.x `renderDeck({page:n>1})` 有单页竞态（W3 修），本波不要碰 renderer。
  - 包 barrel、`package.json`、`contract.json`、`tests/run-all.mjs` 由 lead 所有：本波不新增子路径导出；runtime 测试写成 `tests/runtime/run.mjs` 自跑，lead 合并时接入 run-all。
  - editor 只能深路径 import 到包级入口（dep-graph 规则），本波不改 editor。
  - 零新增依赖、零构建；runtime 全文件禁止 `node:`/`window.`/`document.`/`fs.`（dep-graph 会扫）。
  - 现有 CLI `check` 输出（人类文本/JSON/退出码）视为行为基线，必须逐字保持；`export` 产物字节不变。

## 本波实施口径（lead 已拍板）

1. **包结构**：`packages/runtime/` 纯逻辑（`index.js` + `source.js`/`parse.js`/`resolve.js`/`serialize.js`/`check.js`/`errors.js`，名字可微调），含内存 source/provider（测试与浏览器可复用）。Node 磁盘 source + fs/registry provider 放 `packages/server/runtime-node.js`（server 是 Node-only，CLI 可从 `../server/runtime-node.js` import）。
2. **本波接线范围**：`packages/cli/export.js` 的 `loadProjectFiles` 改为调用 runtime（Node disk source），`packages/cli/check.js` 内部改走 `checkProject`；命令面/输出不变。`editor/app/project/loader.js` 的迁移**后移 W8**（W7/W8 会重写编辑器装载），不要为 W2 改 editor。
3. **资源解析**：本波只做 provider 接口 + 能解析字体 registry/图标/图片文件的 Node 实现；主题库（ThemeStore）与用户字体库后移 W6，不做。
4. **serialize**：`snapshot` 用 model 序列化 round-trip；`raw` 使用 source 提供的原始文本/字节（Node 才有），浏览器路径不实现。
5. **测试**：`tests/runtime/run.mjs`（memory source：manifest/page/media/revision；serialize round-trip；checkProject 与 CLI check 对齐；错误码）；磁盘 fixture 用 `tests/projects/text` 之类现有项目，不新增项目。
