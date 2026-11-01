# W2 · 删除主题库核心与编辑器主题库 UI，保留颜色编辑

> 分支 `feat/3.2-w2-theme-library-editor-colors`（lead 创建）；与 W1 并行，合并顺序 W1→W2。
> 最高约束：deck theme 结构不变；只删主题库/主题切换，保留 `theme.colors` 编辑；不改渲染结果。

## 目标

删除 `packages/model/theme-library.js` 的主题库模型（内置/用户/applyTheme/ThemeFile/store）、`THEME_PALETTES`、`mergePaletteColors`、字符串预设；把颜色 token 工具裁剪到 `packages/model/color-tokens.js`。编辑器 Design 面板从“主题库 + 颜色令牌 + 字体 + 外观”改为“颜色 + 字体 + 外观”：无主题卡、无保存/导入/导出、无当前主题匹配；颜色编辑只写 `theme.colors`，`textStyles/tableStyles` 原样保留。W2 不实现实时/撤销缩略图全量刷新（W3）。

## 前置上下文

- 必读：`ref/repo-map.md` → `ref/interfaces.md` → 本工单。
- 基线命令（开工先跑，贴真实输出）：
  - `node tests/run-all.mjs` → 期望 39/39
  - `node tests/e2e/editor-minimal.mjs` → 期望 21/21
  - `node tests/e2e/incremental-load.mjs` → 期望 5/5
  - `node tests/tools/golden-diff.mjs` → 期望 142/142
- 稳定区（勿改）：`packages/cli/**`、`packages/server/**`、`packages/export/**`、`packages/paths.js`（W1 负责）；`examples/**`、`tests/golden/**`、`README*.md`、`CHANGELOG.md`（W3 负责）；公式/vendor。
- 已知约束：W1 并行移除 CLI/server/export 的 theme-library 引用；W2 不得依赖 W1 的改动。W2 合并后 W1 已不在 main 引用 theme-library。
- 现有设计面板硬断言在 `tests/e2e/editor-minimal.mjs` §7/§8；必须同步。

## 工单（按序执行，每项一个 commit）

### T1 颜色 token 核心 + 删除 theme-library

只允许改：`packages/model/color-tokens.js`（新）、`packages/model/theme-library.js`（删除）、`packages/model/theme.js`、`packages/model/theme-presets.js`、`packages/model/index.js`。

- 新建 `packages/model/color-tokens.js`，从 `theme-library.js` 保留：
  - `STANDARD_COLOR_KEYS`（16 个，固定顺序）
  - `ThemeError`（code `ERR_THEME_INVALID`）
  - `listColorTokens(theme)`（标准在前、自定义按 insertion order）
  - `setColorToken(theme, key, value)`（纯函数；保留 `textStyles/tableStyles`；key/value 校验同现状）
  - `removeColorToken(theme, key, { deck })`（引用阻止；返回 `{blocked,usage,theme}`）
  - `colorTokenUsage(deck, token)`（支持 `$` 前缀）
  - 删除 `collectThemeReferences`（只被 applyTheme 使用）
- 删除 `packages/model/theme-library.js`。
- `theme.js`：
  - 删除 `THEME_PALETTES` import/export、`mergePaletteColors`、`normalizeThemeFile` 相关注释。
  - `normalizeTheme(input)` 字符串分支改为：`console.warn("[theme] 3.2 已移除主题预设 \"X\"，回退默认主题")` + 返回默认；不再查 palette。
  - `mergeFonts`/`resolveTheme`/`resolveTextStyle`/`resolveTableStyle`/`themeChartPalette` 保持不变。
- `theme-presets.js`：删除 `THEME_PALETTES` 与 `COMMON`；只保留 `DEFAULT_THEME`（colors + 默认 textStyles/tableStyles）。文件头注释改为“默认 theme 数据”。
- `packages/model/index.js`：删除主题库导出；新增 `STANDARD_COLOR_KEYS`、`ThemeError`、`listColorTokens`、`setColorToken`、`removeColorToken`、`colorTokenUsage` 从 `color-tokens.js` 导出；`DEFAULT_THEME` 保留，`THEME_PALETTES`/`mergePaletteColors` 删除。

