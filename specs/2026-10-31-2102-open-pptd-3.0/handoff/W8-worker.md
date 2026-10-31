# W8 handoff · createPreview / createEditor / 单壳
> 分支 `feat/3.0-w8-shell`，起点 `main a8f6c2a`（W1–W7 已合并）；Windows 10.0.28120 + Git Bash + Node v24.21.0；零新增依赖。写入范围仅 `editor/**` + 根 `index.html` + `tests/e2e/preview-shell.mjs` + 本文件（`git diff --name-only a8f6c2a` 证明范围外零 diff）。

## A. 自测真实输出
```text
# 开工基线（a8f6c2a）
$ node tests/tools/dump-formula-mml.mjs → KaTeX MathML 生成: 204/204
$ node tests/run-all.mjs → 结果: 34/34 通过 ✅
$ node tests/e2e/editor-minimal.mjs → 21/21 通过 ✅
$ node tests/e2e/page-ops.mjs → 17/17 通过 ✅
$ node tests/e2e/render.mjs → render 冒烟测试 9/9 通过 ✅（timeouts=0）
$ node tests/e2e/incremental-load.mjs → 5/5 通过
$ node tests/regression/dep-graph.mjs → ✓ 通过；node tests/contract/public-api.mjs → 契约通过 ✅
$ node tests/tools/golden-diff.mjs → 24 项目/156 页；字节一致 156；无未登记漂移
# 完工（最终代码重跑）
$ node tests/tools/dump-formula-mml.mjs → 204/204
$ node tests/run-all.mjs → 结果: 34/34 通过 ✅
$ node tests/e2e/editor-minimal.mjs → 21/21 通过 ✅
$ node tests/e2e/page-ops.mjs → 17/17 通过 ✅
$ node tests/e2e/render.mjs → render 冒烟测试 9/9 通过 ✅（timeouts=0）
$ node tests/e2e/incremental-load.mjs → 5/5 通过
$ node tests/e2e/preview-shell.mjs → 23/23 通过 ✅（Chrome 缺失 SKIP+exit 0）
$ node tests/regression/dep-graph.mjs → ✓ 通过；node tests/contract/public-api.mjs → 契约通过 ✅
$ node tests/tools/golden-diff.mjs → 黄金 diff 156/156 字节一致；0 未登记漂移 ✅
# 关键证据（preview-shell 实测值）
  双实例：titles ["A","B"]；DOM [thumb,thumb,#canvas,#canvas]=[1,1,1,1] 且 canvas 非同一节点；
          选择 ["t1",null]、sel-overlay [1,0]；改 A 模型后 B 文本仍 "实例B"；两实例均绘制。
  destroy：A 销毁两次（幂等）后 #inst-a 空、B 仍绘制且 addText 后 2 元素；再销毁 B 后 #inst-b 空。
  preview：embedded 无 topbar/thumbbar 且已绘制；full topbar+thumbbar+"1 / 1"+1 缩略图；
           headless 画布 640×360（deck 尺寸）、无骨架；契约键 10/10；destroy 后三容器皆空。
  单壳：Home 10 卡片（6 个封面由 createPreview embedded 绘制，96 个节点）；
       卡片 → "?deck=examples%2F…"（7 页/7 缩略图）；brand → Home（hook 移除）；
       File→新建空白 → "?blank=1"（1 页）；浏览器访问 /?deck=… → pathname "/editor/"、search 保留。
  旧入口：createEditor(chrome:"shot") 抛 `chrome 仅支持 "full" | "embedded"`；#gallery-view 不存在。
```

