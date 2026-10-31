# W8 · createPreview / createEditor / 单壳

> 分支/前置：W7 已合并；写入范围 `editor/{editor,main,dom,dialogs,index}.js`、`editor/index.html`、`editor/gallery.js`、`editor/theme.js`、根 `index.html`、`editor/app/view/{view,viewport,thumbnails}.js`、`tests/e2e/preview-shell.mjs`。
> 本波把编辑器变成自包含组件 + 单壳；不改内容编辑功能（W7 已定）。

## 目标

- `createPreview`（预览：load/layout/paint/page/zoom/present/live reload/export/theme）+ `createEditor`（在 preview 上加选择/变换/内容编辑/保存/undo/page ops/Design）。
- 自包含：骨架渲染进 rootEl；dom/dialog/toast/popover/present/theme 实例级；无 document 全局骨架/单例；destroy 幂等；双实例互不污染。
- 单壳：Home（gallery）+ Editor 视图；统一文件菜单/主题；移除旧 session restore 卡（本地 URL/handle 简化）。
- 画廊封面/headless 用 createPreview；headless 不再走 createEditor interactive:false/shot 分支。
- 删除 `chrome:"shot"`/`interactive`/locale 旧入口；chrome 只 full/embedded；`createEditor`/`createPreview` 契约按 `interfaces.md`。

## 范围

- editor 组装/骨架/DOM 作用域/服务实例化；destroy 清理；双实例。
- main.js boot：URL/本地项目/空 deck；单壳路由/切换；不再复制静态骨架。
- gallery：使用 createPreview 或共享 renderer；单壳 Home；不再独立双页面壳（保留 `/editor/` 兼容入口？3.0 无兼容，shell 路由）。
- 测试：双实例、destroy、chrome、单壳 Home→Editor→打开/导出、headless createPreview。

## 非目标

- 不改最小编辑功能（W7）。
- 不做保存原子化/PNG 双后端（W9）。
- 不改 CLI/contract（W10）。
- 不恢复 DSH/旧 session restore。

## 验收

1. 全量回归 + dep-graph/contract 绿；golden 无变化（渲染管线不变）。
2. `createPreview` 可用于画廊封面/headless；`createEditor` 自包含，空容器可用。
3. 双实例同时挂载互不污染；destroy 后无监听/图表/DOM 残留。
4. 单壳 Home/Editor 导航、文件菜单、主题一致；旧静态骨架不再必需。
5. chrome full/embedded 行为；无 locale/shot/interactive 旧入口。
6. 写入范围外零 diff；无新增依赖。

## 前置上下文

- 必读顺序：`ref/repo-map.md` → `ref/interfaces.md` §10.1/§10.3 → `ref/editor-ux.md` §7（顶栏/单壳）→ `ref/decisions.md` D1 → `handoff/W7-worker.md` → 本工单。
- 基线命令（开工先跑，贴真实输出）：`node tests/tools/dump-formula-mml.mjs`；`node tests/run-all.mjs` → 34/34；`node tests/e2e/editor-minimal.mjs` 21/21；`node tests/e2e/page-ops.mjs` 17/17；`node tests/e2e/render.mjs` 9/9；`node tests/e2e/incremental-load.mjs` 5/5；dep-graph；contract；`golden-diff`。
- 稳定区（勿重读/勿改）：`packages/**`、`tests/golden/**`、`tests/projects/**`、`tests/run-all.mjs`、`package.json`、`contract.json`、barrels。
- 现有事实（lead 已核实）：
  - `editor/editor.js` 的 `createEditor` 仍依赖 `editor/index.html` 静态骨架；`editor/dom.js` 是 document 级单例（mount-first + document fallback）；`app/toast.js` 与 `dialogs.js` 是模块级单例；`view/present` 已是工厂但读取全局 dom。
  - `editor/main.js` 负责 ?shot=1 / ?deck= / session restore / 空编辑器；`editor/gallery.js` 是独立页面（root index.html），封面直接 `renderPage`。
  - headless `editor/app/shot.js` 用 `createEditor(chrome:"shot", interactive:false)`；URL `/editor/?deck=...&shot=1` 被 `renderer/headless/shoot.js` 使用。
  - W7 已删旧编辑 UI；Design 面板/内容编辑器已动态 import。
- 已知坑：双实例必须真正隔离（DOM/监听/toast/dialog/theme/图表实例）；`createEditor` destroy 必须幂等；headless 渲染像素不得变化；e2e 固定 CDP 端口不要与 ui-shots 9247 冲突。

## 本波实施口径（lead 已拍板）

1. **骨架模板化**：新增 `editor/skeleton.js` 导出 `editorSkeletonHtml()` / `previewSkeletonHtml()`；`createEditor`/`createPreview` 把骨架 `innerHTML` 渲染进 rootEl。`editor/index.html` 只保留 `<div id="pptd-root"></div>` + `main.js`（不再有静态骨架）。删除 `dom.js` 的 document fallback 与模块级单例，改为 `createDom(rootEl)` 注入。
2. **服务实例化**：`app/toast.js` → `createToast(rootEl)`；`dialogs.js` → `createDialogs(override)` 实例（模块不再有 current 单例）；theme 注入/监听/Design 面板/内容编辑器都通过实例上下文（`ui = {dom, toast, dialogs, root, themeHost}`）传递。所有 editor 模块工厂接收该上下文；禁止再 import 全局 dom/toast/dialogs。
3. **createPreview**：`createPreview(rootEl, {source,deck?,deckUrl?,theme?,chrome?,on?})` 渲染预览骨架（canvas/thumbbar/zoom/页面计数/present，无编辑 topbar；chrome:"embedded" 无外围 chrome），加载/布局/绘制/翻页/缩放/平移/放映/live reload/主题明暗；返回 `{ready,destroy,view,io,state,goToPage,nextPage,prevPage,zoomIn,zoomOut,zoomReset,present,reload}`。实例级服务与 destroy 幂等。
4. **createEditor**：`createEditor(rootEl, {source,deck?,deckUrl?,theme?,chrome?,dialogs?,on?})` 内部先建 createPreview，再挂编辑层（选择/变换/内容编辑/页面操作/undo/Design/save/export），返回 `{ready,destroy,preview,editor,io,state}`；删除 `interactive`/`locale`/`chrome:"shot"` 入口；chrome 只 full/embedded。
5. **headless**：`editor/app/shot.js` 改为 `createPreview`（非交互），保留 `window.__pptdShot = {count,goto,width,height}` 契约与 URL `/editor/?shot=1`；渲染输出必须与 W7 逐字节一致（golden/render e2e 验证）。
6. **单壳**：`/editor/` 作为唯一应用壳（保留 headless URL）：无 `?deck=`/`?shot=` → Home（画廊视图，封面用 createPreview embedded）；`?deck=` → Editor；Home↔Editor 用同壳路由与同一文件菜单/主题。根 `index.html` 改为重定向到 `./editor/`（保留 query/hash），不再维护第二套 gallery 页面骨架；`showGallery` 重构为壳内 Home 视图。
7. **测试**：新增 `tests/e2e/preview-shell.mjs`（双实例 createEditor 同时挂载、destroy 互不影响、createPreview 封面/headless、chrome full/embedded、Home→Editor→打开/导出、无 locale/shot/interactive 旧入口）。浏览器缺失 SKIP+exit 0。现有 editor-minimal/page-ops/render/incremental-load 必须继续全过。
8. **不改渲染管线**：golden 零漂移；不改 packages/**。若必须改 renderer/headless 才能完成 headless createPreview，先停下报告（本波预期不需要，URL 与 shot 契约保持不变）。
