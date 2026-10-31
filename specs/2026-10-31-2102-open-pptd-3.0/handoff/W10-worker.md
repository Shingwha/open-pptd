# W10 handoff · CLI 5 命令 + Contract 3.0
> 分支 `feat/3.0-w10-cli`，起点 `main f13f334`（W1–W9 已合并）；Windows 10.0.28120 + Git Bash + Node v24.21.0；零新增依赖。
> 破坏性收口：旧 CLI/API/深路径/`./internal/*` 不保留任何兼容层；旧 deck 数据仍可读。

## A. 自测真实输出
```text
# 开工基线（f13f334）
dump-formula 204/204 | run-all 36/36 | render 9/9 | editor-minimal 21/21 | preview-shell 23/23
dep-graph ✓ | contract ✓ | golden-diff 156/156 字节一致
# 完工（最终代码）
$ node tests/tools/dump-formula-mml.mjs   → KaTeX MathML 生成: 204/204
$ node tests/run-all.mjs                  → 结果: 37/37 通过 ✅（含新增 CLI surface）
$ node tests/e2e/render.mjs               → render 冒烟测试 9/9 通过（timeouts=0）
$ node tests/e2e/editor-minimal.mjs       → 21/21 通过
$ node tests/e2e/preview-shell.mjs        → 23/23 通过
$ node tests/regression/dep-graph.mjs     → 扫描 230 文件 / 779 import（barrel 10）✓
$ node tests/contract/public-api.mjs      → 结果: 契约通过 ✅
$ node tests/tools/golden-diff.mjs        → 156 页字节一致，0 未登记漂移
$ node tests/cli/surface.mjs              → 结果: 72/72 通过 ✅
$ node tests/regression/parity-png.mjs    → 22/22 通过；browser-export 15/15 通过
旧命令抽验（stdout 空）：serve/export/export-project/render/ensure/paths/gallery/fonts/icons 全部 exit=1，
  stderr 首行形如 `✗ 命令 "export" 在 3.0 已删除，请改用: open-pptd build --format pptx`
JSON 单行：build --json stdout=1 行 / stderr=15 行；check --json 1 行；doctor --json 1 行。
$ build chart --format pptx -o tmp → 837227 B（与 2.x 基线一致）；bundle snapshot 生效；png 单页 27KB。
$ open tests/projects/text --detach --json →
  {"url":"http://127.0.0.1:55173/editor/?deck=project/deck.pptd","port":55173,"pid":…,"project":"…","deck":"…"}
$ open --blank --detach --json → url 以 `?blank=1` 结尾；open … --stop 后 instances.json 为 []。
$ build … --format png --browser <不存在> → {"ok":false,"error":{"code":"ERR_RENDER_BACKEND",…}} exit 1
```
## B. 实现、导出面、删除、偏差与审计
**Contract 3.0 精确导出面**：`CONTRACT_VERSION=3`、`contract.json.contractVersion=3`。
`contract.json.entries` = model/renderer/writer/**runtime**/**export**/server/cli/editor/paths/config/measure/layout（12 条）；
`package.json.exports` = `.` + 同名 12 子入口 + `./editor/index.html` + `./package.json`；**删除 `./internal/*`**。
根 `.` 只 `export *` model/renderer/writer/runtime/export/paths/config + `export * as measure` + `export {default as layout}`，
不再导出 server/cli（抽查 `createServer/startServer/run*` 均 undefined；根共 159 名）。`packages/cli/index.js` 仅 5 名：
`runOpen/runBuild/runCheck/runAssets/runDoctor`；renderer barrel 去掉 `renderPage/autoGrowTexts`（`paintPage/disposeChartInstances/iconThumb + renderers`）；
editor barrel 仍 `createEditor/createPreview`（契约测试新增 createPreview 源码断言）。
**CLI 5 命令**：`bin.js` 只分发，未知/旧命令 stderr 迁移提示 + exit 1；`--help` 只列 5 命令。
- `open [dir] [--deck] [--port] [--detach] [--json] [--open|--no-open] [--stop] [--all] [--blank]`；
  无参 Home；`<dir>` 先 `deck.pptd` 再唯一 `*.pptd`（0/多候选 fail-fast 并列候选）；实例表
  `~/.open-pptd/state/instances.json`（url/port/pid/project/deck/startedAt），`--stop` 先 pid 存活 + `/api/ping` 才 kill。
- `build <manifest> --format pptx|png|bundle [-o] [--fetch|--offline] [--strict] [--json]`；
  pptx `--theme/--no-embed-fonts/--full-fonts`，png `--page/--scale/--browser/--timeout`，bundle `--raw`；
  全部经 ExportService 默认 full checkProject；JSON=`{ok,format,outPath,checked,fetched,embedded,skipped,missing,warnings,pages}`（png 加 renderedPages/scale，主题加 themeOverride）。
