# W3 · 颜色变更失效修复 + EV token 化 + 文档

> 分支 `feat/3.2-w3-invalidation-examples-docs`（W2 合并后由 lead 创建）。
> 前置：W1（`04c3f29`）、W2（`c65cd04`）已合并；main 上 run-all 38/38、editor-minimal 21/21、incremental 5/5、golden 142/142。
> 状态：✅ 2026-11-01，`45a2a5d`；终验见 `00-overview.md` 状态行。
> 最高约束：不动 deck theme 结构；不碰 model/CLI/server/export；只修颜色失效、EV 渐变、文档与现有测试。

## 目标

1. **失效根因**：颜色变更统一走 `themeRevision`；`view.render()` 按 revision 自动全量重画缩略图，不依赖调用方传 `thumbs:"all"`。
2. **撤销/重做**：颜色撤销后画布、全部缩略图、Design 面板同步。
3. **取色器实时**：拖动时画布实时，缩略图 debounce（约 100ms）；松手提交一次历史。
4. **EV token 化**：只改 `examples/ev-range/pages/01_cover.page`、`15_final.page` 的渐变硬编码主题色为 `$primaryDeep/$primary/$accent3`；其他示例不动；EV golden rebaseline。
5. **文档**：README 中英文去掉主题库/`assets themes` 表述；CHANGELOG 记 breaking；`tests/docs` 通过。

## 前置上下文

- 必读：`ref/repo-map.md` → `ref/interfaces.md` → 本工单 → `handoff/W2-worker.md`（尤其 D 节 Lead 收口）。
- 基线命令（开工先跑，贴真实输出）：
  - `node tests/run-all.mjs` → 期望 38/38
  - `node tests/e2e/editor-minimal.mjs` → 期望 21/21
  - `node tests/tools/golden-diff.mjs` → 期望 142/142
- W2 实际状态：
  - `loader.applyColors(colors)` 只写 `theme.colors`（非对象 theme 已守卫），无 revision/event。
  - `applyHistory` 只 `resolveTheme` + `view.render({thumbs:"current"})`。
  - Design 面板 tabs `colors/fonts/appearance`；`writeToken` 走 `io.applyColors`；`endTokenTx` 调 `endChange({thumbs:"all"})`；无实时/ debounce/ event。
  - `api` 有 `refreshPreview`（画布）与 `endChange`；无 `setThemeColor(s)`/`refreshThumbnails`。
  - 颜色 token 套件 `tests/regression/color-tokens.mjs` 30/30；run-all 套件 29 + 9 导出 = 38。
- 稳定区（勿改）：`packages/model/**`、`packages/cli/**`、`packages/server/**`、`packages/export/**`、`contract.json`、`package.json`、公式/vendor、其他 examples、其他 e2e 测试逻辑（只允许按本工单补断言）。
- 已知坑：
  - `view.render` 的 `thumbs` 默认 `"all"`；内容编辑用 `"current"`，页面切换用 `"none"`。revision 升级必须只影响主题变化，不能让普通内容编辑退化为全量。
  - `applyHistory` 在撤销主题时 `state.deck.theme` 可能回到 `null`；`resolveTheme` 会给默认 theme；签名比较要能处理 null。
  - Design 面板事件不能在本面板自己的颜色输入过程中 `renderBody()` 重建 DOM（会打断拖动）；用 `origin:"design"` 跳过。
  - e2e 的 temp fixture 页面当前用显式 `#1f2937` 文本色；要验证缩略图失效，必须在 fixture 页加 `$primary` 形状，否则改 primary 不会影响页面。

## 工单（按序执行，每项一个 commit）

### T1 revision + 事件 + view 失效

只允许改：`editor/app/state.js`、`editor/context.js`、`editor/app/project/loader.js`、`editor/app/project/source.js`、`editor/app/project/io.js`、`editor/app/view/view.js`、`editor/app/api.js`。

- `state.js`：`theme: null` 附近增加 `themeRevision: 0`。
- `context.js`：`ctx` 增加 `events: new EventTarget()`（实例级；注释说明 `"themechange"`）。
- `loader.js`：
  - 顶部增加 `themeSignature(theme)`：`JSON.stringify([colors||{}, textStyles||{}, tableStyles||{}])`。
  - `bumpThemeRevision(origin)`：`state.themeRevision++`；`ui.events?.dispatchEvent?.(new CustomEvent("themechange", { detail: { origin } }))`。
  - `applyColors(colors, { origin = "editor" } = {})`：保留现有非对象 theme 守卫；写 colors、`resolveTheme`、`bumpThemeRevision(origin)`。
  - `applyHistory`：replace 前保存 `previous = state.theme`；replace 后 `next = resolveTheme(state.deck)`；`changed = themeSignature(previous) !== themeSignature(next)`；`state.theme = next`；若 changed `bumpThemeRevision("history")`。其余逻辑不变。
  - `loader.applyDeck` 调用 source.applyDeck 后，追加 `ui.events?.dispatchEvent?.(new CustomEvent("themechange", { detail: { origin: "load" } }))`（手动刷新/加载时面板可用；初次加载面板未开，无副作用）。
