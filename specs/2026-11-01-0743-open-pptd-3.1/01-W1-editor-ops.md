# W1 · 编辑器必要操作回归

> 分支由 lead 派工时创建；写入范围见下。最高约束：**只增加元素操作，不改现有渲染/导出/保存行为**。

## 目标

3.0 的最小编辑器把复制/剪切/粘贴/重复与可见的删除入口一起删掉了。恢复一组“简单编辑器必需”的元素操作，并提供一个轻量的选中操作条；不恢复属性面板、组合、对齐分布、层级、页面批量、右键菜单。

必要操作（本波范围）：
- 多选（已有，回归验证）
- 复制 / 剪切 / 粘贴（跨页、级联偏移、新 id、undo）
- 重复（Ctrl+D）
- 删除（已有键盘 Delete；新增可见按钮）
- 选中操作条：复制 / 重复 / 删除
- 键盘：Ctrl+C/X/V、Ctrl+Shift+V 原位粘贴、Ctrl+D；输入焦点与多实例规则沿用
- 粘贴后选中新元素；载入新项目清空剪贴板

## 前置上下文

- 必读：`ref/repo-map.md` → `ref/interfaces.md` §1–§3 → 本工单 → `handoff/W7-worker.md`（最小编辑器删除了什么）→ `handoff/W8-worker.md`（实例/服务）。
- 基线命令（开工先跑，贴真实输出）：
  - `node tests/tools/dump-formula-mml.mjs`；`node tests/run-all.mjs`（39/39）
  - `node tests/e2e/editor-minimal.mjs`（21/21）、`page-ops.mjs`（17/17）、`preview-shell.mjs`（23/23）
  - `node tests/regression/dep-graph.mjs`；`node tests/contract/public-api.mjs`
- 当前事实：
  - `editor/app/state.js` 无 clipboard；selection Set + history；`deleteSelected` 已有。
  - `editor/app/keyboard.js` 只有 Ctrl+Z/Y/S/A、F5。
  - `editor/interaction/canvas.js` 负责 Delete/Backspace、方向键微调、框选；选区层 `.sel-overlay` 唯一。
  - `editor/skeleton.js` 的 `editorSkeletonHtml()` 在 `#stage` 内有 FAB/添加菜单；无选中操作条。
  - `stage.js` 的 FLOATING 选择器决定哪些节点不触发画布手势；新增浮层必须加入。
  - e2e 依赖见 `ref/interfaces.md` §3；不得把旧 UI id（`#btn-fonts` 等）复用。
- 稳定区（勿改）：`packages/**`、`editor/preview.js`、`editor/editor.js`、`editor/gallery.js`、`editor/styles/tokens.css`（W2 负责视觉）、`tests/golden/**`、`tests/projects/**`、`tests/run-all.mjs`。

## 工单（按序，每项一个 commit）

### T1 state/api 剪贴板与操作
- `state.js`：新增实例级 `clipboard`（元素深拷贝数组）+ `clipboardCount`/`clipboardCascade`；ops：
  - `copySelected()`：`structuredClone` 选中元素；不 snapshot、不 dirty；返回数量。
  - `cutSelected()`：先复制，再 `beginChange()` + 删除；返回数量。
  - `pasteClipboard({inPlace=false})`：无剪贴板返回 `[]`；`beginChange()`；对每个克隆分配 `nextElementId()`、偏移（首次/级联 +16，inPlace 0）；插入当前页；选中新 id；返回 id 数组。
  - `duplicateSelected()`：复制选中并用**不覆盖剪贴板**的临时快照粘贴；返回 id 数组。
  - `clearClipboard()`：载入项目时调用。
- `api.js` 暴露 `copySelected/cutSelected/pasteClipboard/duplicateSelected/hasClipboard/getClipboardCount`；`beginChange/endChange/refreshPreview` 语义不变。
- 只允许改：`editor/app/state.js`、`editor/app/api.js`。
- 验证：Node 下不能直接跑 editor（DOM）；用 e2e T5 覆盖；`node tests/run-all.mjs` 不回退。

### T2 键盘
- `keyboard.js`：Ctrl/Cmd+C/X/V、Ctrl+Shift+V、Ctrl+D；`e.preventDefault()`；input/textarea/select/contenteditable 内不拦截；present 模式与 `ui.isActive()` 规则沿用。
- 只允许改：`editor/app/keyboard.js`。
- 验证：T5 键盘场景。

