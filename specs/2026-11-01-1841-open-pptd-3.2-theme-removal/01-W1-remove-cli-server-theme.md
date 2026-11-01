# W1 · 删除 CLI / Server / Export 的主题库面

> 分支 `feat/3.2-w1-cli-server-theme-removal`（lead 创建）；与 W2 并行，合并顺序 W1 先。
> 最高约束：只删外部命令/服务面的主题库，不改 deck theme 结构、不改 model/editor、不改渲染。

## 目标

删掉主题库在 **CLI、server、export、paths、runtime inventory** 的所有入口与输出；`assets themes`、`build --theme`、`/api/themes`、theme store、doctor 主题计数不再存在。保留 `assets fonts/skill`、`/api/fonts`、五命令 CLI。仓库在 W1 合并后仍全绿。

## 前置上下文

- 必读：`specs/2026-11-01-1841-open-pptd-3.2-theme-removal/ref/repo-map.md` → `ref/interfaces.md` → 本工单。
- 基线命令（开工先跑，贴真实输出）：
  - `node tests/run-all.mjs` → 期望 39/39
  - `node tests/cli/surface.mjs` → 期望 72/72
  - `node bin/open-pptd.js doctor --json | head -c 400`
  - `node bin/open-pptd.js assets list --json | head -c 400`
- 稳定区（勿重读/勿改）：`packages/model/**`、`editor/**`、`examples/**`、`tests/golden/**`、`skill/**`、`contract.json`、`README*.md`、`CHANGELOG.md`。
- 已知约束：W2 并行会删除 `packages/model/theme-library.js` 与 `THEME_PALETTES`；W1 只负责移除 CLI/server/export 对它们的引用，不修改 model。W1 合并后 W2 才合并。

## 工单（按序执行，每项一个 commit）

### T1 CLI assets / help / doctor 去主题

只允许改：`packages/cli/assets.js`、`packages/cli/bin.js`、`packages/cli/doctor.js`。

- `packages/cli/assets.js`
  - 删除 `assetsThemes` 整个函数及 `sub === "themes"` 分发。
  - 删除对 `createFileThemeStore`、`applyTheme`、`listBuiltinThemes` 等主题库 import（按实际 import 清）。
  - `collectListFacts()`：删除 themes 读取；返回对象删除 `themes` 字段；`assetsList` 人类输出删除 `themes` 行。
  - 注释里 `themes apply` 等描述删除。
  - 保留 `assets fonts/skill/list/sync/clean` 行为不变。
- `packages/cli/bin.js`
  - `--help` 删除 `pptx: [--theme <id>]` 与 `assets themes ...` 两行。
  - 顶部注释 `assets (fonts/icons/themes/skill)` → `assets (fonts/icons/skill)`。
- `packages/cli/doctor.js`
  - 删除 `listBuiltinThemes`/`BUILTIN_THEME_PREFIX` import、`userThemeCount()`、`themes` 事实/路径/输出。
  - `doctor --json` 不再有 `assets.themes`、`paths.themes`；人类输出不再有“主题 N 内置/N 我的”。
  - 保留 fonts/icons/png 等事实。

验证：
- `node bin/open-pptd.js assets list --json` 单行 JSON，无 `themes`。
- `node bin/open-pptd.js assets themes list` → exit 1（未知 assets 子命令），stdout 空/人类 stderr。
- `node bin/open-pptd.js doctor --json` 无 `themes`。
- `node bin/open-pptd.js --help` 不含 `assets themes` / `--theme`。

### T2 build / export 去主题覆盖

只允许改：`packages/cli/build.js`、`packages/export/index.js`。

- `packages/cli/build.js`
  - 删除 `createFileThemeStore`、`applyTheme` import。
  - 删除 `themeSnapshot`、`themeOverride`、主题库读取/应用块；`runExport` 不再传 `theme`。
  - `--theme` 从 `VALUED` 删除；在 `runBuild` 入口显式拒绝 `--theme` / `--theme=...`：
    `throw new CliError("ERR_INVALID_OPTION", "build --theme 已移除：颜色请直接修改 deck.theme.colors")`
  - 删除 JSDoc `options.theme`；`printHuman`/`buildJson` 删除 themeOverride 字段/输出；`--theme` 与 png/bundle 的非法组合检查删除或简化（现在统一“已移除”）。