- `source.js`：`applyDeck` 设置 `state.theme = resolveTheme(state.deck)` 后 `state.themeRevision = (state.themeRevision || 0) + 1`。
- `io.js`：`newProject` 设置 `state.theme = resolveTheme(deck)` 后 `state.themeRevision = (state.themeRevision || 0) + 1`。
- `view.js`：
  - `let paintedThemeRevision = -1;`。
  - `render(options)`：`let thumbs = options.thumbs || "all"; const rev = state.themeRevision ?? 0; if (rev !== paintedThemeRevision) { thumbs = "all"; paintedThemeRevision = rev; }`；后续按 `thumbs` 分派。
  - 不改 `renderCanvas`/`refreshPage`/`createPageView` 的渲染逻辑。
- `api.js`：
  - import `setColorToken`（`../../packages/model/index.js`）。
  - `setThemeColors(colors, { origin = "editor" } = {})`：`io?.applyColors(colors, { origin }); repaint();`。
  - `setThemeColor(key, value)`：安全 base（`state.deck.theme` 非对象回退 `state.theme`）；`const next = setColorToken(base, key, value); api.setThemeColors(next.colors, { origin: "design" }); return next;`（非法抛 `ThemeError`，设计面板捕获）。
  - `refreshThumbnails: () => view?.renderThumbnails()`。
  - 保留 `refreshPreview`（画布）。

验证：`node tests/run-all.mjs`（38/38）、`node tests/e2e/editor-minimal.mjs`（旧断言仍过；此时还没加新断言）。

### T2 Design 面板实时 + 事件同步

只允许改：`editor/interaction/design-panel.js`。

- 增加 `let thumbTimer = 0;` 与 `clearThumbTimer()` / `scheduleThumbRefresh()`（约 100ms `deps.api.refreshThumbnails()`）。
- `endTokenTx()`：先 `clearThumbTimer()`，再 `endChange({thumbs:"all"})`。
- `close()` / `closeDesignPanel()`：`clearThumbTimer()`。
- `writeToken`：改为 `deps.api.setThemeColor(key, value)`；异常 `ui.dialogs.alert` + false；成功 true。**不再直接 `deps.io.applyColors`**。
- `tokenRow`：
  - `picker input`：`beginTokenTx(); if (writeToken(...)) { paint(); scheduleThumbRefresh(); }`。
  - `picker change`：`endTokenTx(); syncColorRows();`。
  - `hex change`：`endTokenTx(); beginTokenTx(); if (valid && writeToken(...)) { endTokenTx(); paint(); syncColorRows(); } else { endTokenTx(); alert; paint(); }`。
- `deleteToken`：`deps.api.setThemeColors(report.theme.colors, { origin: "design" });`，再 `endTokenTx()`；不再直接 `io.applyColors`。
- `addColorDialog` 的 `writeToken` 路径保持；`endTokenTx` 提交。
- `syncThemeHighlights` 已改名 `syncColorRows`；确保只更新 token swatch/hex，不重建 DOM。
- 事件订阅：`build()` 里 `ac = new AbortController()` 后加
  `ui.events?.addEventListener?.("themechange", onThemeChange, { signal: ac.signal });`
  `onThemeChange(e)`：
  - 面板不存在/隐藏 -> return；
  - `e.detail?.origin === "design"` -> return；
  - `tokenTx` -> `syncColorRows(); return;`
  - 否则 `renderBody()`（保留 scroll）。
- 不改字体/外观 tab 逻辑；不请求 `/api/themes`。

验证：手动/CDP 抽验；`node tests/e2e/editor-minimal.mjs`。

### T3 e2e 回归：实时、缩略图、撤销

只允许改：`tests/e2e/editor-minimal.mjs`。