## B. 实现、删除清单、消费者证据、坑与偏差
**P1 骨架/服务实例化**：新增 `editor/skeleton.js`（`editorSkeletonHtml/previewSkeletonHtml/homeSkeletonHtml`）与 `editor/context.js`（`createUiContext`）。
`editor/index.html` 只剩 `#pptd-root` + CSS + `main.js`；`dom.js` 仅 `createDom(rootEl)`（无 document fallback、无模块单例、无 rebind）。
`app/toast.js` → `createToast(root)`；`dialogs.js` → `createDialogs(override)`（showDialog/closeAll 归实例）；`ui={root,dom,toast,dialogs,themeHost,themeMode,chrome,isActive,activate,destroy}` 贯穿 api/io/loader/live-reload/saver/font-manager/export-image/view/thumbnails/toolbar/keyboard/present/canvas/stage/内容编辑器/Design。
`coords.js` → `createCoords()`（LayoutTree 槽位实例级）；`icons.js` 删除 `bindIconMap` 单例（`preloadIcons/ensureIcon` 必须传 map）；Design 面板改 `createDesignPanel(ui)` 工厂（lazy → `createDesignPanelService(ui)`），面板 DOM/state/监听/数据缓存全归实例。
destroy 顺序：子绑定 → io/SSE → rAF/window → 图表 → chrome 恢复 → ctx（theme 监听/还原、dialogs、toast、dom）→ 清空 root；幂等。
**P2 createPreview**：`editor/preview.js` 导出 `createPreview` + 内部 `createPreviewCore`；返回 `{ready,destroy,view,io,state,goToPage,nextPage,prevPage,zoomIn,zoomOut,zoomReset,present,reload}`。
核心自带骨架渲染、加载→布局→绘制、翻页、缩放/平移、放映、live reload、明暗；chrome 仅 full/embedded（非法值抛错）。
`view.js` 合并为 `createView({editable,getController,coords,ui})` + `createPageView`（headless 绘制面）；thumbnails 支持 `editable:false` 且容忍无缩略条。
`app/shot.js` 改 `createPreview(...,{chrome:"embedded",headless:true})`，保留 `window.__pptdShot={count,goto,width,height}`、`pptdReady`、`/editor/?shot=1`；render 9/9 + golden 156/156 字节一致证明输出未变。
**P3 createEditor + 单壳**：`createEditor` = preview core（editor 骨架 + `editable:true`）+ 编辑层（canvas/stage/toolbar/keyboard/undo/Design/save/export），返回 `{ready,destroy,preview,editor,io,state}`；删除 `interactive`/`locale`/`chrome:"shot"`。
`main.js` 单壳：`?shot=1` → shot；`?deck=` → Editor；`?blank=1` → 空白 Editor；否则 Home；`pushState/popstate` 同页路由，brand 返回 Home（dirty 确认），File 菜单两视图共用 `createFileMenu` 与同一 `bindThemeMode`；移除 session restore 卡（授权仍在则直开，否则 toast 引导从 File 重开）。
`gallery.js` 重写为 `createHomeView`：卡片懒加载预取项目文本 → `createPreview(...,{chrome:"embedded",live:false})`，封面走同一管线；旧 `showGallery` 删除。
根 `index.html` 只做 `location.replace("./editor/"+search+hash)`（附 meta refresh 兜底），第二套 gallery 骨架删除。
**删除（无兼容层）**：`interactive`/`locale`/`chrome:"shot"` 入口、`createHeadlessView`、`showGallery`、`dom` 单例与 document fallback、`bindIconMap`、`configureDialogs/resetDialogs/dialogs` 模块单例、`resolveEditorTheme`、design-panel 单例导出、`body.presenting .app` 隐藏规则、`.shot-mode #editor-app`、`dom.editorApp`、`dom.pptdRoot`。
grep 证据：`grep -RIn "interactive|locale\b|chrome: \"shot\"|showGallery|bindIconMap|configureDialogs|#gallery-view" editor` 仅剩注释与测试断言。
**坑**：① 编辑器层必须先于 `core.destroy()` 释放，否则 core 清空 DOM 后子控制器再触碰节点。
② view 在 core 中先建、controller 后挂：用 `getController()` 访问器，否则 viewport 拿到 null。
③ 缩略条缺失（embedded preview）时 `renderThumbnails` 必须早退，否则 `disposeChartInstances(null)` 抛错（e2e 暴露）。
④ `io.newProject/openProjectHandle` 原先 `history.replaceState(pathname)` 会清掉 `?blank=`，改为只删 `deck` 的 `clearProjectUrl()`。
⑤ 双实例键盘/空格/Esc 用 `ui.isActive()` 仲裁（pointerdown/focusin 置顶），present 只隐藏自己的 root（`.pptd-presenting-hidden`）。
⑥ `httpSource.readMedia` 在首次 read 前用构造期 `deckUrl` 解析相对媒体（封面传预取文本、不触发 read）。
**偏差（需 lead 知悉）**：
1. 新增 shell 路由参数 `?blank=1`（spec 只有 deck/shot；空白编辑器需要可刷新路由）。
2. `createPreview` 的 `headless`/`live` 为内部选项（shot/画廊封面使用），不属 §10.1 公开契约。
3. 主题作用域：`chrome:"full"` 仍落 `document.documentElement`（editor-minimal 的 appearance 断言依赖它），`embedded/headless` 落实例 root；两个 full 实例同页时共享文档主题。
4. 模态/Design/present 覆盖层仍挂 `document.body`（fixed 定位），但每实例自持登记表并在 destroy 关闭，非模块单例。
5. `createEditor` 公开返回改为 `{ready,destroy,preview,editor,io,state}`（删除 `api`/`view` 键；e2e 仍经 `window.__pptdEditor=editor.editor`）。
6. `editor/index.js` 新增 `createPreview` 导出（W10 回写契约时确认）。
7. 单壳 `?blank=1` 与 `?deck=` 共存时 deck 优先；chrome 非法值直接抛错（不再静默降级）。

