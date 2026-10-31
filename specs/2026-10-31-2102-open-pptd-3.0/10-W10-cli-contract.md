# W10 · CLI 5 命令 + Contract 3.0

> 分支/前置：W3、W9 已合并；写入范围 `packages/cli/**`、`bin/open-pptd.js`、`contract.json`、`package.json`、所有 barrel（lead 所有）、`tests/cli/**`、`tests/contract/**`、`tests/regression/dep-graph.mjs`、`README/CHANGELOG`（lead）。
> 本波是破坏性接口收口：没有兼容层。docs/embedding 删除在 W13；本波先改所有代码/测试引用。

## 目标

- CLI 收敛为 `open/build/check/assets/doctor`；删 serve/export/export-project/render/ensure/paths/gallery/fonts/icons 及别名。
- `open` 自动识别 manifest、Home/blank、detach/json/stop、浏览器默认；状态按项目/端口；fail-fast。
- `build` 三格式、full check、fetch/offline/strict/json、font embed、PNG 浏览器要求、bundle snapshot/raw。
- `check` 只读/JSON/strict/资源摘要；`assets` 主题/字体/图标/内置；`doctor` 路径/PNG 能力。
- `CONTRACT_VERSION=3`；contract.json/exports 加 runtime/export；删 `./internal/*`、旧深路径、旧 API/选项/shim。
- 根入口改为双端核心；server/cli 子入口；删除 renderPage/autoGrowTexts 旧兼容面。
- 更新 contract/dep-graph/CLI surface 测试、README/CHANGELOG 迁移表；删除对 docs/embedding 的代码注释（docs 文件 W13 删）。

## 范围

- packages/cli/bin.js 重写 dispatch/usage；新 open/build/check/assets/doctor；删旧业务文件（ensure/fonts/icons/gallery 等按需合并）。
- package.json exports/contract.json；barrels；contract tests；dep-graph 边表。
- README/CHANGELOG（lead）；`docs/release-workflow` 在 W13。
- tests/cli/surface；旧命令消失；JSON 单行；迁移映射。

## 非目标

- 不做 skill（W11）。
- 不做 docs 最终删除/README 完整改版（W13；最小迁移表可本波）。
- 不恢复兼容别名。
- 不改 editor 功能（W7-W9）。

## 验收

1. 全量回归 + dep-graph/contract 绿。
2. `open-pptd --help` 只 5 命令；旧命令不存在/非零；无别名。
3. open/build/check/assets/doctor 的 JSON/退出码/错误符合 `ref/cli.md`。
4. contract 3.0：exports/contract.json/barrel 一致；无 `./internal/*`/旧深路径；旧 API/shim 无残留。
5. CLI 迁移表/README/CHANGELOG 更新；代码/测试无 docs/embedding 引用（embedding 文件未删，引用已改）。
6. 无新增依赖；写入范围外零 diff（lead 文件例外）。

## 前置上下文

- 必读顺序：`ref/cli.md`（全文）→ `ref/interfaces.md` §1/§11/§12 → `ref/decisions.md` D2/D4 → `handoff/W2-worker.md`、`W3-worker.md`、`W9-worker.md` → 本工单。
- 基线命令（开工先跑，贴真实输出）：`node tests/run-all.mjs` → 36/36；`node tests/e2e/{render,editor-minimal,preview-shell}.mjs`；dep-graph；contract；`golden-diff`。
- 稳定区（勿重读/勿改行为）：`packages/{model,measure,layout,writer,runtime,export}/**`（仅可加薄 API/测试所需导出）、`editor/**` 功能、`tests/golden/**`、`tests/projects/**`。
- 现有事实（lead 已核实）：
  - CLI 文件：`bin.js` + `{assets,check,doctor,download,ensure,export,fonts,gallery,icons,render,resource-status,font-file}.js`；旧命令 serve/export/export-project/render/ensure/paths/gallery/fonts/icons。
  - `tests/run-all.mjs:36` 仍用 `open-pptd export` 导出项目；`tests/README.md`、README/README.zh-CN 用 `serve`；`.github/workflows/pages.yml:55` 用 `gallery scan`；`tests/regression/resource-paths.mjs`、`tests/runtime/run.mjs` 调 `check`（保留）。
  - `contract.json` version 2；`packages/index.js` 再导出 server/cli 与 `CONTRACT_VERSION=2`；`packages/cli/index.js` 导出旧 API；`packages/renderer/index.js` 仍导出 `renderPage`/`autoGrowTexts`。
  - W6 已有 `assets themes/fonts` 子命令；W9 已有 ExportService/revision；W8 已有 createPreview/createEditor。
