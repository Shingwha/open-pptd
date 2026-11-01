# W2 handoff · 删除主题库，保留颜色编辑

> 分支 `feat/3.2-w2-theme-library-editor-colors`；commit 397c1e5 / 9f294ae / c3ce1e3。

## A. 颜色 token API（实际签名）

`packages/model/color-tokens.js`（新文件，`theme-library.js` 已删除）：

```js
STANDARD_COLOR_KEYS // 16 个，固定顺序，Object.freeze
class ThemeError extends Error // (code, message, details = {})；code 固定 "ERR_THEME_INVALID"
listColorTokens(theme) -> Array<{ key, value, standard }>
setColorToken(theme, key, value) -> theme // 纯函数；只改 colors，保留 textStyles/tableStyles
removeColorToken(theme, key, { deck = null } = {}) -> { blocked, usage, theme }
colorTokenUsage(deck, token) -> number // 支持 "$token" 前缀；页面背景 + 元素子树
```

- `setColorToken` 校验：key `/^[A-Za-z][A-Za-z0-9_-]*$/`；value `#RRGGBB` / `#RRGGBBAA`；非法抛
  `ThemeError("ERR_THEME_INVALID", …)`。
- `removeColorToken`：`usage > 0` 返回 `blocked:true` 且 theme 不变；未引用时删除该 key。
- `packages/model/index.js` 只导出上述 6 项颜色工具；`DEFAULT_THEME` 保留。
- 已删除且无 alias：`applyTheme`、`normalizeThemeFile`、`createThemeStore`、`listBuiltinThemes`、
  `BUILTIN_THEMES`、`BUILTIN_THEME_PREFIX`、`THEME_FILE_VERSION`、`isBuiltinThemeId`、
  `isUserThemeId`、`collectThemeReferences`、`THEME_PALETTES`、`mergePaletteColors`。
- `normalizeTheme("x")`：`console.warn("[theme] 3.2 已移除主题预设 \"x\"，回退默认主题")` + 默认主题。
- `theme-presets.js` 只剩 `DEFAULT_THEME`（16 colors + textStyles + tableStyles）；`COMMON`/10 套预设删除。
- deck theme 结构未变：`{ colors, textStyles, tableStyles }`；无 `styles`/`palette` 新字段。

## B. 编辑器 Design 面板与写入路径

- tabs 固定 `colors(颜色) / fonts(字体) / appearance(外观)`；`activeTab` 默认 `"colors"`；
  `open({ tab })` 接受三者；`#btn-design` 与 `pptd:open-design` 默认 `colors`；title 改为“设计：颜色 / 字体 / 外观”。
- 颜色 tab DOM：`.design-sec`（“颜色令牌（N）”）、`.design-token[data-token="<key>"]`
  （`.design-token-swatch` / `-name` / `-picker` / `-hex` / `-del`）、`.design-add-color`、
  hint“只修改 theme.colors；文字/表格样式保持不变。”。
- 已删除 DOM/逻辑：`.design-current*`、`.design-actions*`、`.design-theme-*`、`.design-swatches`、
  `.design-swatch`、`.design-badge`、theme cards、保存/导入/导出/删除主题、`loadThemes`、
  `matchTheme`、`currentThemeLabel`；不再请求 `/api/themes`（API 只剩 `/api/fonts`）。
- `loader.applyColors(colors)`：`state.deck.theme = { ...(deck.theme || {}), colors: deepClone(colors) }`，
  随后 `state.theme = resolveTheme(state.deck)`；不碰 textStyles/tableStyles。
- `io.applyColors: loader.applyColors`；`newProject` 用 `state.theme = resolveTheme(deck)`。
- `source.applyDeck`：不再回调 `ctx.applyTheme`，直接 `state.theme = resolveTheme(state.deck)`；
  删除 DEFAULT_THEME deep-copy 兜底（无 theme 的 deck 保持 theme=null，不迁移）。
- 字体 tab 逻辑不变（`deckFontFamilies` 仍读 `state.theme.textStyles/tableStyles`）；外观 tab 不变。
- 颜色编辑历史：首次 `input` → `beginTokenTx()` → `api.beginChange()`；`change`/blur →
  `endTokenTx()` → `api.endChange({ thumbs: "all" })`（沿用 W2 前现状）。

## C. 测试、偏差与 W3 接续

- 新增 `tests/regression/color-tokens.mjs`：30/30 通过（列表顺序/standard、set 纯函数与校验、
  usage、remove 阻止/删除/不存在）。删除 `theme-library.mjs`、`theme-presets.mjs`；
  `run-all` 套件 30→29（+9 项目导出 = 38）。
- 基线（开工前）：run-all 39/39、editor-minimal 21/21、incremental-load 5/5、golden 142/142。
- W2 分支单独跑：W2 范围套件全绿（color-tokens 30/30、color-consistency 50/50、docs、dep-graph、
  UI 令牌门禁）；全量 run-all 20/38，e2e/golden 在 import/startServer 阶段失败（见下条）。
- 临时集成冒烟（W2 HEAD + W1 最终快照 a17bcf8，系统临时目录，未改/未 merge 任何分支）：run-all 38/38、
  editor-minimal 21/21、incremental-load 5/5、golden-diff 142/142。正式合并后请复跑确认。
- 阻塞根因（W1 未合并，非 W2 代码）：cli/{assets,build,doctor}.js、server/{themes,theme-store}.js、
  export/index.js 曾 import 已删的 theme-library.js / THEME_PALETTES；W1 当前快照已修复 cli/server/export，
  theme-store.js 仍为未引用残留。合并顺序必须 W1→W2。
- 偏差：editor-minimal §7 从“点主题卡”改为 hex 改 primary；撤销断言用 optional chaining
  （fixture 原本无 theme，二次撤销回到 theme=null）。§8 改为“颜色离线可编辑 + 字体静态站提示”，
  删除 cards==11 断言。`.design-mini-btn` 保留（字体状态行仍在用）。
- W3 接续点：`loader.applyColors` 当前无 `origin`/`themeRevision`/`themechange`；`applyHistory`
  仍是 `resolveTheme` + `view.render({ thumbs: "current" })`；design-panel 未订阅 `ui.events`；
  取色器 `input` 同步写 + 立即 `endChange({thumbs:"all"})`，无 100ms 缩略图 debounce。
  W3 需按 `ref/interfaces.md` §3 扩展 `applyColors(colors, { origin })`、`themeRevision++`、
  `view.render` 强制 `thumbs:"all"`、`setThemeColor(s)`/`refreshThumbnails`。
