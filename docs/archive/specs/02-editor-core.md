# Spec A2 · editor-core：传输接缝 / 主题注入 / 可挂载编辑器（W1）

> agent 代号 A2，分支 `feat/p0-editor-core`。深读：`docs/specs/ref/integration-plan.md` §3.3 契约 1/2/3、§4.2 L1/L2 与 §4.2.1、附录 D.2/D.3/D.4、§2.3 硬点 H1–H5。
> 前置阅读：`docs/specs/00-overview.md`。

## 目标

解决 H1–H5：编辑器可挂载、可销毁、传输可注入、主题可注入（含 dark）。**对外行为零变化**——`serve` 打开编辑器的既有用法、`?shot=1` 截图、ui-shots 输出全部不变。

## 工单（建议 commit 顺序）

### T1 `ProjectSource` 契约 + 三实现（新文件 `editor/app/project/source.js`）

鸭子类型接口（签名以附录 D.3 为准）：

```js
ProjectSource = {
  capabilities: { writable, liveWatch, binary },
  read(): Promise<{ manifestText, pageFiles: Map<string,string>, media? }>,
  write(files: [{path, text?, bytes?}]): Promise<void>,
  readMedia?(path): Promise<Uint8Array|null>,
  watch?(cb): () => void,   // 返回退订函数
}
```

- `httpSource({ base = "", deckUrl })`——现有 serve 的 fetch/SSE 模式，`base` 参数化（解决根绝对路径硬编码）。
- `directoryHandleSource(handle)`——包装现有 `handle-io.js`（**该文件不改**，其鸭子类型设计已正确；`tests/regression/handle-io.mjs` 继续生效）。
- `memorySource({ files })`——测试与嵌入用。
- 把 `loader.js` 里"读 deck → 应用到 state/view/images/fontManager"的逻辑抽为可导出的 `applyDeck(source, ctx)`（供 createEditor 复用）。

### T2 saver / live-reload / loader 去字面量

- `saver.js:198` 删除字面量 `fetch("/api/save")` → `source.write()`；`capabilities.writable === false` 时回退现有"下载项目 zip"降级（行为保留）。
- `live-reload.js:93` 删除字面量 `new EventSource("/events")` → `capabilities.liveWatch` 为真时 `source.watch()`；为假回退现有指纹轮询（800ms + 1500ms 保存抑制窗口，行为保留）。
- `loader.js` 重写为薄适配：内部走 `source.read()`，对 saver/live-reload 的既有对外行为不变。
- 三个模块通过依赖注入拿到 source（由 boot/createEditor 装配），不再各自 fetch。

### T3 主题注入（契约 3）

- 新文件 `editor/theme.js`：`TOKENS`（令牌名清单）、`defaultTokens("light"|"dark")`、`applyThemeTokens(rootEl, { tokens, mode }) → () => void`（返回还原函数；实现为在 rootEl 上 set/unset `data-pptd-theme` 与内联令牌覆盖）。
- `editor/styles/tokens.css`：保留现有 `:root`（light），**新增 `[data-pptd-theme="dark"]` 块**。dark 取值从设计参考稿 `ref/editor-design-reference.html` 的 `[data-theme="dark"]` 板换算到**现有令牌名**（--bg/--panel/--ink/--sub/--faint/--line/--primary 等），保证语义对应（面板比底亮一档、文字反转等）。注意：W3 的 U1 会整体重建令牌体系，此处求语义正确不求末位像素。

### T4 暗色硬编码清零（§4.2.1 清单，8 处）

| 位置 | 处置 |
|---|---|
| `styles/responsive.css:42` | `rgba(28,37,50,.16)` → 用 `--shadow-*` 令牌 |
| `styles/thumbbar.css:74,75,92,93` | 悬浮标签硬编码 → 令牌化 |
| `styles/inspector.css:34` | `rgba(28,37,50,.42)` → 新增 `--mask` 令牌 |
| `styles/inspector.css:179` | `rgba(0,0,0,.12)` → 新增 `--chip-border` 令牌 |
| `styles/dialogs.css:9` | 遮罩 → `--mask` |
| `styles/excel-grid.css:12,15` | `inset 0 0 0 999px` hack → `--primary-soft`/`--primary-tint` |
| `styles/present.css`（12 处黑白） | **保持不动**（放映面中性是设计意图） |

