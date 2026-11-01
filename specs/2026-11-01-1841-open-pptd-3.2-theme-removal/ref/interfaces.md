# interfaces · 3.2 主题库删除

> 冻结接口；W1/W2 并行时以本文件为准。W2 合并后 lead 回写实际签名，W3 只读。

## 1. PPTD deck theme（保持不变）

```yaml
theme:
  colors: { ... }          # 16 标准 token + 自定义 token
  textStyles: { ... }      # 命名文本样式；$key 引用
  tableStyles: { ... }     # 命名表格样式；$key 引用
fonts:
  <slot>: { family: "...", url?: "...", file?: "...", subset?: true }
```

- **不新增 `styles`/`palette` 字段；不做旧 deck 迁移。**
- `theme.textStyles/tableStyles` 是 deck 的标准样式系统；前端颜色编辑永远不写这两块。
- `normalizeTheme` 对字符串主题保留宽松解析：警告 + 默认主题；不恢复 `THEME_PALETTES` 预设。

## 2. 颜色 token 核心（W2）

新文件：`packages/model/color-tokens.js`（由 `theme-library.js` 裁剪而来；`theme-library.js` 删除）。

```js
export const STANDARD_COLOR_KEYS; // 16 个标准 key，固定顺序

export class ThemeError extends Error {
  // code: "ERR_THEME_INVALID"; 构造 (code, message, details?)
}

// theme = { colors, textStyles, tableStyles }（标准 theme；可只传 {colors}）
listColorTokens(theme) -> Array<{ key, value, standard }>
  // 标准 key 在前、自定义 key 按 insertion order 在后

setColorToken(theme, key, value) -> theme
  // 纯函数；返回新 theme；保留 textStyles/tableStyles
  // key: /^[A-Za-z][A-Za-z0-9_-]*$/；value: #RRGGBB / #RRGGBBAA
  // 非法 -> throw ThemeError("ERR_THEME_INVALID", ...)

removeColorToken(theme, key, { deck } = {}) -> { blocked, usage, theme }
  // deck 引用 > 0 -> blocked:true, theme 不变
  // 未被引用 -> 删除该 key，返回新 theme

colorTokenUsage(deck, token) -> number
  // 统计页面/元素里 /color|fill/i 字段的 "$token" 引用；支持 "$" 前缀
```

`packages/model/index.js` 只导出以上颜色工具；删除：
`applyTheme`、`normalizeThemeFile`、`createThemeStore`、`listBuiltinThemes`、`BUILTIN_THEME_PREFIX`、`THEME_FILE_VERSION`、`isBuiltinThemeId`、`isUserThemeId`、`collectThemeReferences`、`THEME_PALETTES`、`mergePaletteColors`。

## 3. 编辑器颜色写入（W2 已合并；W3 扩展）

W2 实际签名：

```js
// editor/app/project/loader.js
applyColors(colors) -> void
  // current = state.deck.theme（非对象按 {} 处理，兼容旧字符串 theme）
  // state.deck.theme = { ...current, colors: deepClone(colors) }
  // state.theme = resolveTheme(state.deck)
  // 不触碰 textStyles/tableStyles

// editor/app/project/io.js
applyColors: loader.applyColors
```

W2 实际 Design 面板：

- tabs：`colors`（颜色）/ `fonts` / `appearance`；`activeTab` 默认 `colors`。
- `writeToken` 用 `deps.state.deck.theme`（非对象回退 `deps.state.theme`）→ `setColorToken` → `io.applyColors(next.colors)`；只写 colors。
- 颜色历史：首次 input `beginChange()`，change/blur `endChange({ thumbs: "all" })`。
- 仍无 `themeRevision` / `ui.events` / 实时 debounce（W3）。

W3 最终形态：

```js
// editor/app/state.js
state.themeRevision: number      // 每次 resolved theme 变化 +1

// editor/context.js
ui.events: EventTarget           // 实例级；"themechange" CustomEvent
  // detail: { origin: "design" | "history" | "load" | "editor" }

// editor/app/project/loader.js
applyColors(colors, { origin = "editor" } = {}) -> void
  // 写 colors、resolveTheme、themeRevision++、dispatch themechange
  // 旧字符串 theme 仍按 {} 处理
applyHistory(deckSnapshot)
  // 比较 colors/textStyles/tableStyles 签名；变化才 themeRevision++ + dispatch origin:"history"

// editor/app/api.js
setThemeColors(colors, { origin = "editor" } = {}) -> void
  // io.applyColors + view.renderCanvas()（缩略图由 W3 view/面板决定）
setThemeColor(key, value) -> theme
  // setColorToken(安全 theme, key, value) → setThemeColors；非法抛 ThemeError
refreshThumbnails() -> void
  // view.renderThumbnails()（全量；取色器 debounce 用）

// editor/app/view/view.js
render({ thumbs?: "all"|"current"|"none" }) -> void
  // 若 state.themeRevision !== 上次已渲染 revision，强制 thumbs="all"
  // 普通内容编辑仍可用 "current"；不因 revision 变化丢失更新
```