验证：
- `node --input-type=module -e "import('./packages/model/index.js').then(m=>console.log(typeof m.setColorToken, !!m.DEFAULT_THEME, 'THEME_PALETTES' in m))"` → function true false。
- `node tests/regression/theme-library.mjs` 暂时会失败（T3 替换）；T1 只做静态抽验。
- `node tests/regression/color-consistency.mjs` 全绿。

### T2 编辑器 Design 面板改为“颜色 / 字体 / 外观”

只允许改：`editor/interaction/design-panel.js`、`editor/app/project/loader.js`、`editor/app/project/source.js`、`editor/app/project/io.js`、`editor/app/toolbar.js`、`editor/skeleton.js`、`editor/styles/design.css`。

- `loader.js`：
  - `applyTheme(themeInput)` → `applyColors(colors)`：只写 colors，保留 textStyles/tableStyles：
    ```js
    state.deck.theme = { ...(state.deck.theme || {}), colors: JSON.parse(JSON.stringify(colors || {})) };
    state.theme = resolveTheme(state.deck);
    ```
  - `applyHistory` 仍 `state.theme = resolveTheme(state.deck)`；不改 `view.render({thumbs:"current"})`（W3 处理 revision）。
  - 删除 `DEFAULT_THEME` deep-copy 分支。
- `source.js`：`applyDeck` 不再调用 `ctx.applyTheme`；直接 `state.theme = resolveTheme(state.deck)`（删除内联 deep-copy/DEFAULT_THEME 分支）。`DEFAULT_THEME` import 若不再用则删。
- `io.js`：`applyTheme` → `applyColors`；`newProject` 用 `state.theme = resolveTheme(deck)`（不要 `normalizeTheme(null)`）。
- `design-panel.js`：
  - 删除 `applyTheme`、`listBuiltinThemes`、`normalizeThemeFile` 等 import；保留 `setColorToken/listColorTokens/removeColorToken/resolveColor`。
  - 删除 `API.themes`、`themes` state、`loadThemes`、`matchTheme`、`currentThemeLabel`、`applyThemeFile`、`themeCard`、`saveCurrentTheme`、`importTheme`、`exportTheme`、`deleteTheme`、`download`/`downloadBlob`、`safeName`、`CARD_KEYS`。
  - tabs：`colors`（颜色）/`fonts`/`appearance`；`activeTab` 默认 `"colors"`；`open({tab})` 接受 `colors|fonts|appearance`；`ensureData` 只加载 fonts。
  - `renderColorsTab()`：section `颜色令牌（N）` + token 列表 + 添加颜色；hint“只修改 theme.colors；文字/表格样式保持不变。”
  - `writeToken`：用 `setColorToken(deps.state.deck.theme || deps.state.theme, key, value)`，成功后 `deps.io.applyColors(next.colors)`；不要写 `textStyles/tableStyles`。
  - `deleteToken` / `addColorDialog` 同样只写 `colors`。
  - `syncThemeHighlights` → `syncColorRows`：只更新 token swatch（无主题卡/当前主题标签）。
  - 字体 tab：`deckFontFamilies` 仍走 `deps.state.theme.textStyles/tableStyles`（标准 theme 保留）；逻辑不变。
  - `ensureData` 静态站 hint 只保留字体部分；颜色编辑离线可用。
- `toolbar.js`：`open(tab = "colors")`；`btnDesign.onclick = () => open("colors")`；`pptd:open-design` 默认 `"colors"`。
- `skeleton.js`：`#btn-design` title 改“设计：颜色 / 字体 / 外观”。
- `design.css`：删除 `.design-current*`、`.design-actions*`、`.design-theme-*`、`.design-swatches`、`.design-swatch`、`.design-badge` 等主题卡样式；保留 `.design-token*`、`.design-add-color`、字体/外观样式。

验证：
- 打开 Design 面板：3 tabs（颜色/字体/外观），`.design-theme-card` 不存在，`.design-token` ≥16。
- 改 primary 后 `state.deck.theme.colors.primary` 变化；`JSON.stringify(state.deck.theme.textStyles/tableStyles)` 前后完全一致。
- `/api/themes` 不再被请求（Network 或 fetch stub）。
- 字体/外观 tab 仍工作。

