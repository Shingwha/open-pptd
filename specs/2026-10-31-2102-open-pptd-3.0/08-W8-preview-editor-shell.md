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

待 W7 合并后补：最小编辑器 API、Design 面板、W7 handoff、稳定区、已知坑。
