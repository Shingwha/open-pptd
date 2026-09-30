# Spec 02 · 选中浮条重做（波次 W2）
> 分支 `feat/ui-line-quickbar`；前置：W1 已合并；深读：`00-overview.md`、`editor/app/view/view.js`（renderQuickbar 164-244）、`editor/types/*.js` 的 `quickbar()` 分片、`editor/ui.js:261-275`、`editor/styles/canvas.css` quickbar 区
> 状态：✅ 2026-09-30 已合并 @ feat/ui-line-quickbar → main（4 commits）

## 目标

选中浮条（quickbar）按 D3 收敛：**去掉文字标签与冗余项**，每类型只留核心属性控件 + `⋯`（打开属性面板）+ 删除图标钮；视觉为细线白底条。功能语义不变（所有被删控件在属性面板/右键菜单中仍有入口）。

## 当前清单（要改什么）

| 类型 | 现状（view.js + types/*.js quickbar 分片） | 目标 |
|---|---|---|
| text | 字体▾ 字号▾ B I 对齐▾ 颜色▾ + 文字标签×5 + 删除 | 去标签，保留 字体▾ 字号▾ B I 对齐▾ 颜色▾ |
| shape | 填充▾ 边框▾ 边宽▾ + 标签×3 + 删除 | 去标签保留三项 |
| image | 适配▾ + 标签 | 保留 |
| icon | 颜色▾ 更换 | 保留（「更换」改图标钮，title 保留） |
| line | 线宽▾ 颜色▾ 箭头▾ + 标签×3 | 去标签保留三项 |
| table | 数据…（文字钮） | 保留 |
| chart | 类型▾ 数据… | 保留 |
| group | 无 | 仅徽章 |

冗余删除项（W2 范围内）：每项前的 `h.label("字体")` 等文字标签（`title` 提示已够，桌面心智）；行尾文字「删除」改图标垃圾桶钮（title=删除）。`⋯` 为新控件：点击 = 打开属性面板（桌面 `body` 移除 `inspector-collapsed` / 窄屏加 `inspector-open`）。

## 工单（按序执行，每项一个 commit）

### T1 控件工厂与渲染（ui.js + view.js）
- `editor/ui.js` quickbar 工厂：补齐图标删除钮工厂（或在 view.js 内联 SVG，遵循现有 inline SVG 惯例）；所有 quickbar 控件高度 28px、无边框底色、分隔用 1px 间隙或细分隔线。
- `editor/app/view/view.js renderQuickbar`：移除 label 渲染；组成为 `[类型徽章] [类型核心控件…] [⋯] [删除]`；徽章缩小为 11px 字高的浅底 chip。
- 位置逻辑保持：选中元素上方居中、越界翻转、窄屏由 CSS 接管。**碰撞避让块已由 W1 删除，不要恢复。**

### T2 类型分片收敛（types/*.js）
- 逐类型按上表改 `quickbar()` 分片：删 `h.label(...)`，保留下拉/B/I/颜色；title 文案保留（hover 承载说明，符合用户偏好）。
- 「更换」「数据…」改图标钮（表格/图表用画笔/网格类 16px 图标，inline SVG，stroke currentColor）。
- 不改 `props()/menu/create`，只动 quickbar 分片。

### T3 样式与窄屏（canvas.css）
- `.quickbar`：白底、1px `var(--line-strong)` 边、`--radius-sm` 圆角、无投影、padding 4px 6px、gap 4px；`--z-dropdown` 不变。
- 控件内 select 宽度收紧（字体名下拉 max-width ~150px）；颜色控件保持色块+箭头。
- 窄屏：由 W5 整饰，本波不动 responsive.css；仅保证桌面不回归。

### T4 回归
- `node tests/run-all.mjs` 全绿（独立 `echo $?`）；`node --check` 改动文件。
- 手动/静态核对：每个类型选中后浮条只含目标控件（可用 `node bin/open-pptd.js serve --port 8931` 自测，可选）。

## 验收
1. `node tests/run-all.mjs` 全绿
2. grep：`editor/types/*.js` quickbar 分片中无 `h.label(`
3. view.js 中 `⋯` 与删除钮存在，删除的是图标钮不是文字「删除」
4. 浮条控件总数：text ≤7、shape ≤3、line ≤3、chart ≤2（含⋯/删除之外的属性控件）

## 禁触清单
`editor/styles/{tokens,primitives,layout,inspector,panels,responsive}.css`、`editor/interaction/*`（属性面板是 W3）、`editor/app/toolbar.js`、`editor/app/view/zoom-ctl.js`（不存在了）、`editor/index.html`、`editor/gallery.js`、`packages/`、`tests/`。

## 最终报告格式
工单状态表 / commit 清单 / 自测真实结论 / 偏差与取舍 / 未决问题
