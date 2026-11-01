# W5 handoff · 恢复添加形状 / 线条 / 图片

> 分支 `feat/3.1-w5-add`，起点 `main 94afe9a`；Windows + Git Bash + Node 24；零新增依赖；本机 Chrome。
> 写入仅：`editor/types/{shape,line,image,index}.js`、`editor/app/{api,toolbar}.js`、`editor/interaction/add-menu.js`、`editor/styles/panels.css`、`tests/e2e/{editor-minimal,add-elements}.mjs`、`package.json`（test:editor 一行）、本文件。`packages/**`、`editor/app/{state,keyboard}.js`、`editor/app/view/**`、`editor/interaction/{canvas,stage}.js`、`editor/preview.js`、`tests/{golden,projects}`、`contract.json`、`skill/**` 零 diff；未 merge/push/tag，未碰主检出与其他 worktree。

## A. 自测真实输出

```text
# 开工基线（94afe9a）
$ node tests/tools/dump-formula-mml.mjs → KaTeX MathML 生成: 204/204
$ node tests/run-all.mjs → 结果: 39/39 通过 ✅
$ node tests/e2e/{editor-minimal,page-ops,editor-ops,preview-shell,feedback-fixes}.mjs
  → 21/21、17/17、22/22、23/23、21/21 ✅
$ node tests/tools/golden-diff.mjs → 24 项目/156 页；字节一致 156、感知一致 0；无未登记漂移 ✅

# 完工（最终代码）
$ npm run test:editor → 21/21、17/17、22/22、21/21、12/12 通过 ✅（新增 add-elements）
$ node tests/e2e/render.mjs → 9/9；incremental-load → 5/5；browser-export → 15/15 ✅
$ node tests/run-all.mjs → 结果: 39/39 通过 ✅（含 UI 令牌字面量门禁）
$ node tests/regression/dep-graph.mjs → ✓ 依赖方向与环境全局检查通过
$ node tests/contract/public-api.mjs → 结果: 契约通过 ✅
$ node tests/tools/golden-diff.mjs → 字节一致 156 页；感知一致 0；无未登记漂移 ✅
```

`add-elements` 关键事实：菜单 `["text","table","chart","shape","line","image"]`；形状面板 187 变体/15 分组，搜索“矩形”12 项、无命中空态；rect 默认 `[380,200,160,110]` + `$primary`、选中、undo 移除；线条三变体、arrow 默认 `[180,300,560,40]`/`viewBox [560,40]`/`points 10,20 550,20`/2px `$primary`/`[null,"arrow"]`、undo 移除；图片用 1×1 PNG dataURL 创建，`[330,160,320,200]`/contain、`imageMap` 有该 src；移动 `[350,170,300,180]`、复制/粘贴/重复/删除计数 +1/+1/+1、undo 回基线；保存后 `media/image1.png` 70 字节、PNG 签名、磁盘 page 含 `src: media/`、imageMap 反向映射仍为 dataURL；选择器拒绝 WebP（toast「仅支持 PNG / JPG / GIF 图片」、元素数不变）并接受 PNG。

## B. 实现 / 偏差 / 坑

**T1 类型 shard**：`shape.js` 由 `SUPPORTED_SHAPES` 生成并缓存 187 个 `addVariants`（`shapeMenuIcon` 图标、按 preset 分类分组），`create(name)` 未知名回退 `rect`，`adjustments:null`、`fill:{type:"solid",color:"$primary"}`。`line.js` 三变体 line/arrow/dash（dash 换 `border.style:"dash"`，非 line 末端 `[null,"arrow"]`），create 显式写 viewBox/points/border。`image.js` `create(src,{w,h})` 无 src 返回 null、默认 320×200 contain；`pickLocalImage({api,ui})` 用隐藏 file input（accept PNG/JPG/GIF）、MIME 优先+空 MIME 扩展名兜底、非法格式 toast 且不写元素、FileReader→`api.addImage`。三个 shard 均无 props/quickbar。

