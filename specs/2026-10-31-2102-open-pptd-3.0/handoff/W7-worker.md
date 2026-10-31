# W7 handoff · 最小编辑器 + Design 面板 + 页面操作
> 分支 `feat/3.0-w7-editor`，起点 `main 75f1cc4`（W1–W6 已合并）；Windows 10.0.28120 + Git Bash + Node v24.21.0；零新增依赖。写入范围仅 `editor/**` + `tests/e2e/{editor-minimal,page-ops}.mjs` + 本文件（`git diff --name-only` 证明范围外零 diff）。
## A. 自测真实输出
```text
# 开工基线（75f1cc4，全部通过）
$ node tests/tools/dump-formula-mml.mjs → KaTeX MathML 生成: 204/204
$ node tests/run-all.mjs → 结果: 34/34 通过 ✅
$ node tests/e2e/render.mjs → render 冒烟测试 9/9 通过 ✅（timeouts=0）
$ node tests/e2e/incremental-load.mjs → 5/5 通过
$ node tests/regression/dep-graph.mjs → ✓ 依赖方向与环境全局检查通过
$ node tests/contract/public-api.mjs → 结果: 契约通过 ✅
$ node tests/tools/golden-diff.mjs → 24 项目/156 页；字节一致 156；无未登记漂移
# 完工（真实输出，最终代码重跑）
$ node tests/e2e/editor-minimal.mjs → 21/21 通过 ✅
  旧入口全无；选中+拖动 x 80→185；多选 2；文字/表格/图表编辑均提交模型；
  颜色 token 16；添加 3 项+Delete；Design 主题应用/自定义颜色/撤销；字体 27+外观；
  断网 /api 时仅内置 11 主题 / 39 字体且无导入入口
$ node tests/e2e/page-ops.mjs → 17/17 通过 ✅
  ＋后插并切换；菜单前插/后移；movePage 当前页跟随；缩略图拖拽排序；
  剩 1 页时 deletePage=false 且菜单删除禁用；全部 undo 覆盖
$ node tests/run-all.mjs → 结果: 34/34 通过 ✅
$ node tests/e2e/render.mjs → render 冒烟测试 9/9 通过 ✅（timeouts=0）
$ node tests/e2e/incremental-load.mjs → 5/5 通过
$ node tests/regression/dep-graph.mjs → ✓ 通过（220 文件 / 786 import，豁免 3 处不变）
$ node tests/contract/public-api.mjs → 结果: 契约通过 ✅
$ node tests/tools/golden-diff.mjs → 黄金 diff 156/156 字节一致；0 未登记漂移 ✅
$ node tests/regression/ui-token-literals.mjs → 6/6 ✅；align-guides ✓；measure-consistency ✓
$ git diff --name-only 75f1cc4 | grep -v '^editor/' | grep -v '^tests/e2e/editor-minimal.mjs$' | grep -v '^tests/e2e/page-ops.mjs$' → （空）
$ grep -RIn "interaction/properties|interaction/contextmenu|interaction/font-panel|interaction/theme-panel|
    interaction/arrange|dialogs/page-background|dialogs/icon-editor|types/{shape,line,image,icon,group,menu}" editor tests/e2e → （无）
$ grep -RIn "btn-fonts|btn-theme|btn-inspector|id=\"inspector|id=\"quickbar|id=\"add-menu|id=\"props|inspector-mask" editor → （无）
$ grep -RIn "\.quickbar|\.qb-|\.add-menu|\.theme-panel|\.font-panel|\.inspector|\.prop-icon-|\.mix\b" editor/styles → （无）
$ grep -RIn "key === \"[cvxdg]\"|key === \"\[|key === \"\]" editor → （无）；旧 API 名仅 api.js 注释一处（删除清单说明）
$ 静态闭包（editor/editor.js 静态 import 图，139 文件）：design-panel.js=false、text/table/chart-editor.js=false
```
## B. 实现、删除清单、消费者证据、坑与偏差
**删除（14 文件 + 1 处重写）**：`interaction/{properties,contextmenu,font-panel,theme-panel,arrange}.js`、`interaction/dialogs/{page-background,icon-editor}.js`、`types/{shape,line,image,icon,group,menu}.js`、`styles/inspector.css`（→ `forms.css` 仅留字段原语）；`interaction/add-menu.js` 同路径重写为 3 项最小菜单（旧 tabs/形状/图标/图表/最近使用全删）。DOM：`#btn-fonts`、`#btn-theme`、`#inspector`、`#inspector-mask`、`#btn-inspector-*`、`#quickbar`、`#props`、`#add-menu` 全部移除；新增 `#btn-design`、`#btn-page-menu`、`#add-list`。CSS：quickbar/inspector/theme-panel/font-panel/旧 add-menu/图标选择器样式删除；表单项原语保留。
**收窄**：`state.js` 删 clipboard/duplicate/layer/group/`duplicatePages|deletePages`，新增 `insertPage(at)`/`deletePage(i)`/`movePage(from,to)`（≥1 页、当前页跟随）；`api.js` 按 interfaces §10.2 收窄并新增 openText/Table/ChartEditor、addText/Table/Chart、insert/delete/movePage、goToPage/next/prev、zoom*、present、reload、save/export*；`canvas.js` 删 group 展开/拖拽复制/`] [`；`stage.js` 删 copyOnMove，Ctrl-click 仍切换选择；`thumbnails.js` 删页面多选/批量，保留点击/×/拖拽排序；`keyboard.js` 仅 Ctrl+Z/Y/S/A、F5。页面菜单 `app/page-menu.js`：前插/后插/前移/后移/置顶/置底/删除（对象为当前页）；`＋` 插当前页后。
**内容编辑器**：`types/{text,table,chart}.js` 只剩 label/create/addIcon；`interaction/text-editor.js`（内容/字体/字号/对齐/颜色/粗斜体）；`dialogs/table-editor.js`（单元格文字/增删行列/合并拆分/字色/填充，`measureTable(el,{theme})` 保留，行高列宽对话框删除）；`dialogs/chart-editor.js`（数据/类型/列重命名/系列增删/值列/系列名/系列颜色，无轴图例标签样式面板）。三者由 `api.openEditor` 动态 import，headless 静态闭包不含（证据见 A）。
**Design 面板**：`interaction/design-panel.js` + `design-panel-lazy.js`（静态只引 lazy，首次点击动态加载）。主题：`listBuiltinThemes` + `GET /api/themes` 用户库；应用 `applyTheme(current, theme, {deck})` → `io.applyTheme` + preserved 数提示 + undo；保存当前/导入/导出/删除；静态站仅内置并提示。颜色：`listColorTokens` 全量（16 标准 + 自定义），编辑走 `setColorToken`，删除走 `removeColorToken`（被引用返回 blocked→alert 阻止）；标准 token 不显示删除。字体：`GET /api/fonts`（不可用回退 registry）；deck 字体状态 ready/system/missing（deck.fonts + theme 样式 fontFamily + state.fontLibrary）；搜索/预览（FontFace，内置走 `fetchFontBytes`，用户字体走 `/assets/fonts/user/<file>`）/本地 base64 导入/URL 导入/删除；导入成功写 `state.fontLibrary[family]={source:"library",embed:true}`（保存只写 `{family,subset}`）。外观：复用 `theme.js` 的 `bindThemeMode`，不写 deck。
**消费者证据**：`editor.js`/`dom.js`/`toolbar.js`/`view.js` 不再引用删除模块；`saver.js` 用 `pptd:open-design` 事件跳转 Design>字体；`ui.js` 删除 quickbar 控件；`fields.js` 的 `themeSwatches` 改用 `listColorTokens`（文字/表格/图表颜色均含自定义 token）。
**坑**：① `api.bind({io})` 必须在 `createIo` 之后，否则 undo/save 静默失效（e2e 曾暴露）。② `.add-list` 必须加入 stage 的 FLOATING 选择器，否则点菜单触发画布手势/框选。③ `openMenuAt` 在 anchor pointerdown 时先被外部关闭，页面菜单用 `isConnected` 判断重开而非 toggle。④ Design 面板/内容编辑器只能动态 import；静态闭包检查 139 文件不含它们。⑤ e2e 固定 CDP 端口 9341/9342（避开 ui-shots 9247），`startServer({port:0})` 用 `server.address().port`。⑥ Windows CRLF：批量改写用脚本 + CRLF 容错。⑦ 字体预览依赖 `/assets/fonts/user/...` 静态映射（home 字体目录）。
**页面操作 API 语义**：`insertPage(at=currentPage+1)` 夹取 `[0,len]` 后 splice、切到新页、清选择，返回新索引；`deletePage(i=currentPage)` 仅 `len>1` 生效，删除前页时当前页 −1、删除当前页时取 `min(i,len-1)`，并清理 `pagesPending`；`movePage(from,to)` 夹取目标、当前页跟随被移动页，`from===to` 返回 false 且不产生历史。三者都被 api 包一层 `beginChange`+`render`，undo 可完整恢复；缩略图拖拽排序复用 `api.movePage`。
**Design 数据源/失败语义**：`GET /api/themes` 与 `GET /api/fonts` 均 `cache:"no-store"`；非 2xx / `{ok:false}` / 网络异常统一降级为仓库内置（11 主题、27 内置+12 系统字体），写操作按钮禁用或隐藏并提示“需要本地 open 服务”。`applyTheme` 的 preserved 统计三类（colors/textStyles/tableStyles）；颜色编辑按“一次交互一个历史步”合批（picker pointerdown/change 与 hex change 归并），删除被引用 token 时 `colorTokenUsage` 计数并阻止。
**未决/后移**：W8 的 createPreview/createEditor 自包含拆分与单壳；W9 保存原子化/RevisionConflict；W10 导出链路（ExportService、全局字体嵌入开关消费 state.fontLibrary）；主题 textStyles/tableStyles 可视化编辑器；色彩令牌重命名并更新引用；项目包携带字体。另：导出对话框仍显示“当前 N 个字体将嵌入”的只读提示（无 per-font chip），属 W9/W10 的全局开关接线面。
**偏差（需 lead 知悉）**
1. model 的标准颜色为 16 个（`STANDARD_COLOR_KEYS`，accent1/2 为 primary/accent 别名）；spec 文案“17 key”按 model 实现。
2. 自定义颜色不存“显示名”（ThemeFile colors 仅 key→value，`normalizeThemeFile` 丢弃额外字段），UI 以 key 显示。
3. 标准 token 不提供删除按钮（只删自定义 token），避免主题失去核心语义色；spec 的“删除”按自定义 token 落地。
4. 表格编辑器保留右侧“字色/填充”小面板（非旧整体样式面板）；图表编辑器无右侧面板，颜色只在系列行。
5. `showDialog` 新增内部 `onClose` 回调（编辑器共用设施，非公共契约），用于内容编辑器会话收尾渲染。
6. 内容编辑器改为按需 `import()`（比原静态 import 更彻底隔离 shot/headless），打开失败只 toast 不抛。
7. Ctrl/Alt 拖拽复制已删除；Ctrl-click 仍切换多选，Shift/框选不变。
8. 主题/字体库写操作依赖本地 server（`/api/themes`、`/api/fonts` 仅 loopback）；静态站只读并提示，符合 theme-font §4/§8。
9. `view.js` 保留 `updateButtons`（undo/redo 按钮禁用态，仍属保留能力），`renderProps`/`renderQuickbar` 删除；`arrange.js` 整体删除（其 `translate` 仅被已删除的属性面板/右键菜单使用，无其他消费者）。
10. `font-manager.js` 仍作 deck 字体资源适配器（loader/saver 依赖）；全局字体库客户端在 Design 面板，per-deck add/remove/embed chips 随 `font-panel.js` 删除，彻底迁移留 W9/W10。 
**探索审计（只读）**：specs 本组 repo-map/editor-ux/theme-font §6–§7/interfaces §10/07-W7/handoff W4–W6；packages/model/{theme-library,font-library,theme,font-registry,index}、server/{themes,fonts,index,font-library}、renderer/headless/{browser,cdp}；editor 全量 UI/视图/交互/类型/样式；tests/{run-all,contract,regression/{dep-graph,ui-token-literals,align-guides,measure-consistency},e2e/{render,incremental-load}}。未全仓重读；未触碰主检出/其他 worktree。
## C. 文件 / commit 指针
| commit | message |
|---|---|
| `3a3ce7b` | refactor(editor): 删除旧编辑 UI，收窄状态/API/视图并新增内容编辑器 |
| `343c0d4` | feat(editor): 新增懒加载 Design 面板（主题库/颜色令牌/字体库/外观） |
| `e6ee787` | test(e2e): 新增最小编辑器与页面操作 e2e |
| （本文件） | docs(w7): 写 W7 交接 |
新增：`editor/app/page-menu.js`、`editor/interaction/{design-panel,design-panel-lazy,text-editor}.js`、`editor/styles/forms.css`、`tests/e2e/{editor-minimal,page-ops}.mjs`。删除/重写见 B。修改：`editor/{index.html,editor.js,dom.js,ui.js}`、`editor/app/*`、`editor/app/view/*`、`editor/interaction/{canvas,stage,add-menu,fields,dialogs/*}`、`editor/types/*`、`editor/styles/{primitives,layout,canvas,panels,responsive}.css`。未改 `packages/**`、`tests/run-all.mjs`、`package.json`、`contract.json`、`tests/golden/**`、`tests/projects/**`；headless/golden 零漂移。
