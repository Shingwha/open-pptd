# W5 · 恢复添加形状 / 线条 / 图片

> 分支由 lead 派工时创建。最高约束：只恢复“新建 + 选择/变换/删除/复制”能力；不恢复属性面板、样式面板、图标 picker、组合/对齐等旧 UI；不改渲染/导出语义。

## 目标

添加菜单从 3 类扩为 6 类：文字 / 表格 / 图表 / 形状 / 线条 / 图片。
- **形状**：从内置 187 个 preset 中选一个（可搜索），插入默认尺寸/主题色；插入后可选中/拖动/缩放/删除/复制。
- **线条**：直线 / 箭头线（可后续再加虚线），默认主题色；同样只做变换/删除/复制。
- **图片**：本地 PNG/JPG/GIF；读取为 dataURL，插入固定默认框（fit contain/cover），保存/导出时由现有 `persistDataUrlImages` 落 media；拒绝 WebP/SVG 等不支持格式并提示。
- 不新增内容编辑器、不做形状换型/改色/边框/裁剪/行列等编辑；这些仍属于“最小编辑器”之外。

## 前置上下文

- 必读：`ref/repo-map.md` → `handoff/W4-worker.md`（先修完 4 个体感问题）→ `editor/types/{text,table,chart}.js`、`editor/interaction/add-menu.js`、`editor/app/{api,toolbar}.js`、旧 shard 参考（`git show 3a3ce7b^:editor/types/{shape,line,image}.js`）。
- 现有事实：
  - `editor/types/index.js` 的 `ADD_TYPE_IDS` 只有 text/table/chart；`createElement(type)` 调 `def.create()`。
  - `editor/interaction/add-menu.js` 是扁平菜单，`onAdd(type)`；`toolbar.js` 分派到 api.addText/Table/Chart。
  - `editor/app/api.js` 的 `addContent(type)` 负责 beginChange/add/select/render，表格/图表自动开编辑器。
  - 模型已导出 `SUPPORTED_SHAPES`、`PRESET_SHAPES`、`shapeMenuIcon`；renderer/writer/model 的 shape/line/image 渲染与导出完整。
  - 图片保存/导出：`editor/app/project/images.js` 的 `rebuildImageMap` / `persistDataUrlImages` 已处理 dataURL→media；`io` 暴露 `rebuildImageMap`。
  - 旧 shard（删除前）含 create 默认值可复用，但 menu/props/quickbar 不要恢复。
- 稳定区：`packages/**`（除非发现模型/渲染缺口，先报告）、`editor/app/view/**`、`editor/interaction/{canvas,stage}.js`、`editor/app/{state,keyboard}.js`、`tests/golden/**`、`tests/projects/**`、`contract.json`、`skill/**`。

## 工单

### T1 类型 shard
- 新建 `editor/types/shape.js`：
  - `registerType({ type:"shape", label:"形状", addIcon, addHint, create:(name)=>..., addVariants: () => [{id,label,group,icon}] })`
  - `create(name)` 用 `PRESET_SHAPES`/`SUPPORTED_SHAPES`；默认 bounds [380,200,160,110]、`fill:{type:"solid",color:"$primary"}`；未知 name 回退 `rect`。
- 新建 `editor/types/line.js`：
  - variants：`line`（直线）、`arrow`（箭头线）、`dash`（虚线箭头）；create 设置 viewBox/points/border/arrow。
- 新建 `editor/types/image.js`：
  - `create(dataUrl, {w,h})`；默认 [330,160,320,200]、`fit:{mode:"contain"}`；
  - 导出 `pickLocalImage({api,ui})`（file input accept .png/.jpg/.jpeg/.gif，MIME 校验，FileReader→api.addImageElement）；
  - 不恢复 props/quickbar。
- `editor/types/index.js`：`ADD_TYPE_IDS = ["text","table","chart","shape","line","image"]`；`createElement(type, variant)` 透传 variant；导出 `variantsOf(type)`；内容编辑器集合仍 text/table/chart。

### T2 API
- `editor/app/api.js`：
  - 通用 `addElementOfType(type, variant)`（beginChange/add/select/render；text/table/chart 维持自动开编辑器；image 调 `io.rebuildImageMap()`）。
  - 暴露 `addShape(name)`、`addLine(variant)`、`addImage(dataUrl)`，保留 addText/Table/Chart。
  - 新类型不自动打开任何编辑器；添加后选中，可直接拖动/缩放/复制/删除。
- 只允许改：`editor/app/api.js`、`editor/types/{shape,line,image,index}.js`。

### T3 添加菜单
- `editor/interaction/add-menu.js`：6 个一级项；shape/line 点击后在菜单内展开变体面板（shape：搜索 + 可滚动网格，图标用 `shapeMenuIcon`；line：3 个变体）；image 触发 `pickLocalImage`。
- `editor/app/toolbar.js`：onAdd 分派到 api；image 需要传 ui。
- 样式：在 `editor/styles/panels.css` 加变体面板/搜索/网格（沿用 W2 token；无新设计系统）；菜单关闭/Esc/外部点击行为保留。
- 一级顺序固定：文字/表格/图表/形状/线条/图片；shape/line 变体按钮带 `data-variant`，便于 e2e。

### T4 图片落盘
- 添加图片后 `io.rebuildImageMap()`；保存/导出沿用 `persistDataUrlImages`/`mediaFilesOfDeck`，不新增第二套媒体逻辑。
- 拒绝非 PNG/JPG/GIF（toast/dialog 提示），不写半截元素。

### T5 e2e
- 更新 `tests/e2e/editor-minimal.mjs` 的添加菜单断言：6 项、顺序；text 项仍可直接添加。
- 新增 `tests/e2e/add-elements.mjs`（CDP 端口 9346，Chrome 缺失 SKIP+exit 0）：
  - 打开菜单 → 6 项；
  - 形状 → 面板 → 搜索“矩形”→ 选 `rect` → 元素数 +1、类型 shape、shapeName rect、选中、undo 移除；
  - 线条 → 选 arrow → 类型 line、arrow 末端、undo；
  - 图片：调用 `api.addImage(<1×1 PNG dataURL>)` → 类型 image、imageMap 有该 src、选中；菜单图片项存在；
  - 复制/重复新增元素正常；
  - 保存后 media 落盘（可用 `io.saveProject()` + 读取项目目录验证 `media/*.png`；或 `persistDataUrlImages` 结构断言）。
- `package.json` 的 `test:editor` 加入 add-elements（若已有 feedback-fixes）。

## 验收

1. `run-all` 39/39；dep-graph/contract；golden 156/156。
2. 现有 e2e 全过（editor-minimal 需同步 6 项）；feedback-fixes 过。
3. add-elements 全过；新增元素可拖动/缩放/复制/删除，undo 可撤销。
4. 图片保存/导出后 media 字节存在，PPTX 包一致；拒绝格式提示清楚。
5. 写入范围外零 diff；无新增依赖；不恢复属性/样式面板。

## 禁触清单

`packages/**`（除确认缺口后报告）、`editor/app/{state,keyboard}.js`、`editor/app/view/**`、`editor/interaction/{canvas,stage}.js`、`editor/preview.js`、`tests/golden/**`、`tests/projects/**`、`contract.json`、`skill/**`。

## 交接 / 报告

最后一个 commit 写 `specs/2026-11-01-0743-open-pptd-3.1/handoff/W5-worker.md`（A/B/C，50–70 行）；报告含：6 类菜单、形状/线条默认值、图片落盘路径、e2e 真实输出、与 spec 偏差、探索审计。
