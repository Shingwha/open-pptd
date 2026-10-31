# design-direction · Paper & Ink（W2）

> 目标：克制、现代、编辑感。画布/作品是主角，工具退后。不是营销落地页，也不是后台表格。

## 1. 概念

像一间安静的工作室：暖纸色桌面，黑色墨字，一枚朱砂印章作为唯一强调。结构靠版式、留白和发丝线，而不是卡片堆叠、阴影和渐变。

- **关键词**：editorial / quiet / precise / tactile。
- **不出现**：渐变、玻璃拟态、彩色光晕、重阴影、3D、bokeh、装饰插画、彩色图标、过多圆角。
- **动效**：只用于状态变化（hover/选中/抽屉），120–180ms，ease-out；不做入场动画堆叠。

## 2. 字体

```css
--font-ui: system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
--font-display: "Iowan Old Style", "Palatino Linotype", Georgia, "Songti SC", "Noto Serif SC", serif;
--font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
```

- 顶栏品牌、画廊大标题、空状态标题用 `--font-display`；UI 控件、正文、按钮用 `--font-ui`。
- 字号阶：11/12/13/14/16/20/28/44（token `--text-xs…2xl` 重定义）；行高 1.3–1.5。
- 字重只用 400/500/600；不用 700 大黑体堆叠。

## 3. 色彩

浅色（默认）：
- `--paper #F6F3EC`（app 桌面）
- `--panel #FFFDF8`（面板/抽屉）
- `--ink #1B1A17` / `--sub #6B675D` / `--faint #9B9588`
- `--line #E2DCD0` / `--line-strong #CFC7B8`
- `--accent #C2472E`（朱砂，仅用于主按钮、选中环、当前页、关键状态）
- `--accent-soft #F3E2DC`
- `--danger #B3261E`；`--success` 用墨绿 `#2F6B4F`（少量）
- 画布纸 `#FFFFFF`，桌面用 paper；画布阴影仅 `0 1px 2px rgba(27,26,23,.06), 0 12px 32px rgba(27,26,23,.08)`。

深色：
- `--paper #161513` / `--panel #1D1C19` / `--ink #EDE7DA` / `--sub #B3AC9D` / `--faint #7F796C`
- `--line #2C2A25` / `--line-strong #3B382F`
- `--accent #E06A4F` / `--accent-soft #3A231D` / `--danger #E5675C`
- 画布纸仍是白色（deck 内容不随 UI 主题反转），桌面深色；画布阴影加深但保持柔和。

对比度：正文/背景 ≥ 7:1，次要文字 ≥ 4.5:1，按钮文字 ≥ 4.5:1。强调色不用于小号正文。

## 4. 形状与间距

- 圆角：控件 4px，卡片/画布 6px，抽屉 10px（仅外侧）；不要大圆角药丸（状态徽标除外）。
- 间距阶：4/8/12/16/24/32/48；顶栏左右 20px，内容区 24px。
- 边框：1px `--line`；分区用发丝线，不用投影。
- 控件高度：32px（默认），28px（紧凑），40px（主操作）。

## 5. 编辑器布局

```text
┌──────────────────────────────────────────────────────────────┐
│  OPEN/PPTD   deck-name            状态   undo redo  文件 设计 放映 │ 56px, hairline bottom
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                     paper desk + centered canvas             │
│                     (subtle shadow, no chrome)               │
│                                                              │
│   [sel-actions] 浮动在选区上方                                  │
│                                                              │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  page filmstrip (thin cards + add tile)      zoom  page count │ 88px, hairline top
└──────────────────────────────────────────────────────────────┘
```

- **顶栏**：左品牌（衬线字标 `OPEN/PPTD`，字距略开）、文档名（sub 色，截断），右侧状态点（已保存/未保存）、撤销/重做图标、`文件`、`设计`、`放映`。按钮默认无底色，hover 仅 `--hover`；主操作（放映）用 ink 实底或 accent 细边，不两面都强调。
- **画布区**：无网格、无装饰；桌面 paper；画布白色 + 极轻阴影；四周留白 ≥32px；缩放/平移行为不变。
- **选中**：选中框 1.5px accent，手柄 8px 白底 + accent 边；参考线 accent 但 1px 虚线；多选成员细框 `--sub`，整体框 accent。
- **选中操作条**：浮在选区上方 12px，panel 底 + line 边 + 轻阴影；复制/重复/删除三个图标按钮，32px；不显示文字（title 提示），窄屏可只剩图标。
- **缩略条**：88px 高，paper 底 + 顶部发丝线；缩略卡 112×63（16:9），1px line，当前页 2px accent 底边/边框；页码小字在卡片下方；`＋` 为虚线卡；右侧缩放组为纯文字/图标，无胶囊底；页面菜单用通用 menu。
- **添加**：右下角 44px 圆形 ink 底 + paper 图标；菜单是 panel 弹层，三行（文字/表格/图表）+ 细图标 + 一行说明；不用彩色大图标。
- **文件菜单**：panel 弹层，分组 + 发丝线；危险项用 danger 文字；快捷键右对齐。
- **Design 抽屉**：右侧 420px，panel 底，左侧发丝线；顶部“设计”+关闭；tabs 为文字分段（主题/字体/外观），当前项 ink + 2px 下划线；主题卡 2 列，色块用 6 个 12px 圆点；颜色 token 行紧凑表格；字体行用 family 名 + 状态点；外观为三枚文字按钮。
- **Toast**：底部居中或右上角？选择**底部居中**（不遮顶栏），panel 底、line 边、12px 字；成功用墨绿点，错误用 danger 点。
- **对话框**：居中 panel，最大 560px，标题衬线 20px，底部按钮右对齐；遮罩 `rgba(27,26,23,.32)`。