约束：

- 颜色编辑一次历史事务：第一次 input `beginChange()`，`change`/blur `endChange({ thumbs: "all" })`。
- 取色器 `input`：画布实时（`view.renderCanvas()`），缩略图 debounce（约 100ms）全量；`change` 立即全量并提交历史。
- 撤销/重做：`applyHistory` 若 theme 变化，`themeRevision++` + dispatch；`view.render({thumbs:"current"})` 由 view 自动升级为 all。
- Design 面板订阅 `ui.events` 的 `themechange`：`origin:"design"` 只同步本地色块；`history/load` 重建当前 tab（保留 scroll）。
- 任何路径都不得写 `theme.textStyles/tableStyles`。


## 4. CLI 删除面（W1）

删除：

- `open-pptd assets themes list|import|export|delete|apply`（`assets themes` 现为未知子命令，exit 1）
- `open-pptd build --theme <id>`（在 `runBuild` 入口显式拒绝：`ERR_INVALID_OPTION`，消息含“已移除”）
- `assets list --json` 的 `themes` 字段；人类输出不再有 `themes` 行
- `doctor --json` / 人类输出的 themes 计数与路径

保留：

- `assets list|sync|clean`、`assets fonts`、`assets skill install`
- `assets list --json`：`{ ok, home, fonts, icons, userFonts, registry }`（无 `themes`）
- CLI 仍是五命令：`open/build/check/assets/doctor`

错误码：删除后不再产生 `ERR_THEME_NOT_FOUND`；颜色 token 的 `ERR_THEME_INVALID` 仍由 model 抛出；`build --theme` 使用 `ERR_INVALID_OPTION`。

## 5. Server 删除面（W1 已合并）

- 已删除 `/api/themes` 路由、`handleThemes`、`createFileThemeStore`、`themeStorePaths`、`theme-store.js`、`themes.js`。
- `createServer(options)` 不再接受 `themeStore`；`/api/fonts` 不动。
- `packages/paths.js` 不再有 `paths.themes`；`ensureHome` 不创建 themes 目录。
- `packages/server/http-util.js` 注释同步去掉 themes。

## 6. Export 删除面（W1 已合并）

- `exportProject(project, options)` 不再支持 `options.theme`。
  - 传入 `theme` -> `ExportError(EXPORT_ERRORS.INVALID_OPTION, "theme 覆盖已移除（主题库已删除）")`（明确失败，不静默）。
- CLI `build` 不再传 theme；`build --theme` 在入口拒绝。

## 7. 测试契约

- `tests/regression/color-tokens.mjs`（W2 新）：覆盖 `listColorTokens/setColorToken/removeColorToken/colorTokenUsage`；错误码 `ERR_THEME_INVALID`。
- 删除 `tests/regression/theme-library.mjs`、`tests/regression/theme-presets.mjs`；`tests/run-all.mjs` 套件列表同步。
- `tests/contract/public-api.mjs`：移除 `THEME_PALETTES`、`mergePaletteColors` 期望；`CONTRACT_VERSION` 仍 3。
- `tests/e2e/editor-minimal.mjs`：Design 面板断言改为“颜色”tab；不再有主题卡；颜色编辑后 `textStyles/tableStyles` 深比较不变。
- `tests/e2e/incremental-load.mjs`：移除 `theme: cyan` 字符串 fixture（改为合法 colors 或省略）。
- 不新增 e2e 套件；W3 在现有 editor-minimal 中补充撤销/实时断言。

## 8. 版本与兼容

- 不 bump `package.json`（3.0.0 尚无 v3 tag）；CHANGELOG 记 breaking（W3）。
- 不写旧 deck 迁移；`theme.textStyles/tableStyles` 原样。
- 不保留已删除 API 的 alias / shim。
