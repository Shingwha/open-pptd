# editor-ux · 最小编辑器功能矩阵

> 目标：AI 生成 PPTD，人类做预览、验收和少量内容修正；不是全功能编辑器。保留高频、低复杂操作，其余删除，避免屎山。

## 1. 保留 / 删除总表

| 区域 | 保留 | 删除 |
|---|---|---|
| 打开 | 本地文件夹/URL/最近；保存 | 新建空白（除 AI/CLI 创建）、旧 session restore 卡 |
| 页面 | 翻页、缩略图导航；单页前插/后插/前移/后移/置顶/置底/删除；拖拽排序 | 页面多选/批量删除/复制页 |
| 画布 | 单选/多选/框选、拖动、缩放、旋转、智能参考线、删除 | 组合/取消组合、对齐/分布按钮、层级顺序、复制粘贴/原地复制、透明度/翻转 |
| 添加 | 文字、表格、图表 | 形状/线条/图片/图标新增 |
| 文字 | 内容、字体、字号、对齐、颜色、粗体/斜体 | 行距/字距/段前距/高亮/方向；字体管理面板 |
| 表格 | 单元格文字、增删行列、合并/拆分、单元格字色/填充 | 表格样式面板、字体/粗体/对齐/边框/textStyle、行列尺寸 |
| 图表 | 数据、类型、系列增删/值列、系列颜色 | 轴/图例/标签/样式面板、气泡尺寸/线型等高级样式 |
| 颜色 | 文字、表格单元格、图表系列 | 形状填充/边框、页面背景、主题色（走 Design 主题库） |
| 主题/字体 | Design 面板：主题库/自定义颜色/字体库/明暗外观 | 旧字体 popover、旧配色 popover |
| 预览 | 缩放/平移、放映、live reload、明暗 | — |
| 保存/导出 | 保存（原子写+冲突）、PPTX/PNG/项目包 | — |
| 其他 | 状态条/dirty、toast、确认对话框 | 备注/预检/zip 导入/AI 协作 UI/shape text UI（后移） |
| 只读元素 | 形状/线条/图片/图标/分组：可选中、拖动/缩放/旋转、删除 | 内容/样式编辑；分组作为整体操作 |

## 2. 页面操作

- 单页模型；删除页面多选集合/批量操作。
- 缩略条右侧 `＋`：插入到当前页之后，并切到新页。
- 可见“页面”菜单（针对当前页）：
  - 在当前页前插入
  - 在当前页后插入
  - 前移一页 / 后移一页
  - 移到最前 / 移到最后
  - 删除当前页
- 拖拽排序保留，作为长距离移动快捷方式；修复现有拖拽不稳/入口不明显的问题。
- `insertPage(at)`、`deletePage(index)`、`movePage(from,to)`；全部 undoable；删除至少留 1 页；当前页跟随。
- 复制页后移；不做 `duplicatePages`。
- UI：缩略条 + 页面菜单；不做每缩略图多选/批量。

## 3. 画布与选择

- 保留：
  - 单选/Shift/Ctrl 多选/框选；
  - 拖动、缩放（含文字高度/表格 rowHeights 特例）、旋转（表格/图表不旋转，保持现行为）；
  - 智能参考线/吸附（align-guides）；
  - Delete 删除、Esc 逐层取消、Ctrl+A 全选、方向键微调（如果现有行为简单）、undo/redo。
- 删除：
  - group/ungroup、对齐/分布、层级上移/下移/置顶/置底、复制/粘贴、透明度/翻转、属性面板数值定位。
- 表格：`bounds.h` 只作 rowHeights 比例种子；纵向缩放统一写 `rowHeights`；表格无 rowHeights 时初始化为等分比例。
- 文字：高度可按内容/拖拽；不写回模型高度（保持现有“不自动写回”原则）。
- 分组：现有 group 壳不参与选择/操作，成员按普通元素命中；不提供组合功能。
- 图表/表格：可移动/缩放；不旋转；图表编辑只改数据/类型/系列，不改样式。

## 4. 内容编辑器

### 4.1 文字

双击文字元素打开轻量文字对话框/面板：

- 内容：textarea，保留富文本 DSL/公式原样；不做 WYSIWYG。
- 字体：从字体库/主题/系统分组选择。
- 字号：数值/常用档位。
- 对齐：水平 + 垂直（或水平即可；遵循现有 TextContent.align）。
- 颜色：主题 token + 自定义 token + hex/alpha。
- 粗体/斜体：base style toggle（不要求选区级富文本编辑）。
- 删除：行距、字距、段前距、高亮、方向、样式 preset、自动换行、字体管理入口。
- 修改走 beginChange/结束 endChange；可撤销。

### 4.2 表格

双击表格打开表格内容编辑器：

- Excel 式单元格文字编辑（复用 `excel-grid.js`）。
- 增删行/列；插入/删除保护（合并单元格冲突提示）。
- 合并/拆分（结构内容；保留现有防护逻辑）。
- 单元格字色/填充色（基础颜色）。
- 删除：表格样式面板、字体/字号/粗斜体/对齐/边框/textStyle、行高列宽比例对话框。
- 行高/列宽由 `tableFacts` 决定；纵向缩放写 rowHeights；不再提供行高/列宽对话框。
- 表格编辑器使用 `measureTable` 的最终行高，不用 `estimateTableLayout` 最小行高。