### T3 测试替换与同步

只允许改：`tests/regression/color-tokens.mjs`（新）、`tests/regression/theme-library.mjs`（删除）、`tests/regression/theme-presets.mjs`（删除）、`tests/run-all.mjs`、`tests/contract/public-api.mjs`、`tests/e2e/editor-minimal.mjs`、`tests/e2e/incremental-load.mjs`。

- 新 `tests/regression/color-tokens.mjs`：保留旧 theme-library 的颜色部分：
  - `listColorTokens` 标准顺序/自定义顺序/standard 标记。
  - `setColorToken` 新增/编辑/返回新对象/非法 key 与 value → `ERR_THEME_INVALID`。
  - `colorTokenUsage` 统计 color/fill 引用、`$` 前缀、未引用=0。
  - `removeColorToken` 被引用 blocked/未引用删除/不存在 key。
  - 不测试 theme store/applyTheme/ThemeFile/palettes。
- 删除 `theme-library.mjs`、`theme-presets.mjs`。
- `tests/run-all.mjs`：`主题库（theme-library）` 行替换为 `颜色令牌（color-tokens）`；删除 `主题预设一致性` 行；套件总数从 30→29（+9 项目导出 = 38）。
- `tests/contract/public-api.mjs`：`mergePaletteColors` 从 fns 删除，`THEME_PALETTES` 从 consts 删除；其他不变（`CONTRACT_VERSION` 仍 3）。
- `tests/e2e/editor-minimal.mjs` §7/§8：
  - §7：打开 Design → 断言 tabs 含“颜色”、“字体”、“外观”，`.design-theme-card`=0，`.design-token`≥16；用 `[data-token="primary"] .design-token-hex` 改成 `#123456` + `change`，断言 colors.primary 变化且 `textStyles/tableStyles` 深比较不变；添加自定义 token、撤销同旧流程（只改 colors）。
  - §8：静态站 stub `/api/`：颜色 tab 仍显示 ≥16 tokens；字体 tab fontCount>0、importRows=0、hint 含“静态站”；删除“保存当前为主题”/cards 断言。
- `tests/e2e/incremental-load.mjs`：fixture 删除 `theme: cyan\n`（或写成合法 `theme:\n  colors:\n    primary: "#0F798A"\n`）；测试目标不变。

验证：
- `node tests/run-all.mjs` 全绿（38/38；报告真实数）。
- `node tests/e2e/editor-minimal.mjs` 全绿（数量可能变化，报告真实数）。
- `node tests/e2e/incremental-load.mjs` 全绿。
- `node tests/tools/golden-diff.mjs` 142/142（W2 不改渲染）。

## 验收

1. `node tests/run-all.mjs` 全绿（38/38）。
2. `node tests/e2e/editor-minimal.mjs`、`node tests/e2e/incremental-load.mjs` 全绿。
3. `node tests/tools/golden-diff.mjs` 142/142。
4. `git grep -n "THEME_PALETTES\|applyTheme\|normalizeThemeFile\|createThemeStore\|listBuiltinThemes\|design-theme-card" packages/model editor tests/contract tests/regression tests/e2e/editor-minimal.mjs` 只应命中“已移除”说明/历史注释，不应有实现引用。
5. 写入范围外零 diff；handoff 唯一例外。

## 禁触清单

`packages/cli/**`、`packages/server/**`、`packages/export/**`、`packages/paths.js`（W1）；`examples/**`、`tests/golden/**`、`README*.md`、`CHANGELOG.md`、`docs/**`（W3）；公式/vendor；`contract.json`、`package.json`。

## 交接包

完成后在分支最后一个 commit 写 `specs/2026-11-01-1841-open-pptd-3.2-theme-removal/handoff/W2-worker.md`（A/B/C，50–70 行）：颜色 token API 实际签名、Design 面板 DOM/tab 变化、删除清单、测试真实数、与 spec 偏差、W3 需要接手的失效/实时点（`loader.applyColors`/`endChange` 现状）。

## 最终报告

工单状态表 / commit 清单 / 自测真实结论 / 偏差与取舍 / 交接校验 / 探索审计 / 未决问题。
