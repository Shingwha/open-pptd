# W1 handoff · 编辑器必要操作回归

> 分支 `feat/3.1-w1-editor-ops`，起点 `main 82d40d5`（3.0 + 3.1 spec）；Windows 10.0.28120 + Git Bash + Node v24；零新增依赖。写入范围仅 `editor/app/{state,api,keyboard}.js`、`editor/app/project/{loader,io}.js`、`editor/interaction/{canvas,stage}.js`、`editor/skeleton.js`、`editor/dom.js`、`editor/styles/canvas.css`、`tests/e2e/editor-ops.mjs`、`package.json`、本文件（`git diff --name-only 82d40d5` 证明范围外零 diff）。

## A. 自测真实输出

```text
# 开工基线（82d40d5）
$ node tests/tools/dump-formula-mml.mjs → KaTeX MathML 生成: 204/204
$ node tests/run-all.mjs → 结果: 39/39 通过 ✅
$ node tests/e2e/editor-minimal.mjs → 21/21 通过 ✅
$ node tests/e2e/page-ops.mjs → 17/17 通过 ✅
$ node tests/e2e/preview-shell.mjs → 23/23 通过 ✅
$ node tests/regression/dep-graph.mjs → ✓ 依赖方向与环境全局检查通过
$ node tests/contract/public-api.mjs → 结果: 契约通过 ✅
$ node tests/tools/golden-diff.mjs → 24 项目/156 页；字节一致 156；无未登记漂移
# 完工（最终代码重跑）
$ node tests/e2e/editor-ops.mjs → 22/22 通过 ✅（9 场景 + 定位/复制无 undo/载入清空/新建清空）
  多选 2→操作条 3 按钮且位于选区上方；Ctrl+C/V 元素 +2、+16、id 唯一、选中粘贴项；
  操作条复制/重复；剪切→第 2 页粘贴→undo×2 恢复；级联 +16/+32；Shift+V 0；
  input/contenteditable 不拦截；删除按钮 undo；双实例剪贴板隔离；载入后剪贴板 0；
  newProject 后 hasClipboard=false、paste 返回 []
$ node tests/e2e/editor-minimal.mjs → 21/21 ✅；page-ops → 17/17 ✅；
  preview-shell → 23/23 ✅；incremental-load → 5/5 ✅
$ npm run test:editor → 21/21 + 17/17 + 22/22 通过 ✅
$ node tests/run-all.mjs → 39/39 ✅；dep-graph ✓；contract ✅；
  golden-diff 156/156 字节一致、0 未登记漂移
```

## B. 实现、语义、坑与偏差

**API 语义（`editor/app/api.js` 暴露，`window.__pptdEditor` 同步可见）**
- `copySelected(): number`：把当前页选中元素 `structuredClone` 进 `state.clipboard`，级联计数归 0；无选择时 no-op（保留旧剪贴板）；不 snapshot、不置 dirty、不产生 undo 步。
- `cutSelected(): number`：先 copy，再 `beginChange()+deleteSelected()`；一个 undo 步；返回剪切数。
- `pasteClipboard({inPlace=false}): string[]`：空剪贴板返回 `[]`；`beginChange()` 后逐项 `structuredClone`、分配 `nextElementId()`、偏移、插入当前页，`selectMany(newIds)`；api 层一次 `render()`；返回新 id 数组。
- `duplicateSelected(): string[]`：用选中元素的临时快照（不读写用户剪贴板/级联计数）粘贴 `+16`，一个 undo 步。
- `hasClipboard()/getClipboardCount()`；`ops.clearClipboard()` 不暴露到 api，由 loader 与 `io.newProject` 调用。
- 剪贴板是实例内内存（`state.clipboard` + `state.clipboardCascade`），不写 localStorage/系统剪贴板、不存页面引用。

**偏移 / id / 历史规则**
- 普通粘贴偏移两轴 `+16 × (cascade+1)`：copy/cut 后首次 +16，连续第二次 +32；`inPlace:true`（Ctrl+Shift+V）偏移 0 且不推进级联；duplicate 恒 +16（不参与级联）。
- 每个粘贴项用 model `nextElementId()`（默认前缀 `el`）分配新 id；其余字段深拷贝；页内 id 唯一（e2e 断言）。
- cut / paste / duplicate 各一个 `beginChange()` 快照；copy 不进入历史；undo 后选择清空（沿用 applyHistory）。
- 载入项目时 loader 的 `applyDeck` 包装层先 `ops.clearClipboard()`，覆盖 `loadDeck / loadDeckFromHandle / loadDeckData`（含手动刷新）；新建空白时 `io.newProject` 在 `ops.replaceDeck(deck)` 后调用 `ops.clearClipboard()`。

**键盘（`app/keyboard.js`）**
- Ctrl/Cmd+C/X/V、Ctrl/Cmd+Shift+V（原位）、Ctrl/Cmd+D；均 `preventDefault()`。
- input/textarea/select/contenteditable 目标直接返回（保留原生剪贴板行为）；present 模式与 `ui.isActive()` 仲裁沿用；Ctrl+Z/Y/S/A、F5 顺序不变。