## 6. 画廊（Home）

```text
┌──────────────────────────────────────────────────────────────┐
│ OPEN/PPTD                                    文件   GitHub    │ 64px, transparent/hairline
│                                                              │
│  Presentations,                                      [ppt][poster] │
│  not templates.                                                │ 大标题 44–56px 衬线
│  用内容驱动的版式，生成可编辑的演示与海报。                          │ sub 14px
│                                                              │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐              │
│  │  cover     │  │  cover     │  │  cover     │              │ 3 列，16:9 / poster 3:4
│  │  title     │  │            │  │            │              │
│  │  meta      │  │            │  │            │              │
│  └────────────┘  └────────────┘  └────────────┘              │
└──────────────────────────────────────────────────────────────┘
```

- 背景 paper；顶部无大色块；品牌字标与编辑器一致；右上 `文件`、GitHub 细图标。
- 主标题用 `--font-display`，英文可用 “Presentations, not templates.”；中文 “让内容成为主角。” 二选一或双语小字。副标题说明 PPTD/可编辑/导出。
- 筛选 tabs（全部/演示/海报）放在标题右侧或下方，文字 + 下划线指示，不用胶囊。
- 网格 3 列（≥1200px）、2 列（≥760px）、1 列（窄屏）；gap 24px；卡片无外框，封面本身 6px 圆角 + 1px line；hover 仅上移 2px + 阴影略深。
- 卡片信息在封面下方：标题 14px ink、页数/分类 11px sub；描述最多 2 行；标签用 11px sub + 中点分隔，不用彩色胶囊。
- 空状态：衬线标题 + 一句提示 + 文件按钮。
- 滚动条 gutter 保留；卡片入场动画删除（避免花哨）。

## 7. 响应式

- ≥1200：画廊 3 列；编辑器缩略条 112×63，顶栏完整。
- 760–1199：画廊 2 列；编辑器缩略条 96×54，文档名可截断。
- <760：画廊 1 列；顶栏只留品牌、undo/redo、文件、设计（文字可隐藏只留图标）；缩略条 72×41，`＋` 与页面菜单保留；Design 抽屉全宽；对话框底部抽屉。
- 触控目标 ≥ 36px；hover 状态在触屏不依赖。

## 8. Do / Don't

Do：
- 用留白、字号层级、发丝线组织信息；每屏只有一个强调点。
- 让画布/封面占据视觉中心；工具控件低对比。
- 保持键盘可达/焦点可见（focus-visible 2px accent）。
- 深浅色都逐一检查对比度与画布可读性。

Don't：
- 不要卡片套卡片、彩色图标墙、渐变按钮、玻璃顶栏。
- 不要在每个区块加大标题/说明文字；UI 文案短。
- 不要改 DOM 契约（见 `ref/interfaces.md` §3）而不改 e2e。
- 不要引入外部字体/图标库；沿用现有 inline SVG 与系统字体。

## 9. 落地文件（W2）

- `editor/styles/tokens.css`：新 token + 深色表；删除未使用 legacy 别名（保留仍被引用的 `--primary*` 过渡或一并替换）。
- `editor/styles/{primitives,layout,canvas,forms,panels,present,responsive}.css`：按新系统重写/收敛；可拆 `gallery.css`、`design.css`。
- `editor/skeleton.js`：结构微调（顶栏/缩略条/选中操作条容器），保留契约 id/class。
- `editor/interaction/design-panel.js`：视觉重做，逻辑/API 不变。
- `editor/gallery.js`：Home 结构/卡片/tabs 重做，数据/预览逻辑不变。
- `editor/app/toolbar.js`、`file-menu.js`、`components/menu.js`：弹层/按钮视觉。
- `tests/tools/ui-shots.mjs`：更新选择器（如有）并重生成截图。
- `docs/images/editor.png`、`gallery.png`（如需新增）由 ui-shots 产出后替换。