- `check <manifest> [--json] [--strict]`：只读；JSON=`{ok,errors,warnings,perPage,resources,summary}`；strict warning→1。
- `assets list|sync|clean|themes list|import|export|delete|apply|fonts list|import|remove`，全部 `--json`；
  `themes apply <id> <deck.pptd> [--dry-run]` 用 `applyTheme`（替换 + 保留引用）并原子只替换 manifest 的 `theme:` 块。
- `doctor [--json]`：吸收 paths（全部路径/resourceRoots/configValues）+ 字体/图标/主题/用户字体计数 + Chrome/Edge PNG 能力；
  node<18/home 不可写等关键失败 exit 1，PATH/资源不全 exit 0 + 提示。
**旧→新**：serve→open；export→build --format pptx；export-project→build --format bundle [--raw]；
render→build --format png；ensure→check / build --fetch；paths→doctor；gallery→open(Home)/scripts/gen-gallery-manifest.mjs；
fonts/icons→assets fonts / assets sync。
**删除文件**：`packages/cli/{ensure,fonts,icons,gallery,export,render}.js`（grep 无残留引用）。
**新增文件**：`packages/cli/{open,build,project,resources,errors}.js`、`editor/app/paint-page.js`、`tests/cli/surface.mjs`、`scripts/gen-gallery-manifest.mjs`。
**偏差（需 lead 知悉）**：① 阶段 commit：P1+P2 合并为一个代码 commit（cli barrel 新 API 与 bin/删旧文件互相依赖，无法单独可运行），
P3 拆成「代码+测试」与「docs/pages」两个 commit（见 C）。② 人类文本一律 stderr（2.x 为 stdout），check 改为按页分组；
③ `open --stop` 无目录时按 cwd 匹配，Home/blank 实例需 `--all`；④ `assets themes apply` 仍接受 `--deck`（现有选项，非命令别名），
`themes remove` 别名删除；`themes export` 无输出路径时仍把主题 JSON 写 stdout（数据非人类文本）。⑤ `build png` 的 full check 含几何
warning（软失败）；旧 `render` 的 `--page/--scale` 语义不变。⑥ headless `packages/renderer/headless/shoot.js#renderDeck` 作为
内部实现保留（e2e/tools 使用），CLI 程序化 `renderDeck` 已删除。⑦ `package.json.version` 未改（仍 2.0.2，发版归 W13/W14）。
**探索审计（只读）**：specs 本组 ref/cli、interfaces §1/§11/§12、decisions D2/D4、handoff W2/W3/W9；packages/cli 全部旧文件、
paths/config、runtime/{index,check,serialize}、export/{index,pptx,bundle,png,report}、server/{index,runtime-node,theme-store,
font-library,gallery}、renderer/{index,page,headless/{browser,backend}}、model/{theme-library,validate,font-registry}、
writer/{index,font}、editor/{index,main,editor/preview,app/view/{view,thumbnails},app/{present,shot,render-backend-browser}}；
tests/{run-all,contract/public-api,regression/{resource-paths,validate,layout,measure-consistency,dep-graph},runtime/run,e2e/*,lib/run}；
README/README.zh-CN/CHANGELOG/tests/README/pages.yml/scripts。无全仓重读，未触碰主检出与其他 worktree，未跑 ui-shots（CDP 9247）。
**未决**：docs/embedding.md 文件本体 W13 删（代码/测试引用已清零）；`open --json` 前台按设计持续服务（agent 用 `--detach --json`）。
## C. 文件 / commit 指针
| commit | message |
|---|---|
| `d320a6d` | feat(cli)!: 收口契约 3.0 与 CLI 5 命令面（代码 + 契约/依赖图/CLI surface 测试） |
| `26e8a11` | docs(cli): 5 命令迁移表 + Pages 画廊脚本 + tests/README |
| （本文件） | docs(w10): 写 W10 交接 |
新增：`packages/cli/{open,build,project,resources,errors}.js`、`editor/app/paint-page.js`、`tests/cli/surface.mjs`、`scripts/gen-gallery-manifest.mjs`。
删除：`packages/cli/{ensure,fonts,icons,gallery,export,render}.js`。
修改（lead-owned 白名单内）：`package.json`、`contract.json`、`packages/{index,renderer/index,renderer/page,cli/index}.js`、
`tests/{run-all,contract/**,regression/dep-graph}`、README/README.zh-CN/CHANGELOG、`.github/workflows/pages.yml`。