- fixture `pageYaml`：每页增加一个使用 `$primary` 的形状（例如底部 120×12 rect，`fill: {type: solid, color: "$primary"}`），让两页缩略图都随 primary 变化；不影响现有元素计数断言（相对差值）。
- §7 增加/调整：
  1. 打开 Design，断言三 tab、无主题卡、tokens≥16、textStyles/tableStyles 深比较不变（保留 W2 断言）。
  2. 捕获 `const hashes = [...document.querySelectorAll('.thumb-canvas')].map(hash)`（`outerHTML` 简单 hash）、`#canvas` hash。
  3. `picker = [data-token="primary"] .design-token-picker`；设 `#654321`，dispatch `input`；等 60–150ms；断言 `#canvas` hash 变化、**全部缩略图 hash 变化**（两页都有 `$primary` 形状）。
  4. dispatch `change`；`api.undo()`；等 300ms；断言语义：primary 恢复原值、全部缩略图 hash 恢复、Design hex 显示原值。
  5. 保留自定义 token 添加/撤销断言；调整 undo 次数（在实时测试后撤销一次，再添加 gold，再撤销 gold）。
- 不新增 e2e 套件；不改其他 e2e 文件。

验证：`node tests/e2e/editor-minimal.mjs` 全绿（报告真实 N/N）。

### T4 EV 渐变 token 化 + golden

只允许改：`examples/ev-range/pages/01_cover.page`、`examples/ev-range/pages/15_final.page`、`tests/golden/manifest.json`。

- 两页 `background.gradient.stops`：
  - `#0E2E5F` -> `$primaryDeep`
  - `#1F5FBF` -> `$primary`
  - `#3E7BD6` -> `$accent3`
- 不改其他元素/阴影/文案；不改 deck.pptd theme。
- 验证：
  - `node bin/open-pptd.js check examples/ev-range/deck.pptd` → 0 error/0 warning。
  - `node bin/open-pptd.js build examples/ev-range/deck.pptd --format pptx -o <tmp>` → 成功。
  - `node tests/tools/golden-render.mjs --filter ev-range` → 15 页；`tests/golden/manifest.json` 单独 commit。
  - `node tests/tools/golden-diff.mjs` → 23 项目/142 页第二遍 142/142；其他 22 项目零 diff。

### T5 README / CHANGELOG / docs

只允许改：`README.md`、`README.zh-CN.md`、`CHANGELOG.md`。

- README 中英文：
  - `assets list` 注释去掉“主题/themes”。
  - “最小网页编辑器”里的 Design 面板描述改为“颜色令牌、字体与深浅色”，删“主题/themes”。
  - “主题与字体”改为“字体 — 字体库，子集/完整字体嵌入与导出前体检（`build --fetch`）”；不要再写“内置主题库”。
- CHANGELOG 顶部新增“## 未发布 · 3.2”：
  - 删除主题库/主题切换、内置/我的主题、`/api/themes`、`assets themes`、`build --theme`、theme store。
  - deck theme 仍是标准 `{colors, textStyles, tableStyles}`；不迁移旧 deck；颜色编辑只写 `colors`。
  - Design 面板保留颜色令牌编辑；颜色撤销/缩略图失效修复；取色器实时。
  - EV 封面/尾页渐变 token 化；golden EV rebaseline。
  - CLI 变化：`assets` 只剩 fonts/icons/skill；`build --theme` 报错“已移除”。
- 不写版本号 bump；`README` badge 仍 v3.0.0（docs 测试要求）。

验证：`node tests/docs/run.mjs` 35/35；README 图片/命令规则不破。

## 验收

1. 全部 e2e 全绿：`editor-minimal`、`page-ops`、`editor-ops`、`preview-shell`、`feedback-fixes`、`add-elements`、`browser-export`、`incremental-load`、`render`（报告真实 N/N）。
2. `node tests/run-all.mjs` 38/38；`node tests/docs/run.mjs` 35/35。
3. golden：EV rebaseline 后 23 项目/142 页第二遍 142/142；其他项目零 diff。
4. `node tests/perf/editor-perf.mjs` 通过。
5. `check examples/ev-range/deck.pptd` 0/0；`build --format pptx` 成功。
6. 撤销颜色后全部 `.thumb-canvas` 恢复；取色器 input 后 100ms 左右全部更新；松手历史一步。
7. 写入范围外零 diff；handoff 唯一例外。

## 禁触清单

`packages/model/**`、`packages/cli/**`、`packages/server/**`、`packages/export/**`、`contract.json`、`package.json`、公式/vendor、其他 examples、其他 e2e 测试文件、`tests/golden` 除 manifest 外。

## 交接包

完成后在分支最后一个 commit 写 `specs/2026-11-01-1841-open-pptd-3.2-theme-removal/handoff/W3-worker.md`（A/B/C，50–70 行）：revision/事件签名、e2e 实时/撤销断言、EV golden 前后、文档改动、测试真实数、偏差。

## 最终报告

工单状态表 / commit 清单 / 自测真实结论 / 偏差与取舍 / 交接校验 / 探索审计 / 未决问题。
