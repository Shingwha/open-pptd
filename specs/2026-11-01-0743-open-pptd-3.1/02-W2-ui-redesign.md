# W2 · 前端整体视觉重构（编辑器 + 画廊）

> 分支/前置：W1 已合并；写入范围 `editor/skeleton.js`、`editor/styles/**`、`editor/gallery.js`、`editor/interaction/design-panel.js`、`editor/app/{toolbar,file-menu}.js`、`editor/components/**`、`editor/dom.js`（仅视觉相关）、`tests/tools/ui-shots.mjs`、`tests/e2e/**`（选择器同步）、`docs/images/editor.png`（截图）。
> 本波只改视觉/布局/文案层级，不改引擎、导出、保存、编辑操作语义。

## 目标

按 `ref/design-direction.md` 的 Paper & Ink 方向重做编辑器与画廊：
- 新 token（纸/墨/朱砂、字体阶、间距、圆角、发丝线）；深浅色两套；删除未使用 legacy 别名（仍被引用的先替换）。
- 编辑器：56px 顶栏（品牌/文档名/状态/undo-redo/文件/设计/放映）、纸色画布桌面、精选缩略条、选中操作条（W1 已加）、底部居中 toast、右侧 Design 抽屉、干净的添加菜单/文件菜单/页面菜单。
- 画廊：编辑感 masthead + 大标题、筛选 tabs、3/2/1 列作品网格、封面下方元信息、空状态；删除旧卡片入场动画/装饰。
- 响应式：≥1200 / 760–1199 / <760 三档；Design 抽屉全宽；对话框底部抽屉。
- README 展示图重生成：`tests/tools/ui-shots.mjs` 产出 `docs/images/editor.png`；如新增 gallery 截图，更新 README 引用。

## 范围

- `editor/styles/tokens.css` 重写；`primitives/layout/canvas/forms/panels/present/responsive` 收敛；可拆 `gallery.css`/`design.css`。
- `editor/skeleton.js` 结构与 class（保留契约 id/class，见 `ref/interfaces.md` §3.1）。
- `editor/gallery.js` Home 卡片/tabs/masthead；`design-panel.js` 视觉；`toolbar/file-menu/components` 弹层与按钮。
- e2e 选择器/文案同步（页面菜单 7 项、`#page-count`、`.thumb`、`.sel-overlay/.member`、`.design-*` 等）。
- 截图与对比度抽验（浅/深、桌面/窄屏）。

## 非目标

- 不改 createPreview/createEditor API、渲染管线、golden、导出/保存、CLI、skill。
- 不引入外部字体/图标/UI 库；不加渐变/玻璃/重阴影。
- 不恢复已删除的编辑 UI（属性面板/右键/组合/对齐/层级/页面批量）。

## 验收

1. `run-all` 39/39；dep-graph/contract；golden 零漂移。
2. e2e：editor-minimal 21/21、page-ops 17/17、preview-shell 23/23、browser-export 15/15、incremental 5/5、editor-ops（W1）全过；选择器同步修改后无跳过。
3. 浅色/深色、1440×900/480×840 截图；正文对比度 ≥7:1、次要 ≥4.5:1、按钮 ≥4.5:1（抽验记录）。
4. 旧设计死规则/死 id 清理（`.chart-body`、`.gallery-page`、`.panel-hint`、`.pptd-tooltip`、`.thumb.multi`、`#editor-app`、`#gallery-toolbar` 等）；无渐变/backdrop-filter。
5. 写入范围外零 diff；无新增依赖。

## 前置上下文

- 必读顺序：`ref/design-direction.md`（视觉系统全文）→ `ref/interfaces.md` §2–§4 → `handoff/W1-worker.md` → `handoff/W7-worker.md`（最小编辑器 DOM）→ `handoff/W8-worker.md`（单壳/实例）→ 本工单。
- 基线命令（开工先跑，贴真实输出）：`node tests/tools/dump-formula-mml.mjs`；`node tests/run-all.mjs`（39/39）；`node tests/e2e/{editor-minimal,page-ops,editor-ops,preview-shell,incremental-load}.mjs`；`node tests/e2e/browser-export.mjs`；dep-graph；contract；`golden-diff`。
- W1 已交付：`#sel-actions`（复制/重复/删除）在 `#canvas-wrap` 内，`.sel-action[data-action]`；Ctrl+C/X/V、Ctrl+Shift+V、Ctrl+D；API copy/cut/paste/duplicate。W2 必须保留这些 DOM/API，只重做样式与定位观感。
- 现有 e2e 端口：editor-minimal 9341、page-ops 9342、preview-shell 9343、editor-ops 9344、ui-shots 9247；不要并行冲突。
- 强制 DOM 契约：见 `ref/interfaces.md` §3.1（`[data-element-id]`、`[data-handle]`、`[data-rotate-handle]`、每实例唯一 `#canvas`、`.sel-overlay/.member`、`footer.thumbbar`、`.topbar`、`.brand-home`、`.thumb`、`#page-count` 文本、页面菜单 7 项文案、`#btn-add/#add-list` 三项顺序、`.design-*` 类、`.gallery-view/.gallery-card/.gallery-card-canvas .pptd-preview`、旧 id 不得复活）。
- 现状可删死规则：`.chart-body`、`.gallery-page`、`.panel-hint`、`.pptd-tooltip`、`.thumb.multi`、`#editor-app`、`#gallery-toolbar`；`tokens.css` 的 legacy 别名只有 `--primary*` 与 `--h-sm` 仍被引用，其余零引用；注释/标题有过期项（`primitives.css` 重复标题/残句、`panels.css` base.css 引用、`tokens.css` BP_NARROW 等）。
- 截图：`node tests/tools/ui-shots.mjs` 默认输出 `tests/ui-shots-out/`（gitignored），产出 editor.png/editor-addmenu.png/editor-narrow.png/gallery.png/gallery-narrow.png；用新截图替换 `docs/images/editor.png`（README 引用），gallery 截图按需新增并更新 README。
- 稳定区（勿改）：`packages/**`、`editor/preview.js`、`editor/editor.js`、`editor/main.js` 的行为、`tests/golden/**`、`tests/projects/**`、`tests/contract/**`、`contract.json`、`skill/**`。
- 已知坑：id 找不到静默失效；`stage.js` FLOATING 需包含新浮层；`.thumb` 尺寸与 `thumbnails.js` 常量耦合；toast 的 `top` 依赖 topbar 高度；900px 断点会隐藏 `.btn-label`；gallery tab 指示器由 JS 写 left/width；封面容器会被 createPreview 整体替换；destroy 必须清空 portal/遮罩/监听。
