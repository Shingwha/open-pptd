# W2 handoff · Paper & Ink 前端视觉重构（编辑器 + 画廊）

> 分支 `feat/3.1-w2-ui`，起点 `main 71e4f1b`（W1 已合并）；Windows 10.0.28120 + Git Bash + Node v24；本机 Chrome；零新增依赖。写入范围仅 `editor/**`、`tests/tools/ui-shots.mjs`、`docs/images/**`、`README/README.zh-CN`（截图引用）、本文件。`git diff --name-only 71e4f1b -- tests/e2e packages tests/golden tests/projects tests/contract contract.json skill package.json` 结果为空（e2e 零修改、引擎/黄金/契约零 diff）。

## A. 自测真实输出

```text
# 基线（71e4f1b，开工前）
$ node tests/tools/dump-formula-mml.mjs → KaTeX MathML 生成: 204/204
$ node tests/run-all.mjs → 结果: 39/39 通过 ✅
$ node tests/e2e/{editor-minimal,page-ops,editor-ops,preview-shell,incremental-load,browser-export}.mjs
  → 21/21、17/17、22/22、23/23、5/5、15/15 通过 ✅
# 完工（最终代码重跑）
$ node tests/e2e/editor-minimal.mjs → 21/21 通过 ✅
$ node tests/e2e/page-ops.mjs → 17/17 通过 ✅
$ node tests/e2e/editor-ops.mjs → 22/22 通过 ✅（#sel-actions / .sel-action[data-action] 契约原样）
$ node tests/e2e/preview-shell.mjs → 23/23 通过 ✅（Home 新结构下卡片/封面/双实例全过）
$ node tests/e2e/incremental-load.mjs → 5/5 通过 ✅
$ node tests/e2e/browser-export.mjs → 15/15 通过 ✅
$ node tests/run-all.mjs → 结果: 39/39 通过 ✅
$ node tests/regression/dep-graph.mjs → ✓ 依赖方向与环境全局检查通过（豁免 3 处不变）
$ node tests/contract/public-api.mjs → 结果: 契约通过 ✅
$ node tests/tools/golden-diff.mjs → 24 项目/156 页；字节一致 156、感知一致 0；无未登记漂移 ✅
$ node tests/regression/ui-token-literals.mjs → 6/6 通过 ✅（扫描 9 个文件；色值仅在 tokens.css）
$ node tests/tools/ui-shots.mjs → 14 张：editor / editor-dark / editor-addmenu / editor-file / editor-design
  / editor-design-colors / editor-design-fonts / editor-dialog / editor-narrow / editor-dialog-narrow
  / gallery / gallery-dark / gallery-poster / gallery-narrow（输出 tests/ui-shots-out/）
```

对比度抽验（WCAG 相对亮度计算，浅 / 深）：正文 ink/paper **15.70 / 14.81**、ink/panel **17.12 / 13.83**；次要 sub/paper **5.09 / 8.09**、sub/panel **5.55 / 7.55**；按钮 on-accent/accent **4.88 / 5.26**、放映 panel/ink **17.12 / 13.83**；danger/panel **6.43 / 5.21**、danger/danger-soft **5.30 / 4.71**；success/panel **6.19 / 8.00**。`--faint` 仅用于禁用/covered 等非活动态（浅 2.69 / 深 4.22），不作正文或次要文案。
截图观察（`tests/ui-shots-out/`）：浅色 1440 顶栏 56px、缩略条 88px、白纸居中四边留白 ≥32px、状态仅“已保存”一项；深色 paper #161513 / panel #1D1C19、画布仍为白纸、缩略卡白纸不反色；480×840 顶栏图标化（品牌 + undo/redo/文件/设计/放映）、72×41 缩略卡、页码在卡下；poster tab 3 列 3:4 封面、无溢出；Design 抽屉 420px、tabs 2px 下划线、颜色表 16 行紧凑；内容编辑器 720px 网格 + 发丝线侧栏，窄屏底部抽屉单列。

死规则/死 id 清理证据：`git grep -nE "chart-body|gallery-page|panel-hint|pptd-tooltip|thumb\.multi|gallery-toolbar|gallery-tab-indicator|editor-app" -- editor` → 无；`git grep -nE "linear-gradient|backdrop-filter" -- editor/styles` → 无声明（仅注释说明禁用）；反向扫描 CSS 类在 JS/HTML 无引用 → 仅 `page-error`（packages/renderer 生成）与动态 `toast-*`。

