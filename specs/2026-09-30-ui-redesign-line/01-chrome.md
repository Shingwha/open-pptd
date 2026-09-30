# Spec 01 · Chrome 地基（波次 W1，串行先行）
> 分支 `feat/ui-line-chrome`；前置：无；深读：`specs/2026-09-30-ui-redesign-line/00-overview.md`、`editor/styles/tokens.css`、`ref/dsh-theme-requirements.md`
> 状态：✅ 2026-09-30 已合并 @ feat/ui-line-chrome → main（5 commits）

## 目标

落地「细线 Line」的 chrome 层：令牌审计、控件原语细线化、顶栏收敛、**缩放控件并入缩略条右端**（D2）、FAB 白底细线（D5）。对外行为零变化（除 D2/D4 明确列出的交互删除项）。

## 工单（按序执行，每项一个 commit）

### T1 令牌审计与微调
- `editor/styles/tokens.css`：通读全部 8 个样式文件，确认颜色字面量只存在于 tokens.css（`present.css` 是放映投影面，白名单豁免，**不动**）。
- `--topbar-h: 48px` → `44px`（D6；检查 gallery 顶栏同步受益，无需改其它文件）。
- 若细线化需要新令牌（如 `--line` 已够则不加），只允许**新增**，禁止重命名/删除既有令牌（DSH 契约面）。

### T2 控件原语细线化（primitives.css）
- 输入框/下拉/按钮：白底 + 1px `var(--line-strong)` 边（hover 变 `--sub`），focus 1px accent 实线环（不用外发光 shadow）；去填充式 hover 大块色。
- 图标钮 `.icon-btn`：透明底，hover `--hover` 圆形底；尺寸保持。
- `.btn`（顶栏文字钮）：ghost 化——透明底、无边框，hover 浅灰底；`放映` 主钮保持 accent 填充（唯一的彩色常驻控件）。
- 下拉菜单/对话框：保留 `--shadow-md/lg`，这是 D1 允许的唯二投影场景。
- 滚动条、toast、badge 等顺带对齐（toast 左侧色条保留）。

### T3 顶栏收敛（index.html + loader.js）
- D4：`editor/app/project/loader.js:54` 附近——`brand-file` 文本改为项目文件名（`deck.pptd` 的 basename），完整路径/URL 写入 `title`；空项目保持灰「未命名」。
- 状态簇整理：`.tb-status` 与 actions 的间距统一；分隔线 `.topbar-divider` 可删则删（undo/redo 与文件组之间最多留一条）。
- 顶栏总高随 T1 的 44px；内部控件垂直居中，左右 padding 12px。
- `网页模式` 提示是条件显示（恒真才显示），保留。

### T4 缩放控件并入缩略条（核心）
- `editor/index.html`：`#zoom-ctl` 整体从 `main#stage` 移至 `footer.thumbbar` 右端 `.thumbbar-meta` 内，顺序：`btn-zoom-out → zoom-label → btn-zoom-in → (sep) → btn-zoom-reset(⛶) → 页数`。按钮 id 全部保留（对外钩子，见总纲 #7）。
- **删除** `editor/app/view/zoom-ctl.js`（整文件）及 `editor/editor.js` 中的 import/调用行；删除 localStorage 键 `pptd.zoomCtlPos` 的读写（整机制不存在了）。
- `editor/app/toolbar.js:131-133` 绑定保持（id 不变）；`zoom-label` 的 title 改为「双击还原适配视图」，并绑定 dblclick → `view.zoomReset()`（替代原 dblclick 归位语义）。
- 样式：`.zoom-ctl` 从「悬浮卡片」改为缩略条内的普通内联组——无阴影、无背景、1px 左边线或仅间隙分隔；控件 28px。样式写在 primitives.css（.zoom-ctl 区整体重写），canvas.css 中如有残留 zoom 样式删除。
- `editor/app/view/view.js`：**仅删除** quickbar 定位里的 zoom-ctl 碰撞避让块（约 233-243 行，`dom.zoomCtl.getBoundingClientRect()` 那段），其余不动。
- 手势不动：Ctrl/⌘+滚轮、双指捏合、空白双击适配照常。

### T5 FAB 细线化 + 全量校验
- `.fab`（primitives.css）：白底 + 1px `--line-strong` 边 + `--ink` 图标，hover `--hover`；激活态（面板开/菜单开）实心 `--accent` + 白图标。尺寸/位置/动效不变。
- 回归：`node tests/run-all.mjs` 全绿；`node --check` 所有改动的 js 文件；grep 确认无 `zoom-ctl.js`、`pptd.zoomCtlPos` 残留引用（`editor/` 内）。
- 浏览器手测（如愿意）：编辑器打开、缩放三键与 dblclick、窄屏不炸——可选，用户终测。

## 验收（完成前自测，报告真实结论）
1. `node tests/run-all.mjs` 全绿（独立 `echo $?`）
2. `node --check` 每个改动 JS；`grep -rn "zoom-ctl\.js\|pptd\.zoomCtlPos" editor/` 仅命中本 spec 允许的注释（最好为零）
3. `grep -rnE "#[0-9a-fA-F]{3,8}" editor/styles/ | grep -v tokens.css | grep -v present.css` 零命中（颜色只活在 tokens.css）
4. 字节级对比：列出 T2/T5 前后 primitives.css 的类清单（增/删/改）

## 禁触清单
`editor/styles/{canvas,inspector,panels,responsive}.css`、`editor/app/view/view.js` 除碰撞块外、`editor/ui.js`、`editor/interaction/*`、`editor/types/*`、`editor/theme.js`、`editor/gallery.js`、根 `index.html`、`packages/`、`tests/`（本波不加测试）。

## 最终报告格式
工单状态表 / commit 清单（hash+message）/ 自测真实输出结论 / 偏差与取舍 / 未决问题
