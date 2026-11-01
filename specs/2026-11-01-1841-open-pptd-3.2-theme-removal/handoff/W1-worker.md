# W1 worker handoff · CLI / Server / Export 主题库面删除

> 分支 `feat/3.2-w1-cli-server-theme-removal`，基线 `f2d877b`（main）。W1 合并顺序先于 W2。

## A. 交接摘要

**T1 完成**：`assets themes` 子命令、`assets list --json` 的 `themes` 字段与人类输出行、`doctor` 的主题计数/路径、`--help` 的 `--theme` 与 `assets themes` 行全部删除。字体/图标/skill 行为未变。

**T2 完成**：`build --theme` / `--theme=...` 在 `runBuild` 入口显式拒绝（`ERR_INVALID_OPTION`，文案含“已移除”）；`buildDeck` 不再读取主题库；`exportProject` 收到 `options.theme != null` 抛 `ExportError(INVALID_OPTION, "theme 覆盖已移除（主题库已删除）")`。

**T3 完成（1 项延后）**：删除 `packages/server/themes.js`；`createServer` 不再接受/创建 `themeStore`，`/api/themes` 路由、barrel 导出、`paths.themes`、`ensureHome` 的 themes 目录、两处 `inventory().themes` 全部移除。`/api/fonts`、save、SSE、静态服务未动。

**T4 完成**：`tests/cli/surface.mjs` 删除 2 条主题断言，新增 `assets themes` 未知子命令 + `build --theme` 已移除各 1 条；`OLD` 列表语义未动。

**未完成/待裁决**：`packages/server/theme-store.js` 未删除（见 C1）。

## B. 关键事实

### B1 删除清单

- `packages/cli/assets.js`：`assetsThemes` 及分发、`yaml/applyTheme/createFileThemeStore` import、`CARD_KEYS/printPreserved/loadDeckForTheme/replaceThemeBlock/writeDeckTheme`、list 的 themes 读取/字段/行。
- `packages/cli/bin.js`：help 两行、顶部注释 `themes`。
- `packages/cli/doctor.js`：`listBuiltinThemes/BUILTIN_THEME_PREFIX` import、`userThemeCount`、`assets.themes`、`paths.themes`、人类输出主题段。
- `packages/cli/build.js`：主题库 import、`themeSnapshot/themeOverride`、`VALUED` 的 `--theme`、JSDoc/JSON/人类输出字段。
- `packages/export/index.js`：`THEME_PALETTES/mergePaletteColors` import、`applyThemeOverride`。
- `packages/server/index.js`：`handleThemes/createFileThemeStore/themeStorePaths` import+export、`themeStore` 选项、`/api/themes` 路由。
- `packages/paths.js`：`paths.themes`、`ensureHome` 目录项。
- `packages/server/runtime-node.js`、`packages/runtime/provider.js`：`inventory().themes` 与 JSDoc。
- `packages/server/themes.js`（git rm，103 行）。

### B2 保留清单

- 五命令 `open/build/check/assets/doctor`；`assets list|sync|clean`、`assets fonts`、`assets skill install`；`/api/fonts`、save/SSE/静态服务；`packages/model/**` 与 deck `theme {colors,textStyles,tableStyles}` 原样。

### B3 错误码 / 文案

- `build --theme`：`ERR_INVALID_OPTION` → `build --theme 已移除：颜色请直接修改 deck.theme.colors`（exit 1）。
- `exportProject({theme})`：`EXPORT_ERRORS.INVALID_OPTION` → `theme 覆盖已移除（主题库已删除）`。
- `assets themes ...`：无专属 code，bin 输出 `✗ assets 子命令无效` + usage，exit 1。
- `ERR_THEME_NOT_FOUND` 已无产生方；model 的 `ERR_THEME_INVALID` 未触碰。

### B4 测试真实数（本分支实测）

- `node tests/run-all.mjs`：**39/39** ✅（含 theme-library；首次跑前需 `npm run test:fixtures` 生成未入库的 KaTeX fixture，属环境准备）。
- `node tests/cli/surface.mjs`：**73/73** ✅（72 − 2 + 3，净 +1）。
- `node tests/export/run.mjs`：**56/56** ✅；`font-library`：**63/63** ✅；`resource-paths`：**全部通过** ✅。
- 抽验：`assets list --json` 单行无 `themes`；`assets themes list` exit 1；`doctor --json` 无 `themes`；`--help` 无 `theme`；`/api/themes` 404、`/api/fonts` 200、`/api/ping` 200；新 `OPEN_PPTD_HOME` 下 `ensureHome` 不建 `themes/`。

### B5 与 spec 的偏差

1. `packages/server/theme-store.js` 保留（C1）。
2. W1 未跑 e2e/golden（门禁不含；e2e Design 面板仍引用 `/api/themes`，由 W2/W3 处理）。

## C. 后续注意

**C1（最高优先）theme-store.js 残留**：`tests/regression/theme-library.mjs:24` 静态 import `createFileThemeStore`，该测试 W1 禁触、W2 T3 才删除；物理删除会使 W1 run-all 变 38/39 且 W2 基线失配。当前产品代码对 `theme-store.js` 零引用（barrel 导出已移除），验收 grep 仅命中该文件第 30 行。建议 lead 在 W2 删除测试后补一个清理 commit（`packages/server/**` 属 W1，W2 无写权限）；若 lead 改为授权 W1 同步删测试/run-all 行，需注意与 W2 并行分支的 modify/delete 冲突。

**C2 W2 合并后**：CLI/server/export/paths/runtime 已不引用 `theme-library.js`、`THEME_PALETTES`、`mergePaletteColors`、`applyTheme`；W2 删 model 导出不会产生 CLI 断链。run-all 套件数 39→38 由 W2 完成。

**C3 W3/编辑器**：`editor/interaction/design-panel.js:29` 仍有 `API.themes = "/api/themes"`；W2 删除该常量前，服务端已 404（非 500），不会崩溃。

**C4 验证命令**：`node tests/run-all.mjs`、`node tests/cli/surface.mjs`、`node tests/export/run.mjs`、`node tests/regression/{font-library,resource-paths}.mjs`。