DOM 契约未变（e2e 实测）：`[data-element-id]`、`[data-handle]/[data-rotate-handle]`、每实例唯一 `#canvas`、`.sel-overlay`+`.member`、`#page-count` "N / M"、`footer.thumbbar/.topbar/.brand-home`、`.thumb`+`.thumb.active[data-page-index]`、`#btn-add-page`、`#btn-page-menu`、`.page-menu .mi` 7 项、`#btn-add`+`#add-list .add-item[data-add-type]` 顺序 text/table/chart、`#btn-design`+`.design-*`、禁止回归的旧 id 全无、`.gallery-view/.gallery-card/.gallery-card-canvas .pptd-preview[data-chrome=embedded]`、`#gallery-view` 不存在、`window.__pptdEditor/__pptdIo/__pptdShot/__pptdTheme`、W1 的 `#sel-actions/.sel-action[data-action]`；全部由 21/17/22/23/5/15 条断言复跑通过。

## B. 实现、删除、坑与偏差

**P1 tokens（`styles/tokens.css` 重写）**：`--paper #F6F3EC` / `--panel #FFFDF8` / 新增 `--canvas #FFFFFF`（深色也保持白纸，deck 不随 UI 翻转）；ink/sub/faint/line/line-strong、accent #C2472E（深 #E06A4F）、on-accent、danger/success/warning 及 soft；字体 `--font-ui/--font-display/--font-mono`；字号 11/12/13/14/16/20/28/44；间距 4/8/12/16/24/32/48；圆角 4/6/10；控件 32/28/40；`--topbar-h 56`、`--thumbbar-h 88`、`--thumb-w/h 112/63`、`--drawer-w 420`；阴影四档 + `--shadow-pop`（画布用设计稿双层 `0 1px 2px…, 0 12px 32px…`）；motion 120/180ms ease-out；另设 deck 专用 `--font-deck`（3.0 旧栈，Microsoft YaHei 优先）与 `--ink-deck #1c2532`，保证绘制面不随 UI 字体/墨色变化。删除零引用别名 `--f-*/--r-*/--sh-*/--t-*/--n-*/--h*/--primary/--primary-strong`；保留 `--bg→paper`、`--font→font-ui`、`--mono` 与 `--primary-soft/--primary-tint`（后者只因 ui-token-literals 冻结白名单要求 panels.css 两条 inset 表达式逐字保留）。
**P2 编辑器**：顶栏 56px 单行（衬线 `OPEN/PPTD`、文档名 sub 截断、状态点 已保存/未保存、undo/redo、文件/设计、ink 实底 放映、GitHub 细图标）；画布区 paper 桌面 + 白纸 + 轻阴影、无网格；选中 1.5px accent 环、8px 白底手柄、成员细框 sub、整体框 accent 虚线、参考线 accent 1px 虚线；选中操作条 32px 图标按钮（panel+line+轻阴影，W1 定位逻辑未改）；缩略条 88px paper + 发丝线、`thumb-item`（卡片 112×63 + 卡片下页码）、当前页 2px accent、虚线 ＋ 卡、右侧纯文字缩放组与页码；添加 44px ink 圆形 + 三行细图标菜单；文件菜单分组发丝线、快捷键右对齐等宽；Design 抽屉 420px（文字 tabs + 2px 下划线、6 枚 12px 主题圆点、紧凑颜色令牌表、字体行状态点、三枚文字外观按钮）；toast 底部居中（编辑器内浮在缩略条上，`html:has(.thumbbar)`）；对话框最大 560px、衬线 20px 标题、右对齐底部按钮、遮罩 0.32；内容编辑器统一 `.field-input` 行输入（ui.js 仅加类）。
**P3 画廊**：masthead（`Presentations, / not templates.` 衬线 clamp 34–52 + 中文副题）+ 右侧纯文字 tabs（accent 2px 下划线，JS 滑块/入场动画/`--card-i` 全删）+ 运行模式小圆点；网格 3/2/1 列、gap 24；卡片无外框、封面 6px 圆角 + 1px line、hover 上移 2px + 轻阴影；封面下标题 14/页数 11、描述 2 行、标签 11px 中点分隔（无胶囊）；空状态衬线标题 + 一句提示 + 动作按钮（无作品→新建空白；分类空→查看全部，事件委托在 grid）；保留 `.gallery-view/.gallery-card/.gallery-card-canvas + createPreview`。
**P4 响应式**：≥1200 / 760–1199（96×54、画廊 2 列、文档名截断）/ <760（控制 36px 触控、52px 顶栏只留品牌+undo/redo+文件/设计+放映图标、72×41 缩略卡、缩放组隐藏、画廊 1 列、抽屉全宽、对话框底部抽屉、表格编辑器单列）；浅/深两套均逐屏截图检查（1440×900、480×840）。
**偏差（需 lead 知悉）**：① <760 保留「放映」图标（设计 §7 只列品牌/undo/redo/文件/设计；触屏无 F5，删掉会失去唯一主操作入口），同时隐藏 GitHub/状态簇。② 表格/图表编辑器对话框在桌面放宽到 720px（`.dialog:has(...)`，限 `min-width:760px`）：设计 560px 装不下 640px 宽图表编辑器；窄屏仍是全宽底部抽屉。③ 状态簇新增「已保存」（live-reload 同时切换 saved/dirty），新增 `#status-saved`（无 e2e 依赖）。④ 缩略图加 `.thumb-item` 包裹以把页码放卡片下方；`.thumb`/`.thumb.active[data-page-index]` 契约与测量盒不变，拖拽/refreshThumb 已同步。⑤ Gallery tabs 改为纯 CSS，删除滑块 JS/resize/fonts.ready 重排；卡片入场动画删除。⑥ 空状态新增动作按钮。⑦ ui.js 仅给 input/select 加 `.field-input` 类。⑧ toast 在编辑器内抬到缩略条上方。⑨ README 增加 gallery 截图引用（README 仅此两行）。
**删除清单**：legacy 令牌别名 `--f-*/--r-*/--sh-*/--t-*/--n-*/--h/--h-lg/--h-sm/--primary/--primary-strong/--font-ui 别名`（零引用）；死规则 `.chart-body/.gallery-page/.panel-hint/.pptd-tooltip/.thumb.multi/.gallery-toolbar/.gallery-tab-indicator/.gallery-card-in` 与 `#editor-app` 引用；死注释（primitives.css 重复文件头、dialogs 前未闭合注释）；gallery 滑块 JS + resize/fonts.ready 监听 + `--card-i`；skeleton 的 `id=editor-app`、`#gallery-body/#gallery-toolbar` 与首页“作品画廊”副标签；`.data-table` 覆盖单元格的重复渐变改纯色。
**坑**：`display:inline-flex` 会压过 UA 的 `[hidden]`（status-saved/dirty 需显式 `[hidden]` 规则）；`:has()` 特异性高于 `body .dialog`，编辑对话框宽度必须放在桌面媒体查询里；`.thumb` 尺寸由 clientWidth/Height 实测，包裹层不得改卡片盒；参考线虚线用 border 而非渐变；Design 抽屉滚动位置会跨 tab 保留（截图工具已复位）。