**T1/T2 注册与 API**：`index.js` `ADD_TYPE_IDS` 六项、新增 `CONTENT_TYPE_IDS`（text/table/chart）、`createElement(type,variant)` 透传并对 null 防御、`variantsOf(type)`。`api.js` 通用 `addElementOfType(type,variant)`：beginChange→add→select→（image 时 `io.rebuildImageMap()`）→render→仅 table/chart 开内容编辑器；暴露 `addShape/addLine/addImage`，`addText/Table/Chart` 保留且行为不变。

**T3 菜单**：`#add-list` 内 root/panel 两视图；一级固定六项，shape/line 带 `aria-expanded` 与 chevron；shape 展开 `add-panel`（返回按钮+搜索+按分组 5 列网格+空态，Enter 取首个匹配），line 展开三行变体；所有变体按钮 `data-variant`，顶部项 `data-add-type`；选中即 close 并回调。外部 pointerdown/Esc 关闭、fab aria-haspopup/expanded 保持；image 由 toolbar 调 `pickLocalImage({api,ui})`。样式仅用 W2 token，门禁通过。

**图片落盘**：未新增媒体逻辑；保存走既有 `persistDataUrlImages`，导出仍用 `mediaFilesOfDeck`，e2e 以真实 `io.saveProject()` 验证磁盘字节。

**偏差**：① `editor/skeleton.js` 的 `#btn-add` title 仍写“文字 / 表格 / 图表”（不在允许清单，未改，仅提示文案）；② T1 提及 `api.addImageElement`，按 T2 统一为 `api.addImage`；③ 菜单关闭后变体面板 DOM 保留但隐藏，下次打开重建；④ e2e 比工单多覆盖空搜索结果、回车选择、图片选择器拒绝/接受（stub input.click + DataTransfer，避免 OS 文件框）；⑤ 未恢复属性/样式面板、图标 picker、组合/对齐。

**坑**：可滚动断言必须在搜索过滤前量，否则 scrollHeight 随结果收缩；页面基类元素（文本）使计数断言需用增量而非绝对值；选择器测试要临时替换 `HTMLInputElement.prototype.click`；相同 dataURL 的多份图片沿用既有 `collectMediaFiles` 按 dataURL 去重，只落一个 media 文件（3.0 既有语义，未改）。

**探索审计（只读）**：工单 3 份、`handoff/W4-worker.md`、`ref/repo-map.md`；现有 `editor/types/{text,table,chart,index}.js`、`editor/interaction/add-menu.js`、`editor/app/{api,toolbar}.js`、`editor/app/project/{images,io,loader,saver}.js`、`editor/dom.js`、`editor/styles/{panels,tokens}.css`、`packages/model/{registry,types/line,geometry}.js`、`packages/renderer/{line,image}.js`、旧 shard（3a3ce7b^ 的 shape/line/image）、`tests/e2e/{editor-minimal,feedback-fixes,browser-export}.mjs`、`packages/renderer/headless/cdp.js`、`tests/regression/ui-token-literals.mjs`、`package.json`。未全仓重读，未改稳定区。

**未决**：`#btn-add` title 待 lead 决定是否单独修 skeleton；允许格式仅 PNG/JPEG/GIF（不扩 WebP/SVG）；e2e 未直接导出 PPTX，形状/线条写盘由 run-all 的 preset-shapes/line/export-media 与 golden 覆盖；同一 dataURL 多图第二份仍留内联，属既有媒体收集策略。

## C. commit / 文件

| commit | message |
|---|---|
| `fc5e98b` | feat(editor): 恢复形状/线条/图片类型与添加 API |
| `eebb6e2` | feat(editor): 添加菜单扩为六类（形状网格/线条变体/图片选择） |
| `550b382` | test(e2e): 添加菜单六类断言与新增元素回归 |
| （本文件） | docs(w5): 写 W5 交接 |

新增：`editor/types/{shape,line,image}.js`、`tests/e2e/add-elements.mjs`（CDP 9346，Chrome 缺失 SKIP+exit 0）、本文件；修改：`editor/types/index.js`、`editor/app/{api,toolbar}.js`、`editor/interaction/add-menu.js`、`editor/styles/panels.css`、`tests/e2e/editor-minimal.mjs`、`package.json`（test:editor 追加 add-elements）。