### T3 可见选中操作条
- `skeleton.js`：`editorSkeletonHtml()` 的 `#stage` 内新增 `#sel-actions`（结构见 `ref/interfaces.md` §3.2，`hidden` 默认），图标用现有 inline SVG 风格；`dom.js` 注册 `selActions`。
- `interaction/canvas.js`：选中变化/渲染/拖动后定位操作条（选区上方 12px，越界翻到下方并夹取）；无选中/内容编辑/放映时隐藏；按钮点击分别调用 api copy/duplicate/delete；阻止 pointerdown 冒泡。
- `interaction/stage.js`：把 `#sel-actions` 加入 FLOATING 选择器。
- 样式：只加最小可用样式（W2 会重做），复用现有 token，不新增设计系统。
- `destroy`：操作条随 root 清空，无全局监听残留。
- 只允许改：`editor/skeleton.js`、`editor/dom.js`、`editor/interaction/canvas.js`、`editor/interaction/stage.js`、`editor/styles/canvas.css`（仅 `.sel-actions` 段）。
- 验证：T5。

### T4 载入清空剪贴板
- `editor/app/project/loader.js`（或 `applyDeck` 所在处）：载入/新建项目时 `ops.clearClipboard()`；不改变现有装载流程。
- 只允许改：`editor/app/project/loader.js`（必要时 `source.js` 的 applyDeck 内一行）。
- 验证：T5 跨项目场景（可选）。

### T5 e2e
- 新增 `tests/e2e/editor-ops.mjs`（CDP + 临时项目，复用 editor-minimal 的启动方式；Chrome 缺失 SKIP+exit 0）：
  1. 多选两个元素（api.selectMany）→ 操作条可见、3 个按钮；
  2. Ctrl+C 后 Ctrl+V → 页元素 +2、新 id 唯一、偏移 16、选中粘贴项、undo 恢复；
  3. 操作条“复制”+“重复”各一次 → 行为一致；
  4. 剪切 → 元素减少；切到第 2 页粘贴 → 出现；undo 两次恢复；
  5. 连续粘贴两次 → 偏移级联（+16/+32）；
  6. Ctrl+Shift+V 原位粘贴（偏移 0）；
  7. 输入框聚焦时 Ctrl+C/V 不触发编辑器操作；
  8. 删除按钮 → 元素减少 + undo 恢复；
  9. 双实例：A 复制不影响 B 剪贴板/页面。
- `package.json` 增加 `test:editor`（合并 editor-minimal/page-ops/editor-ops）；不要改 `tests/run-all.mjs`。
- 只允许改：`tests/e2e/editor-ops.mjs`、`package.json`（scripts 一行）。
- 验证：`node tests/e2e/editor-ops.mjs` 全过。

## 验收

1. `node tests/run-all.mjs` 39/39；dep-graph/contract 绿。
2. `editor-minimal` 21/21、`page-ops` 17/17、`preview-shell` 23/23、`incremental` 5/5 不回退。
3. `editor-ops` 全过（真实输出：用例数/失败项）。
4. `golden-diff` 零漂移（本波不碰渲染）。
5. 写入范围外零 diff（handoff 例外）；无新增依赖；无旧 UI id 回归。

## 禁触清单

`packages/**`、`editor/{preview,editor,gallery,main}.js`、`editor/styles/{tokens,primitives,panels,forms,layout,responsive,present}.css`（除 canvas.css 的 `.sel-actions` 段）、`editor/interaction/design-panel.js`、`contract.json`、`tests/run-all.mjs`、`tests/contract/**`、`tests/golden/**`、`tests/projects/**`、`skill/**`。

## 交接包

分支最后一个 commit 写 `specs/2026-11-01-0743-open-pptd-3.1/handoff/W1-worker.md`（A/B/C，60–80 行）：API/语义、偏移与 id 规则、操作条定位坑、e2e 输出、commit 指针。

## 最终报告

工单状态表 / commit 清单 / 自测真实结论 / API 语义 / 操作条定位与 DOM / 与 spec 偏差 / 探索审计 / 未决问题。
