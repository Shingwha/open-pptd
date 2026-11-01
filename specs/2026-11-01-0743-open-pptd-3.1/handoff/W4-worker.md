# W4 handoff · 试用反馈修复（画廊静态 / 越界提示 / 字标 / 缩略图选中）

> 分支 `feat/3.1-w4-feedback`，起点 `main 3fc4a8c`；Windows 10.0.28120 + Git Bash + Node 24；零新增依赖；本机 Chrome。
> 写入仅：`editor/preview.js`、`editor/app/view/view.js`、`editor/skeleton.js`、`editor/app/view/thumbnails.js`、`editor/styles/layout.css`、`tests/e2e/feedback-fixes.mjs`、`package.json`（test:editor 一行）、本文件。`packages/**`、`editor/interaction/**`、`editor/app/{state,api,keyboard}.js`、`tests/golden|projects|contract`、`contract.json`、`skill/**` 零 diff；未 merge/push/tag。

## A. 自测真实输出

```text
# 开工基线（3fc4a8c）
$ node tests/tools/dump-formula-mml.mjs → KaTeX MathML 生成: 204/204
$ node tests/run-all.mjs → 结果: 38/39 通过 ❌（仅 CLI 命令面：open --detach 子进程死）
  根因（环境）：开工时 55173 为用户运行中服务，55174 被本机外部 socket 占用（bind 报 EACCES），
  server 只对 EADDRINUSE 递减端口 → detach 失败；该 socket 释放后复跑 39/39。与代码无关，未改 packages/**。
$ node tests/e2e/{editor-minimal,page-ops,editor-ops,preview-shell,browser-export,incremental-load}.mjs
  → 21/21、17/17、22/22、23/23、15/15、5/5 ✅
$ node tests/tools/golden-diff.mjs → 24 项目/156 页；字节一致 156、感知一致 0；无未登记漂移 ✅

# 完工（最终代码）
$ npm run test:editor → 21/21、17/17、22/22、21/21 ✅（新增 feedback-fixes）
$ node tests/e2e/render.mjs → 9/9 ✅
$ node tests/e2e/feedback-fixes.mjs → 21/21 通过 ✅
$ node tests/run-all.mjs → 结果: 39/39 通过 ✅
$ node tests/regression/dep-graph.mjs → ✓ 依赖方向与环境全局检查通过
$ node tests/contract/public-api.mjs → 结果: 契约通过 ✅
$ node tests/tools/golden-diff.mjs → 字节一致 156 页；感知一致 0；无未登记漂移 ✅
```

**修复前 e2e 反向证据**（临时 `git checkout` 回旧代码，同一新套件跑出 **10/21**）：
`画廊 toast count=3`；封面 `.canvas` rect x `17.6→77`、`panningDown/Move=true`、wheel 被 cancel；embedded 预览 `embPanning=true`、`embZoom 1→1.1`、`embToasts/fullToasts=1`；三处字标 `OPEN/PPTD`；缩略图 `userSelect:auto`、`thumbText="\n第1页\n越界"`、拖动后选区 `"选区探针"` 未清。
**修复后 21/21**：封面 rect `{x:17.6,y:346.5,w:712.9,h:401}` 前后一致、`panning=false`、wheel 返回 `true`；全量 10 个 PPT 封面绘制（含含越界页的「山茗集」）`toast.count=0`；`window.scrollY 0→420`；三处字标 `OPEN PPTD`；`thumbText=""`、`selBefore=4→down/up=""`；拖拽排序后 markers 尾项「第1页」、`cur=7`、`8 / 8`、`active=7`，主画布选中数与元素 bounds 不变（dx/dy=0）；真实 CDP 鼠标点击切到 `1 / 8`、×删除 8→7、undo 回 8、滚轮 `scrollLeft 0→63`。

## B. 实现 / 偏差 / 坑

