# Spec A7 · ui-restore：视觉回填 + U2-lite 功能移植（W4，接替被否的 spec 06）

> agent 代号 A7，分支 `feat/ui-restore`。
> 背景：spec 06（B2 减法信息架构）经用户实测**被否**——顶栏收成三下拉、fab 两圆钮被删，"不好看、用起来不方便"。`feat/ui-u2` 分支**整体不合并**，仅作移植素材库。本 spec 是 UI 方向的最终定案。
> 用户拍板记录：① 圆角等令牌值恢复原版（6/8/12px、轻投影）；② **选中态保持现状**（1px 环 + 4 方角点，不回退）；③ 精简范围：除顶栏 tab 栏与 fab 两钮外"其他看起来差不多"——即除令牌值回填外不做任何额外精简；④ 原版布局的其余部分（＋按钮/缩放控件/快调条/文件菜单）本来就未被 U1 触碰，保持原样即自动恢复。

## 目标

1. main 当前（post-U1/RP-A）的令牌**值**回填为原版观感（架构不动）。
2. 从 `feat/ui-u2` 移植**纯新增功能**到原版布局之上（U2-lite）。

## Part A · 令牌值回填（视觉回退，结构零改动）

- 以 `git show 9cd4906:editor/styles/tokens.css` 为值基座（旧令牌名 + 原值 + A2 的 dark 块）。要点：
  - 圆角恢复 `--radius-sm: 6px / --radius: 8px / --radius-lg: 12px`；阴影恢复 4 档轻投影（sm/md/lg/sheet 原值）；时长/控件高/字号等一并回原值。
  - **反向别名**：U1 引入的新令牌名（`--r-1/2/3`、`--sh-pop/modal`、`--f-xs…xl`、`--n-0…900`、`--hover/--active/--disabled/--sel-bg/--sel-ring/--on-accent`、`--paper` 如需）保留定义，但值改为指向回填后的旧令牌或与原版观感协调的值（如 `--r-1: var(--radius-sm)`）。**选中态令牌（--sel-ring 等）不动**——用户拍板保持现状。
  - dark 块同步：dark 下的旧令牌值用 9cd4906 dark 块（A2 版），新名别名在 dark 下同样指向。
  - `--n-*` 中性阶映射到原语义灰阶（--bg/--panel/--ink/--sub/--faint/--line/--line-strong），无对应的名字给协调值并注释。
- **禁改**：`editor/index.html` 顶栏结构、画布浮层（add-menu/fab-stack/zoom-ctl）、快调条项数、属性面板布局（原版铺开式）——这些在 main 上已是原版，一个字符都不许动（防止 feat/ui-u2 的布局改动渗入）。
- **选中态不动**：canvas.css 的选择环/4 角点/多选包围盒保持现状。

## Part B · U2-lite 移植（从 feat/ui-u2 摘取，read its commits as material）

移植素材：`git show feat/ui-u2:<path>` 与 `git log feat/ui-u2 --stat`。**不合分支、不 cherry-pick**（其基底含被否的 IA 改动），逐文件移植并适配 main 的原版布局：

| # | 功能 | 素材 | 适配要求 |
|---|---|---|---|
| B1 | 右键上下文菜单三态（单选/多选/空白） | `interaction/contextmenu.js`、`interaction/arrange.js`、`dialogs/page-background.js` | Menu 原语（components/）可用；接线适配 main 的 view.js/canvas.js（非 A6 改造版）；快捷键提示与禁用态逻辑照搬 |
| B2 | 缩略条升级：拖排序（可撤销）/页面多选（Shift 范围、Ctrl 切换）/右键菜单 | `app/view/thumbnails.js` 的 a06f3c5 功能部分 | 适配原版 thumbbar 样式（56×32 可留可调，以原版观感为准）；统计文案用原版式样 |
| B3 | 深浅色三态：浅/深/跟随系统 + localStorage 持久化 + prefers-color-scheme | `theme.js` 的 0c1d1a3 扩展 | **入口放原版「配色」面板内**（theme-panel 加三选一），不占顶栏 |
| B4 | 属性面板多选「混合」占位（值一致可批量编辑、不一致斜体只读） | `interaction/properties.js` 的 016c200 逻辑部分 | **不移植** details 折叠改版——保持原版铺开式面板 |
| B5 | 层序方向 bug 修复（moveLayer 数组方向与标签相反） | 5f6707b 中的修正 | 属性面板与右键菜单两处动作一致 |
| B6 | 内部剪贴板 Ctrl+C/V + `]` 置顶 / `[` 置底 | c68ecf6/5f6707b 的能力部分 | 只增不减；右键菜单的粘贴/置顶置底依赖它 |

## QA（完成前自测）

1. `node tests/run-all.mjs` 全绿（23/23，独立确认退出码）；`git diff main -- packages/` 为空。
2. **原版对照走查**：`git worktree add <临时目录> 9cd4906` 建只读对照检出（_report 后删除），两侧各起 serve 截图对比：① 编辑器主界面（顶栏布局/＋按钮/两圆钮/缩放控件逐项在位）；② 打开配色面板与一个对话框（圆角观感一致）；③ 深色模式（无破相）。顶栏必须与 9cd4906 结构一致。
3. 选中态截图确认未被改动（1px 环 + 4 角点）。
4. U2-lite 六项功能逐一手动用例打勾（右键三态、拖排序撤销、页面多选、三态切换、混合占位、层序方向、剪贴板）。
5. 画廊复验（令牌回填后无破相）。

## 禁触清单

`packages/**`（零 diff）、`editor/index.html` 顶栏与画布骨架、`editor/interaction/canvas.js` 选择态渲染（Part A 范围外不许动）、`editor/app/project/**`、`editor/dom.js`、`package.json`、`docs/specs/**`。
