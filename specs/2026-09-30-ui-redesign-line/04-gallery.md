# Spec 04 · 画廊细线化 + 主题三态（波次 W4）
> 分支 `feat/ui-line-gallery`；前置：W1 已合并；深读：`00-overview.md`、根 `index.html`、`editor/gallery.js`、`editor/app/file-menu.js`、`editor/styles/panels.css` gallery 区块（5-273 行）
> 状态：✅ 2026-09-30 已合并 @ feat/ui-line-gallery → main（4 commits）

## 目标

画廊同步 D1 细线语言；落地 D7：画廊响应编辑器同一套主题三态（`pptd.themeMode` localStorage 键共享），`applyThemeTokens` 注入对画廊根生效（DSH 会把画廊也挂在 iframe 里）。

## 工单（按序执行，每项一个 commit）

### T1 画廊 markup 与主题接根（根 index.html + gallery.js）
- 根 `index.html`：`<html>` 或 `.gallery-view` 容器接 `data-pptd-theme`（跟随 `editor/theme.js` 的既有机制：读 `localStorage["pptd.themeMode"]` → light/dark/auto，`auto` 挂 `prefers-color-scheme` 监听）。
- 复用 `editor/theme.js` 的 `bindThemeMode`（若其参数与画廊生命周期不合，则在 gallery.js 内写一个 20 行内的小绑定，**禁止复制 tokens 值**）；页面 unload/隐藏无需清理监听亦可接受（画廊无 destroy 语义）。
- 画廊卡片渲染画布（.gallery-page）保持 `--paper` 浅色页（tokens 已定义 dark 下 --paper 仍浅，无需处理）。

### T2 文件菜单加「外观」（file-menu.js 或 gallery.js 内菜单）
- 画廊「文件」菜单（gallery.js:208-222 的 createFileMenu）追加「外观」子项：浅 / 深 / 跟随系统 三选一（checkmark 当前值）；与编辑器配色面板里的三态读写**同一个 localStorage 键**。
- 菜单交互遵循现有 createFileMenu 的模式；不改编辑器侧文件菜单的既有项。

### T3 画廊视觉细线化（panels.css gallery 区块）
- 顶栏：随 W1 的 44px `--topbar-h`；品牌区与编辑器一致（`OPEN PPTD` + 灰色「作品画廊」胶囊）。
- 分类分段控件 `.gallery-tabs`：白底 1px `--line-strong` 边、indicator 保持 accent 滑块（动效不动）；计数 `--faint`。
- 卡片：白底 + 1px `--line` 边（hover 变 `--line-strong` + translateY(-2px) 保留）、`--radius` 8px、**去掉阴影**（D1：投影只留给下拉/对话框）；封面保持 16/9、海报 3/4；页数徽章细线化。
- 卡片信息区：标题 13px medium、desc 12px `--sub`、tag 11px `--faint` 描边 pill（去填充底色）。
- 模式徽章（本地/线上）：圆点 + 文字，去填充底色，warning 语义色保留。
- 空状态：虚线框 `--line-strong`。
- 入场动画保留（`prefers-reduced-motion` 关闭已有，不动）。

### T4 回归
- `node tests/run-all.mjs` 全绿（独立 `echo $?`）。
- 静态验证：画廊在 dark 下令牌可生效——`grep -n "data-pptd-theme" editor/gallery.js 根 index.html` 有命中；`grep -rnE "#[0-9a-fA-F]{3,8}" editor/styles/panels.css` 零命中（gallery 区块；如 panels.css 其它区块有存量字面量，记录但不在本波修，上报 lead）。

## 验收
1. `node tests/run-all.mjs` 全绿
2. 主题三态：改 localStorage `pptd.themeMode=dark` 刷新画廊 → `<html data-pptd-theme="dark">`（静态代码路径成立即可，视觉由 lead 终验）
3. 菜单含外观三项；与编辑器共用同一键（grep `pptd.themeMode` 命中两处共用 theme.js 常量而非字面量重复）
4. gallery 区块无颜色字面量、无 box-shadow（除白名单说明）

## 禁触清单
`editor/styles/{tokens,primitives,layout,canvas,inspector,responsive}.css`、`editor/index.html`（编辑器页）、`editor/app/view/*`、`editor/interaction/*`、`editor/theme.js`（可读不可用改；若确有 bug 上报 lead）、`packages/`、`examples/`、`tests/`。

## 最终报告格式
工单状态表 / commit 清单 / 自测真实结论 / 偏差与取舍 / 未决问题