**T1 预览静态**：`preview.js` 新增内部 `interactive`（`options.interactive ?? chrome === "full"`），只有 `!editable && interactive` 才 `bindViewerChrome()`。embedded 默认不绑 pan/zoom/wheel/缩放/翻页键/window resize；`chrome:"full"` 的非编辑预览保持全部交互（e2e 用 ctrl+wheel 验证 zoom=1.1）。画廊封面调用未改（仍 `chrome:"embedded"`，其 ResizeObserver 自己重绘）。`interactive` 未写入公共契约文档。
**T2 越界提示**：`view.js#renderCanvas` 改为 `if (editable) notifyOverflow(...)`；预览/封面不弹也不写去重表。编辑器仍按原逻辑弹（e2e 临时项目第 1 页含 900,500,200,80 元素，toast 文本含「超出画布」）。
**T3 字标**：`skeleton.js` 3 处 `OPEN/PPTD`→`OPEN PPTD`（82/154/181），字距/字重规则未动。
**T4 缩略图**：`pointerdown`（非 button）`preventDefault()` + `getSelection().removeAllRanges()`；拖动释放时再清一次；`.thumb`/`.thumb-canvas` `draggable=false`，每次 paint（含 refreshThumb）后把 `img.draggable=false`；`layout.css` 对 `.thumbbar/.page-thumbs/.thumb-item/.thumb/.thumb *` 设 `user-select:none`、`.thumb img` 设 `-webkit-user-drag:none`。点击切页/排序/×删除/横向滚轮全部由 e2e 实测通过；`pointerdown` 取消不吞 `click`（真实 CDP 鼠标验证）。
**坑**：`.thumb-canvas` 内文字现在 `user-select:none`，`Selection.toString()` 本来就为空；清选区的断言改用缩略条外的临时探针，同时断言 `thumbText===""` 证明内容不可选。拖拽排序后缩略条会 `scrollIntoView` 当前页，真实点击前必须把 `scrollLeft` 归零，否则点到视口外。
**偏差**：① `notifyOverflow` 未加 console.debug（工单为“可”）；② 拖动释放额外清一次选区；③ e2e 比工单多覆盖 full preview 静默 + 交互、embedded 显式静态、真实鼠标点击/删除；④ 未改 gallery/canvas/panels.css（无相关规则需求）；⑤ 未写 `interactive:true` 的宿主开启用例（内部选项，不进契约）。
**探索审计（只读）**：工单 3 份 + `editor/{preview,skeleton,gallery,main,editor,context}.js`、`editor/app/view/{view,thumbnails}.js`、`editor/app/{present,toast}.js`、`editor/styles/{layout,canvas,gallery}.css`、`package.json`、`tests/e2e/{preview-shell,page-ops,editor-minimal,incremental-load}.mjs`、`tests/cli/surface.mjs`、`packages/cli/open.js`（detach 端口逻辑）、`packages/layout/index.js`（overflow 字段）；netstat/端口 bind 探测一次（未触碰 55173）。未全仓重读、未碰主检出与其他 worktree。
**未决**：临时项目无图片元素，`img.draggable` 断言在 0 张图片时为空真（代码/CSS 已覆盖，png 画廊封面未单独断言）；CLI 若再遇 55174 被占会重现 38/39（环境/端口管理，属 packages/server 稳定区，未修）；`interactive` 选项无公共文档，宿主需知内部约定。

## C. commit / 文件

| commit | message |
|---|---|
| `25f5a15` | fix(editor): 嵌入式预览默认静态，越界提示仅编辑器 |
| `c90e8ea` | fix(editor): 品牌字标改为 OPEN PPTD |
| `197e1c6` | fix(editor): 缩略图拖拽不再选中页面内容 |
| `6431976` | test(e2e): 新增试用反馈回归（静态封面/越界/字标/缩略图选中） |
| （本文件） | docs(w4): 写 W4 交接 |

修改：`editor/preview.js`、`editor/app/view/view.js`、`editor/skeleton.js`、`editor/app/view/thumbnails.js`、`editor/styles/layout.css`、`package.json`（test:editor 追加 `tests/e2e/feedback-fixes.mjs`）。新增：`tests/e2e/feedback-fixes.mjs`（CDP 9345，Chrome 缺失 SKIP+exit 0）、本文件。
