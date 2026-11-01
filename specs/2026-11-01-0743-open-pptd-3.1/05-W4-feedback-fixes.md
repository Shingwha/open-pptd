# W4 · 试用反馈修复（画廊静态 / 越界提示 / Logo / 缩略图选中）

> 分支由 lead 派工时创建。最高约束：只修这 4 个问题，不改编辑/渲染/导出行为。

## 目标

1. **画廊封面完全静态**：`createPreview` 的 embedded 模式默认不绑定平移/缩放/滚轮/缩放按钮/键盘翻页；单击只进入项目。全屏 preview（chrome:"full"）保留 pan/zoom/present。
2. **越界提示只在编辑器**：预览/画廊封面不再弹“本页 N 个元素超出画布范围”；编辑器保留。
3. **品牌字标**：3 处 `OPEN/PPTD` → `OPEN PPTD`（空格，保留字距/字重）。
4. **缩略图拖动不选中内容**：拖拽缩略条时不能选中缩略图里的文字/图片，不出现蓝色选区；页面拖拽排序/点击切页行为不变。

## 前置上下文

- 必读：`ref/repo-map.md` → `handoff/W2-worker.md` → 本工单。
- 基线命令：`node tests/run-all.mjs` 39/39；`node tests/e2e/{editor-minimal,page-ops,editor-ops,preview-shell,browser-export,incremental-load}.mjs`；`node tests/tools/golden-diff.mjs` 156/156。
- 复现证据（lead，无头 Chrome）：
  - 画廊拖封面：封面内部 `.canvas` rect x 110→51、`.stage.panning=true`、页面 scrollX/Y=0 → `bindViewerChrome()` 给 embedded 也绑了 pan/zoom。
  - 画廊加载出现 2 条 `⚠ 本页 1 个元素超出画布范围` → `renderCanvas()` 无条件 `notifyOverflow()`。
  - 拖缩略图：`window.getSelection().toString()` 得到整页文字；主画布 `.sel-overlay` 0、元素 bounds 不变；松手 `currentPage` 变化。
  - Logo 字符串在 `editor/skeleton.js` 82/154/181。
- 稳定区：`packages/**`、`editor/preview.js` 的 API 形状（可改内部绑定）、`editor/app/view/view.js` 的布局/渲染、`tests/golden/**`、`tests/projects/**`、`contract.json`、`skill/**`。

## 工单

### T1 画廊封面静态
- `editor/preview.js`：`bindViewerChrome()` 只在 `chrome === "full"` 的 non-editable preview 调用；embedded 不绑 pan/zoom/present/keys/resize（画廊自身 ResizeObserver 已负责重绘）。
- 可选 `createPreview` 内部选项 `interactive`（默认 embedded=false, full=true），供宿主显式开启；不进公共契约文档。
- `editor/gallery.js` 封面调用保持 `chrome:"embedded"`，不加交互。
- 验证：拖封面 `.canvas` rect 不变、无 `.stage.panning`；单击卡片进入项目；滚轮滚动画廊。

### T2 越界提示只属于编辑器
- `editor/app/view/view.js`：`renderCanvas()` 的 `notifyOverflow()` 仅在 `editable` 时调用；预览/封面静默（可 console.debug）。
- 验证：画廊加载 0 条 `.toast`；全屏 preview 也无越界 toast；编辑器打开仍有（测试项目含越界页时）。

### T3 Logo
- `editor/skeleton.js` 3 处 `OPEN/PPTD` → `OPEN PPTD`；必要时 `brand-home` 字距不变。
- 验证：编辑器/画廊/整页 preview 字标文本正确；无 `OPEN/PPTD` 残留（README/skill 不在本波）。

### T4 缩略图拖拽防选中
- `editor/app/view/thumbnails.js`：拖拽开始清除当前 selection（`getSelection().removeAllRanges()`），缩略图节点/内容 `draggable=false`；`pointerdown`（非 button）`preventDefault()`，确保不进入文本/图片原生拖拽。
- CSS：`.thumbbar`/`.thumb`/`.thumb *` `user-select:none`；图片 `-webkit-user-drag:none`。
- 确保点击切页、拖拽排序、×删除、滚轮横向滚动仍正常。
- 验证：拖缩略图后 `window.getSelection().toString()===""`；主画布选择/元素 bounds 不变；松手 currentPage 按排序逻辑变化。

### T5 e2e
- 新增 `tests/e2e/feedback-fixes.mjs`（CDP 端口 9345，Chrome 缺失 SKIP+exit 0）：
  - 画廊：0 toast；拖封面 canvas rect 不变；滚轮后 window.scrollY 变化；点击卡片进入项目。
  - Logo：editor/gallery/preview 三处文本 `OPEN PPTD`。
  - 缩略图：选中文字为空；拖拽排序后 currentPage/页码正确；点击另一缩略图切页仍工作。
  - 编辑器越界 toast 仍出现（用一个含越界元素的临时项目或现有项目页）。
- 现有 e2e 全过；`package.json` 可把 feedback-fixes 加进 `test:editor`（一行）。

## 验收

1. `run-all` 39/39；dep-graph/contract 绿。
2. 全部 e2e（editor-minimal 21、page-ops 17、editor-ops 22、preview-shell 23、browser-export 15、incremental 5、feedback-fixes 全过）。
3. `golden-diff` 156/156 字节一致（本波不碰渲染）。
4. 写入范围外零 diff；无新增依赖；无旧 UI/API 变化。

## 禁触清单

`packages/**`、`editor/gallery.js` 的数据/预览逻辑（仅可加显式 static 选项）、`editor/interaction/**`、`editor/app/{state,api,keyboard}.js`、`tests/golden/**`、`tests/projects/**`、`tests/contract/**`、`contract.json`、`skill/**`。

## 交接 / 报告

分支最后一个 commit 写 `specs/2026-11-01-0743-open-pptd-3.1/handoff/W4-worker.md`（A/B/C，50–70 行）；最终报告含：改动、真实 e2e/门禁输出、画廊拖动与缩略图选中的前后证据、偏差、探索审计。