新增令牌（--mask、--chip-border）加进 tokens.css 的 light 与 dark 两块。

### T5 `createEditor` + `destroy()` + dom 工厂化（契约 1，签名见附录 D.2）

- 新文件 `editor/editor.js`：`export function createEditor(rootEl, options)`。把 `main.js` 顶层 `boot()` 逻辑整体搬入并闭包化。options：`source`（必填）、`deck?`、`theme?`、`chrome?`（`"full"|"embedded"|{topbar?,brand?,github?,thumbbar?,quickbar?,zoom?,inspector?}`）、`dialogs?`、`on?`（ready/dirty/saved/error/deckChange/selectionChange）。返回 `{ ready, destroy, api, io, state, view }`；`destroy()` **幂等**：移除 DOM、解绑 window/document 监听、关闭 EventSource、`disposeChartInstances`、清空 dom 缓存。
- `editor/dom.js`：`cache`/`byId` 改为 `createDom(rootEl)` 工厂；**过渡期保留默认实例导出**（现名导出不变），内部走工厂；未迁移调用点继续工作。
- `editor/main.js` 重写为薄入口，**零行为变化**：构造 `httpSource({ deckUrl: new URLSearchParams(location.search).get("deck") })` + `chrome: "full"` 调 `createEditor`；**继续暴露 `window.__pptdEditor/__pptdIo/__pptdShot`**（`tests/tools/ui-shots.mjs`、`shot.js` 依赖）。
- `editor/index.html`：加挂载点 `<div id="pptd-root">`；`chrome` 为 embedded/裁剪态时顶栏品牌链接与 GitHub 外链禁用或隐藏。
- `editor/app/{api,view}.js`、`interaction/*`、各 controller：补 `destroy()`，统一释放 EventSource、window/document 监听、ResizeObserver、图表实例。
- `?shot=1` 路径：保持现状语义（零 chrome、无动画），经 chrome `"shot"` 档或既有 shot.css 均可，以 ui-shots 输出不变为准。

### T6 `dialogs` 接口（新文件 `editor/dialogs.js`）

`{ alert(msg), confirm(msg) → boolean|Promise<boolean> }`，默认实现包裹原生 `window.alert/confirm`，可被 `createEditor` options 覆盖。改造全部 12 处宿主敌意调用：

`types/image.js:26`、`interaction/excel-grid.js:90,97,105,113`、`interaction/dialogs/table-editor.js:142,152,204,224`、`app/project/io.js:85`、`app/project/loader.js:168`、`app/toolbar.js:45`。

## 验收（完成前自测）

1. `node tests/run-all.mjs` 20/20 绿；`handle-io.mjs`、`incremental-load.mjs` 特别确认。
2. `node bin/open-pptd.js serve --project tests/projects/chart` 起服后：`/editor/?deck=…` 正常编辑保存；无 `?deck` 进画廊；`?shot=1` 截图正常。（用内置 CLI serve，勿用 python http.server。）
3. 写一个临时脚本（不入仓）验证 `createEditor → destroy → createEditor` 两轮无报错、DOM 无残留。
4. `grep -rn 'fetch("/api/save")\|EventSource("/events")' editor/` 为空。
5. `grep -rn "window.confirm\|[^.]alert(" editor/ --include="*.js"` 仅剩 `editor/dialogs.js` 默认实现一处。
6. `grep -n "rgba(28,37,50" editor/styles/*.css` 为 0（present.css 除外，若其含同色值保持不动）。
7. worktree 无字体本体时，serve 编辑器字体列表可能不全——属环境预期，不算回归。

## 禁触清单

`packages/**`（一个字符都不能改）、`scripts/`、`.github/`、`SKILL.md`、`references/`、`package.json`、`tests/contract/`（A1 所有物）、`editor/styles/` 中本 spec 未列出的文件（U 波次再动；responsive/thumbbar/inspector/dialogs/excel-grid/tokens 六个只做本 spec 列明的改动）。