## C. 文件 / commit 指针
| commit | message |
|---|---|
| `822a97f` | refactor(editor): 骨架模板化与服务实例化（dom/toast/dialogs/theme/design） |
| `438c834` | feat(editor): 抽出 createPreview 预览核心，headless 改用非交互预览 |
| `938531e` | feat(editor): createEditor 基于 preview 核心 + 单壳 Home/Editor 路由 |
| （本文件） | docs(w8): 写 W8 交接 |
新增：`editor/skeleton.js`、`editor/context.js`、`editor/preview.js`、`editor/styles/preview.css`、`tests/e2e/preview-shell.mjs`。
修改：`editor/{editor,main,dom,dialogs,index,coords,gallery,index.html}`、`editor/app/{api,toast,keyboard,present,toolbar,export-image,view/{view,viewport,thumbnails},project/{io,loader,saver,live-reload,font-manager,icons,source,shot}}`、`editor/interaction/{canvas,stage,design-panel,design-panel-lazy,dialogs/{base,table-editor,chart-editor},excel-grid,text-editor}`、`editor/styles/present.css`、根 `index.html`。
未改 `packages/**`、`tests/run-all.mjs`、`package.json`、`contract.json`、`tests/golden/**`、`tests/projects/**`。
**探索审计（只读）**：specs 本组 repo-map/interfaces §10/editor-ux §7/decisions D1/08-W8/handoff W7；`packages/{server/index,renderer/headless/{shoot,cdp,browser},renderer/index,model/{index,theme*},measure,layout,writer}` 入口与相关片段；`tests/{run-all,contract/public-api,regression/{dep-graph,measure-consistency,export-media},e2e/{editor-minimal,page-ops,render,incremental-load},tools/{golden-diff,dump-formula-mml}}`；`editor/**` 全量（含样式与交互）。未全仓重读；未触碰主检出与其他 worktree。
**未决/后移**：保存原子化/RevisionConflict（W9）；ExportService/PNG 双后端与全局字体嵌入开关（W9/W10）；契约 3.0 回写（W10：createPreview 进 barrel/contract.json、编辑器返回键定稿）；画廊封面首屏预览数量可再做虚拟化；多 full 实例的文档主题若需隔离，应由宿主显式指定 themeHost。