**选中操作条（`skeleton.js` / `dom.js` / `canvas.js` / `stage.js` / `canvas.css`）**
- DOM：`#sel-actions.sel-actions[hidden]`，内含 3 个 `button.sel-action[data-action=copy|duplicate|delete]`，inline SVG 与现有风格一致；位于 `#canvas-wrap` 内（仍在 `#stage` 内）；`dom.js` 注册 `selActions`。
- 定位：`refreshSelection` / `updateSelectionBox`（拖动、缩放、旋转每帧）调用 `syncSelActions()`；居中于选区上方 12px，顶部不足 `stageTop+8` 时翻到下方，水平/垂直夹取进 stage；坐标相对 `canvas-wrap`，pan 由 wrap 的 translate 自然带动，无需重算。
- 显示条件：有选中 + 有 `.sel-box` + 无 `.dialog-overlay` + 本实例 root 未加 `.pptd-presenting-hidden`；无选中、框选中（marquee 开始先隐藏，释放后恢复）、内容编辑、放映均不可见。
- 事件：操作条 `pointerdown` `stopPropagation()`；`click` 委托 `data-action` 调 `api.copySelected/duplicateSelected/deleteSelected`；`stage.js` 的 FLOATING 选择器加入 `#sel-actions`（另有 `button` 兜底）。
- 坑：必须写 `.sel-actions[hidden]{display:none}`，否则 `display:flex` 覆盖 UA 的 hidden；先 `hidden=false` 再读 `offsetWidth/offsetHeight`；旋转单选时用 `.sel-box` 的 AABB 定位；`destroy` 通过控制器 `AbortController` 解绑监听，root 清空后无残留。

**偏差（需 lead 知悉）**
1. ~~“新建空白项目清空剪贴板”未落地~~ **已解决**：经 lead 授权，`io.newProject` 在 `ops.replaceDeck(deck)` 后调用 `ops.clearClipboard()`（仅此一行）；e2e 场景 11 断言复制后 newProject → `hasClipboard()===false`、paste 返回 `[]`。
2. 操作条放在 `#canvas-wrap`（`#stage` 内）而非 `#stage` 直接子节点：这样 pan 时随画布移动、无需每帧重算；W2 重做视觉时请保留 `#sel-actions` / `.sel-actions` / `.sel-action[data-action]` 契约。
3. 内容编辑隐藏依赖全局 `.dialog-overlay` 存在判断（dialog 挂 `document.body`，无实例指针）；双实例同页时任一对话框会隐藏两边的操作条。
4. 无选择时 Ctrl+C 为 no-op、保留旧剪贴板（spec 未定义；比清空更安全）。
5. e2e 端口：editor-ops 使用 9344（preview-shell 为 9343），editor-minimal 9341、page-ops 9342；四个 e2e 端口互不冲突，可并行（仍需避开 ui-shots 9247）。

**探索审计（只读）**：`specs/2026-11-01-0743-open-pptd-3.1/{ref/repo-map.md,ref/interfaces.md §1–§3,01-W1-editor-ops.md}`、`specs/2026-10-31-2102-open-pptd-3.0/handoff/{W7,W8}-worker.md`；`editor/{skeleton,dom,context}.js`、`editor/{app/{state,api,keyboard,view/view,view/viewport},interaction/{canvas,stage},app/project/{loader,source,io},app/present}.js` 相关片段、`editor/styles/{canvas,tokens}.css`、`tests/e2e/{editor-minimal,preview-shell}.mjs`、`packages/model/model.js`。未全仓重读；未触碰主检出/其他 worktree。

## C. 文件 / commit 指针

| commit | message |
|---|---|
| `0fa4caf` | feat(editor): 恢复元素剪贴板与复制/剪切/粘贴/重复操作 |
| `a80e7c4` | feat(editor): 新增 Ctrl+C/X/V、Ctrl+Shift+V、Ctrl+D 元素操作快捷键 |
| `f968af6` | feat(editor): 新增选中操作条（复制/重复/删除）与定位逻辑 |
| `fe4ac6a` | feat(editor): 载入项目时清空元素剪贴板 |
| `4c02106` | test(e2e): 新增编辑器元素操作 e2e 与 test:editor 脚本 |
| `ea64710` | docs(w1): 写 W1 交接 |
| （本提交） | fix(editor): 新建空白清空剪贴板；e2e 端口避让（9344，含本文件更新） |

新增：`tests/e2e/editor-ops.mjs`。修改：`editor/app/{state,api,keyboard}.js`、`editor/app/project/{loader,io}.js`、`editor/interaction/{canvas,stage}.js`、`editor/skeleton.js`、`editor/dom.js`、`editor/styles/canvas.css`、`package.json`（仅 `test:editor` 一行）。未改 `packages/**`、`editor/{preview,editor,gallery,main}.js`、其他 styles、`design-panel`、`contract.json`、`tests/run-all.mjs`、`tests/contract/**`、`tests/golden/**`、`tests/projects/**`、`skill/**`。