- `packages/export/index.js`
  - 删除 `THEME_PALETTES`、`mergePaletteColors` import 与 `applyThemeOverride`。
  - `exportProject` 若 `options.theme != null` → `throw new ExportError(EXPORT_ERRORS.INVALID_OPTION, "theme 覆盖已移除（主题库已删除）")`；不要静默忽略。
  - 删除 JSDoc `options.theme`。

验证：
- `node bin/open-pptd.js build tests/projects/table/deck.pptd --format pptx --theme tech -o <tmp>` → exit 1，JSON/人类错误含“已移除”。
- `node tests/export/run.mjs` 全绿。

### T3 server / paths / runtime inventory 去主题

只允许改：`packages/server/index.js`、`packages/server/runtime-node.js`、`packages/runtime/provider.js`、`packages/paths.js`；删除 `packages/server/themes.js`、`packages/server/theme-store.js`。

- 删除 `packages/server/themes.js`、`packages/server/theme-store.js`（`git rm`）。
- `packages/server/index.js`：删除 `handleThemes` / `createFileThemeStore` import/export、`themeStore` 选项、`/api/themes` 路由；`createServer(options)` 不再接受 `themeStore`。
- `packages/paths.js`：删除 `themes` 路径与 `ensureHome` 的目录项。
- `packages/server/runtime-node.js`、`packages/runtime/provider.js`：`inventory()` 返回值删除 `themes: []`。
- 不改 `/api/fonts`、save、SSE、静态服务。

验证：
- `node tests/regression/font-library.mjs` 全绿（inventory 不依赖 themes）。
- `node tests/regression/resource-paths.mjs` 全绿。
- 启服抽验：`/api/themes` 返回 404（不是 500/崩溃）；`/api/fonts` 正常。

### T4 测试与命令面同步

只允许改：`tests/cli/surface.mjs`。

- 删除 `assets themes list` 三段断言。
- `assets list` 断言从 `home/themes` 改为 `home/fonts`（或 `home` + `fonts` + `icons`）。
- 增加一条：`assets themes` exit 1 且 stderr 有未知子命令提示（不要求特定文案）。
- 增加一条：`build ... --theme tech` exit 1，错误含“已移除”（用现有临时项目，不新增套件）。
- 不改 `OLD` 列表语义（fonts/icons 是旧顶层命令，仍应提示删除）。

验证：`node tests/cli/surface.mjs` 全绿（数量允许因删/增断言变化，报告真实数）。

## 验收

1. `node tests/run-all.mjs` 全绿（W1 不改 model，主题库测试仍应通过；报告真实 N/N）。
2. `node tests/cli/surface.mjs` 全绿；`doctor/assets` 无 themes；`build --theme` 明确失败。
3. `node tests/export/run.mjs`、`node tests/regression/{font-library,resource-paths}.mjs` 全绿。
4. `git grep -n "assets themes\|build --theme\|/api/themes\|createFileThemeStore\|handleThemes" packages/cli packages/server packages/export packages/paths.js packages/runtime/provider.js` 只应命中“已移除”错误文案/测试断言，不应有实现引用。
5. 写入范围外零 diff；handoff 文件是唯一例外。

## 禁触清单

`packages/model/**`、`editor/**`、`examples/**`、`tests/golden/**`、`tests/e2e/**`、`tests/regression/theme-*.mjs`、`tests/contract/**`、`skill/**`、`README*.md`、`CHANGELOG.md`、`contract.json`、`package.json`、`docs/**`。

## 交接包

完成后在分支最后一个 commit 写 `specs/2026-11-01-1841-open-pptd-3.2-theme-removal/handoff/W1-worker.md`（A/B/C，50–70 行）：删除清单、保留清单、错误码/文案、测试真实数、与 spec 偏差、W2 合并注意（model 删除后 CLI 已无引用）。

## 最终报告

工单状态表 / commit 清单（hash + message）/ 自测真实结论 / 偏差与取舍 / 交接校验 / 探索审计（handoff 外读了哪些文件、为什么）/ 未决问题。