- 已知坑：破坏性收口，旧命令必须非零退出并给迁移提示；`run-all` 的项目导出步骤必须同步改；PPTX 字节非确定（结构事实验收）；Windows 路径/引号；`tests/tools/ui-shots.mjs` CDP 9247 不要并行。

## 本波实施口径（lead 已拍板）

1. **CLI 结构**：`packages/cli/bin.js` 只分发 `open/build/check/assets/doctor`；新建 `open.js`、`build.js`；重写 `check.js`；扩展 `assets.js`、`doctor.js`。删除 `ensure.js`、`fonts.js`、`icons.js`、`gallery.js`、`export.js`、`render.js`（能力迁入 build/open/check/assets）。未知命令 → stderr 迁移提示 + exit 1；`--help` 只 5 命令。人类文本走 stderr，`--json` 只 stdout 单行。
2. **open**：无参数 Home；`<dir>`/`--deck` 自动识别唯一 `.pptd`（缺失/多个 fail-fast，列出候选）；`--blank`；`--port`；`--detach/--json/--stop/--open/--no-open`。实例表 `~/.open-pptd/state/instances.json`（url/port/pid/project/deck/startedAt）；`--stop` 按当前项目匹配，先 `/api/ping` + pid 存活校验，不误杀；`--all` 可选。URL 用 `/editor/?deck=...`（单壳）。
3. **build**：`--format pptx|png|bundle`（默认 pptx）；全部先 full `checkProject`（error 阻断/warning 软/`--strict` 阻断）；`--fetch/--offline` 互斥、默认不 fetch；`--json` 单行随机型返回 `outPath/pages/embedded/missing/warnings`；`--theme <id>` 用 ThemeStore 快照应用（JSON `themeOverride`，不改项目）；pptx 字体全局 embed/subset；png `--page/--scale/--browser/--timeout`，无浏览器 `ERR_RENDER_BACKEND` 提示；bundle 默认 snapshot、`--raw` Node 磁盘原样。全部经 W9 ExportService（不重写 writer/zip）。
4. **check**：只读；runtime checkProject + layout/资源摘要（fonts ready/fetchable/missing/system、icons known/unknown、media ready/missing）；`--json` 单行；`--strict` warning→exit 1；吸收旧 `fonts check`，不下载。
5. **assets**：保留 `list/sync/clean`（sync 仍是 release zip，`--from` 离线，不碰用户库），W6 的 `themes/fonts` 子命令补 JSON/错误；`themes apply <id> <deck.pptd> [--dry-run]` 写 deck.theme（applyTheme 替换+保留引用），原子写；`fonts import` 支持本地/URL；旧 `fonts/icons` 命令删除。
6. **doctor**：吸收 paths（全部路径/版本/计数），加 Chrome/Edge PNG 能力探测；`--json` 单行；关键失败 exit 1，资源不全 exit 0 + 提示。
7. **Contract 3.0**：`CONTRACT_VERSION=3`、`contract.json.contractVersion=3`；`exports` 增加 `./runtime`、`./export`，删除 `./internal/*`；根入口只导出双端核心（model/renderer/writer/runtime/export/paths/config/measure/layout），server/cli 仅子入口；`packages/cli/index.js` 导出新 API（`runOpen/runBuild/runCheck/runAssets/runDoctor`，内部可用小写函数），删除 exportDeck/exportProject/renderDeck/runFonts/runIcons/runEnsure/runGallery；renderer barrel 删除 `renderPage`/`autoGrowTexts`（同步改调用方/测试）；editor barrel 导出 `createEditor/createPreview`。
8. **测试/文档**：新增 `tests/cli/surface.mjs`（help 5 命令/旧命令非零/JSON 单行/open 自动识别 fail-fast/build 三格式（tmp）/check strict/assets/doctor）；更新 `tests/contract/public-api.mjs`、`tests/regression/dep-graph.mjs`、`tests/run-all.mjs`（项目导出改 `build --format pptx`，接入 cli surface）、`tests/README.md`、README/README.zh-CN 迁移表、CHANGELOG；`.github/workflows/pages.yml` 的 `gallery scan` 改为 `node scripts/gen-gallery-manifest.mjs`（新增薄脚本，复用 gallery.js，不保留用户命令）；删除代码/测试中指向 docs/embedding 的注释（文件 W13 删）。
9. **允许 lead-owned 文件**：本波可改 `package.json`、`contract.json`、所有 barrel、`tests/run-all.mjs`、`tests/contract/**`、`tests/regression/dep-graph.mjs`、README/CHANGELOG、`.github/workflows/pages.yml`、`scripts/gen-gallery-manifest.mjs`；其余仍按红线。contract 变化必须在 handoff 列出精确导出面。
10. **不引入兼容**：旧命令/别名/深路径/shim 全部删除；旧 deck 数据仍可读；`assets themes apply`/`fonts import` 为显式写操作。