## C. 文件 / commit 指针

| commit | message |
|---|---|
| `f15c677` | feat(editor): 重写 Paper & Ink 设计令牌（纸/墨/朱砂、字体阶、圆角与发丝线） |
| `4a7faa6` | feat(editor): 编辑器视觉重构（56px 顶栏、纸面画布、112×63 缩略卡、Design 抽屉与统一弹层） |
| `806af50` | feat(gallery): 画廊 masthead、文字筛选 tabs、三/二/一列作品网格与空状态 |
| `3220024` | feat(editor): 三档响应式与窄屏对话框/抽屉适配 |
| `889fc3a` | test(ui): 扩展截图流水线（浅/深/窄屏/抽屉/对话框）并更新 README 展示图 |
| （本提交） | fix(editor): deck 绘制面固定字体与默认墨色，避免 UI token 影响渲染 |
| （本文件） | docs(w2): 写 W2 交接 |

新增：`editor/styles/{gallery,design}.css`、`docs/images/gallery.png`；`docs/images/editor.png` 由 ui-shots 重生成（青山咖啡 12 页，含选中操作条）。修改：`editor/styles/{tokens,primitives,layout,canvas,forms,panels,present,preview,responsive}.css`、`editor/{skeleton,dom,ui,gallery,index}.{js,html}`、`editor/app/project/live-reload.js`、`editor/app/view/thumbnails.js`、`tests/tools/ui-shots.mjs`、`README.md`、`README.zh-CN.md`。未改 `packages/**`、`tests/e2e/**`、`tests/golden/**`、`tests/projects/**`、`tests/contract/**`、`contract.json`、`skill/**`、CLI、`package.json`。
**探索审计（只读）**：`specs/2026-11-01-0743-open-pptd-3.1/{ref/design-direction.md,ref/interfaces.md,02-W2-ui-redesign.md}`、`specs/.../handoff/W1-worker.md`、`specs/2026-10-31-2102-open-pptd-3.0/handoff/{W7,W8}-worker.md`；`editor/{skeleton,dom,gallery,main,theme,ui,popover,dialogs}.js`、`editor/app/{toolbar,file-menu,page-menu,toast,shot,present}.js`、`editor/app/view/thumbnails.js`、`editor/app/project/{loader,live-reload}.js`、`editor/interaction/{design-panel,add-menu,canvas}.js`、`editor/components/menu.js`、`editor/styles/*.css`、`tests/regression/ui-token-literals.mjs`、`tests/e2e/{editor-minimal,page-ops,editor-ops,preview-shell}.mjs`、`tests/tools/{ui-shots,golden-diff}.mjs`。未全仓重读；未触碰主检出与其他 worktree。
**未决**：deck 专用 token `--font-deck/--ink-deck` 已与 UI 解耦（golden 已回到 156/156 字节一致）；Home 空状态无 e2e 夹具（无 examples 场景仅手测 CSS）；内容编辑器仍用原生 color input；`--canvas` 为新 token，宿主若只覆写 `--paper` 不会改变 deck 纸面。
