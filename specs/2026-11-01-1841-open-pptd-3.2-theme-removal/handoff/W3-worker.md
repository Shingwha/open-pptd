# W3 handoff · 颜色失效修复 + EV token 化 + 文档

> 分支 `feat/3.2-w3-invalidation-examples-docs`，基于 W2 合并点 d82e572。
> 6 个实现 commit + 本交接 commit；全程未 merge/push/tag，未动主检出。

## A. revision / 事件与失效链路（实际签名）

- `editor/app/state.js`：state 增加 `themeRevision: 0`（注释说明“resolved theme 版本号”）。
- `editor/context.js`：`ctx.events = new EventTarget()`（实例级）；`"themechange"` 的
  `CustomEvent.detail = { origin: "design" | "history" | "load" | "editor" }`。
- `editor/app/project/loader.js`：
  - `themeSignature(theme)`：`JSON.stringify([colors||{}, textStyles||{}, tableStyles||{}])`（null 安全）。
  - `bumpThemeRevision(origin)`：`state.themeRevision++` + `ui.events?.dispatchEvent?.(new CustomEvent(...))`。
  - `applyColors(colors, { origin = "editor" } = {})`：保留旧字符串 theme 守卫；只写 `theme.colors`；
    `resolveTheme` 后 bump。
  - `applyHistory(deckSnapshot)`：replace 前后各算一次签名，变化才 `bumpThemeRevision("history")`；
    之后仍 `view.render({ thumbs: "current" })`。
  - `applyDeck()` 在 source.applyDeck 后额外 dispatch `origin:"load"`。
- `editor/app/project/source.js` / `io.js`：加载/新建后 `themeRevision++`（不依赖事件）。
- `editor/app/view/view.js`：`paintedThemeRevision = -1`；`render()` 若 `state.themeRevision`
  与已画 revision 不同则强制 `thumbs="all"` 并记录；普通内容编辑仍走 `"current"`，不退化全量。
- `editor/app/api.js`：新增 `setThemeColors(colors, { origin="editor" })`（io.applyColors + 画布）、
  `setThemeColor(key, value)`（安全 base → model `setColorToken`，origin 固定 `"design"`，非法抛 ThemeError）、
  `refreshThumbnails()`（`view.renderThumbnails()`）；保留 `refreshPreview`。
- `editor/interaction/design-panel.js`：`writeToken` 改走 `api.setThemeColor`；input 时
  `beginTokenTx` + 画布实时 + `scheduleThumbRefresh()`（100ms debounce）；
  `change`/blur `endTokenTx()`（clear timer + `endChange({thumbs:"all"})`）；`deleteToken` 走
  `api.setThemeColors(...,{origin:"design"})`；`build()` 订阅 `themechange`：隐藏忽略、
  `origin:"design"` 忽略、事务中只 `syncColorRows()`、其余 `renderBody()`（保留 scrollTop）。
  `syncColorRows` 只更新 swatch/hex/picker，不重建 DOM。

## B. e2e 断言、EV golden、文档

- `tests/e2e/editor-minimal.mjs`：fixture 每页增加 `p2/p1` 的 120×12 rect，`fill.color: "$primary"`
  （不改原有相对计数断言）。§7 新增两条：
  1. picker `[data-token="primary"]` 设 `#654321` + dispatch `input`，等待 130ms，断言
     `#canvas` innerHTML hash 变化 + **两个 `.thumb-canvas` hash 全部变化** + token 已写入；
  2. dispatch `change` + `api.undo()`，等待 300ms，断言 primary/画布/全部缩略图/Design hex 全部恢复。
  hash 前把 ECharts 的 `ec_<ts>` / `zr_<n>` 实例 id 归一化，避免重绘误判。
  自定义 token 断言保留，undo 次数改为“实时测试撤销 1 次 → 添加 gold → 撤销 gold”。
- 套件由 21 条增至 23 条（23/23）。
- `examples/ev-range/pages/01_cover.page`、`15_final.page`：仅背景渐变 stop 改
  `#0E2E5F→$primaryDeep`、`#1F5FBF→$primary`、`#3E7BD6→$accent3`；元素/阴影/文案/deck theme 未动。
- `tests/golden/manifest.json`：仅 EV `sourceHash` + page 1/15 的 bytes/sha256/dHash/aHash 变化
  （10 行 diff），其余 22 项目条目零改动。
- 文档：README 中英文 `assets list` 去掉 themes；Design 面板描述改“颜色令牌、字体与深浅色”；
  “主题与字体”改“字体”；CHANGELOG 顶部新增 `## 未发布 · 3.2`（主题库删除、颜色失效/实时、
  EV token 化、CLI 变化），不 bump 版本。

## C. 测试真实数与偏差

- 开工基线（worktree）：run-all 初始 37/38，唯一失败为公式用例缺
  `tests/fixtures/formula/mml/`（gitignored 本地产物）；跑 `node tests/tools/dump-formula-mml.mjs`
  生成 204/204 后 38/38。未改公式/vendor 或测试代码。
- 基线确认：run-all 38/38；editor-minimal 21/21；golden-diff 23 项目/142 页字节一致。
- 波末验收（真实输出）：run-all 38/38；docs 35/35；golden-diff 142/142（23 项目，其他项目零 diff）；
  e2e 串行：editor-minimal 23/23、page-ops 17/17、editor-ops 22/22、preview-shell 23/23、
  feedback-fixes 21/21、add-elements 12/12、browser-export 15/15、incremental-load 5/5、render 9/9；
  perf 全部达标；EV check 0 error/0 warning、pptx 构建成功（15 页）。
- 偏差：e2e 的 canvas/缩略图 hash 需要剔除 ECharts 随机实例 id（否则撤销后假失败）；
  这是测试归一化，不是产品行为变化。T3 的 undo 次数从 2 次改为 1 次，与工单“实时后撤销一次、
  再撤销 gold”一致；断言名改为“自定义颜色 token 可撤销（已提交的颜色不受影响）”。
- 交接校验：`git diff --name-only d82e572..HEAD` 只含本工单允许文件（editor 7 文件 +
  design-panel + 2 个 EV page + editor-minimal + golden manifest + 3 文档）；未触
  packages/model|cli|server|export、contract.json、package.json、公式/vendor、其他 examples/e2e。