### 4.3 图表

双击图表打开图表内容编辑器：

- 数据网格（Excel 式）；列重命名同步 encode。
- 图表类型切换；语义 encode remap + 共存约束警告。
- 系列增删、值列选择、系列名。
- 系列颜色（基础颜色）。
- 删除：样式面板（图表/数据标签/轴/图例/系列样式/气泡尺寸/线型/平滑/堆叠等）。
- 图表尺寸/位置由画布变换控制；图表可缩放、不可旋转。
- 图表导出路由仍由 `CHART_META.route` 决定（classic/chartEx/image）；预览仍 ECharts。

## 5. 添加

- 一个极小添加菜单/FAB：文字 / 表格 / 图表。
- 新增元素落默认位置（可错开）；选中后可用画布变换定位。
- 表格/图表创建后直接打开内容编辑器；文字创建后选中，双击编辑。
- 不提供形状/线条/图片/图标新增；这些由 AI/已有 deck 提供。

## 6. Design 面板

顶栏一个“设计”入口；删掉“字体”和“配色”两个按钮。

Tabs：

1. **主题**
   - 当前主题：内置名/我的主题/自定义（基于 XX）。
   - 主题库卡片：内置 + 我的主题；应用；保存当前；导入/导出；删除（内置只读）。
   - 颜色令牌：全部 token；+ 添加颜色；编辑/删除；被引用 token 警告/阻止删除。
   - 文本/表格样式：显示“随主题保存/应用”，v1 不提供可视化样式编辑器；样式由 AI/预设管理。
2. **字体**
   - 当前 deck 使用字体状态：可嵌入/系统/缺失。
   - 全局字体库：内置 + 我的字体；搜索/预览/导入本地或 URL/删除。
   - 嵌入说明：导出全局开关；不做每字体 chip。
3. **外观**
   - 浅色/深色/跟随系统；只影响查看器 UI，不写 deck.theme。

详见 `ref/theme-font.md`。

## 7. 顶部/底部/键盘

- 顶栏保留：品牌/Home、文件（打开/最近/保存/导出）、设计、放映、undo/redo、reload/状态、GitHub（full chrome 才有）。
- 缩略条：页面 + 页面菜单 + `＋` + 缩放/页数。
- 删除 FAB 中的属性面板/add 旧菜单结构；只保留最小添加菜单（3 项）。
- 键盘保留：Ctrl+S 保存、Ctrl+Z/Y、Ctrl+A、Delete、Esc、F5、翻页/缩放；删除 Ctrl+C/V/D/G、] [、Alt 复制等编辑快捷键。
- 窄屏：保留现有 responsive 基本行为；属性面板删除后布局更简单；Design 面板用抽屉/模态适配窄屏。

## 8. 保存与状态

- 保存：serializeDeck + media/font references → ProjectSource.write；原子批量 + revision conflict；成功后 baseline/dirty。
- 未保存修改：dirty 状态条；切换/重新加载确认。
- 冲突：`RevisionConflictError` → 提示“覆盖/重新加载/取消”；不静默覆盖 AI/外部修改。
- 不做自动保存（后移）。
- 导出：PPTX/PNG/项目包，走 ExportService；PNG 依赖浏览器后端；Office 后移。

## 9. 代码落点

- `editor/app/state.js` 缩为 deck + 当前页 + 单选/多选 + content history + dirty；删除 group/clipboard/layers/align。
- `editor/app/api.js` 缩为 selection/transform/content/page/save/export；删除 group/align/layer/clipboard/duplicate。
- `editor/interaction/canvas.js` 保留 selection/transform/guides；删除 group/align/layer/clipboard/duplicate；表格 rowHeights 特例保留。
- `editor/interaction/stage.js` 保留 pan/zoom、element gesture dispatch、box select；删除不必要分支。
- `editor/app/view/view.js` 删除 renderProps/renderQuickbar/updateButtons；保留 canvas/thumbnails/selection/afterRender。
- `editor/types/*` 只保留 text/table/chart contentEditor；shape/line/image/icon/group/menu UI 删除。
- `editor/index.html`/CSS 删除 inspector/quickbar/add-menu/contextmenu 大部分；保留 canvas/thumb/present/design/export。
- `editor/interaction/{properties,add-menu,contextmenu,font-panel,theme-panel,align-guides?}`：properties/add-menu/contextmenu/font-panel/theme-panel 删除；align-guides 保留；arrange 删除 align/distribute，保留 translate。
- `editor/app/project/font-manager.js` 变字体库客户端；删除 per-deck add/remove/embed chips。
- 测试：删除旧编辑 UI 测试；新增最小编辑器 e2e、页面操作、双实例、保存冲突。

## 10. 验收

- 只保留表内功能；删除项无隐藏入口/死代码/CSS。
- 文字/表格/图表内容编辑 + 颜色可用；变换/多选/参考线可用；添加 3 类可用。
- 页面前插/后插/移动/删除/拖拽可用；undo/redo 覆盖。
- 保存原子/冲突；PPTX/PNG/包导出可用；live reload/放映正常。
- 表格高度与 preview/PPTX 一致（totalHeight）。
- 双实例互不污染；销毁无残留监听/DOM/图表实例。
- 窄屏/桌面基本可用；无旧属性面板/快捷条入口。
