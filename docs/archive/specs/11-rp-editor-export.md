# Spec RP-C · rp-editor-export：图片导出统一 + 编辑器布局适配（W6）

> agent 代号 RP-C，分支 `feat/rp-editor-export`。深读：`docs/specs/ref/render-pipeline-plan.md` §3.5/§3.6/§4 场景 B、§5 M5/M6；总裁定见 `08-render-pipeline.md`（**含 M5 修订：capture 优先 + 浏览器探测失败回退 foreignObject+体检**）。
> 前置：W5（RP-B）合并。

## 目标

1. 图片导出统一：本地优先 capture，回退路径带逐元素体检，消灭静默白图。
2. 编辑器选中框/对齐线/越界警告读 LayoutTree.frame；domMeasure 精修接入；dirty 判定不再被测量写回污染。

## 工单

### T1 export-image 统一（M5，按裁定修订）

- `editor/app/export-image.js`：本地/serve 模式**优先**走 capture（经 server 端点触发 headless 出图——`packages/server/` 加 `POST /api/export-image`，复用 RP-B 的内联 capture 管线）；**探测不到可用浏览器（Chrome/Edge）或调用失败时回退现有 foreignObject 链**。
- foreignObject 路径（本地回退 + 部署态共用）加**逐元素体检**：序列化前扫描 `<img>`/外链/CSS 不兼容特性 → `ExportImageResult { png, droppedElements[] }`；UI toast 明示「N 个元素未能导出」，逐元素清单进 console + 返回值。
- 前端直连路径的用户可感知行为不回退：无 Node 场景（GitHub Pages）照常出图（体检后）。

### T2 编辑器适配（M6）

- 选中框/拖拽手柄/对齐参考线：从读 `el.bounds` 改读 LayoutTree frame（U1 的选择模型之上叠加——只换几何来源，不动选择状态机）；表格长高后选中框贴合实际。
- domMeasure 适配器接线：编辑器内 paint 前对变更元素批量离屏测量，结果存 layout 缓存（`packages/measure/adapters/dom.js` 的桩由 RP-A 留好），**不进模型**。
- 越界警告：画布上消费 layout overflow 事实（轻提示，样式用既有 toast/状态条，不新增常驻浮层——U2 已实现画布零浮层，勿回退）。
- `syncDirty` 的"被动同化进基线"特例赦免删除（写回没了，特例失去存在理由）——`editor/app/state.js` 最小增量。

## 验收（完成前自测）

1. `node tests/run-all.mjs` 全绿（独立确认退出码）。
2. 黄金 diff 与 W5 合并时点一致（本刀不该再引起渲染漂移；有则打回）。
3. 图片导出三分支实测：① 有浏览器环境走 capture 出图；② 模拟无浏览器（临时改探测结果或注入 flag）回退 foreignObject + 体检，构造含外链图的临时项目验证 `droppedElements` 非空且 toast 明示；③ 部署态（静态）出图带体检。
4. 编辑器：选中表格 → 拖拽改列宽/行内容撑高 → 选中框实时贴合（读 frame）；含越界元素的页出现轻提示；撤销/重做后 dirty 判定干净（无测量写回污染）。
5. `git diff main -- packages/renderer/ packages/writer/ packages/model/` 为空（除 server 端点外不碰引擎；server 端点属授权范围）。
6. 手动用例报告逐条打勾：表格选中框贴合、对齐参考线随 frame、越界提示、domMeasure 后文本无跳变、导出三分支。

## 禁触清单

`packages/renderer/**`、`packages/writer/**`、`packages/model/**`、`packages/measure/**`、`packages/layout/**`、`editor/styles/**`（如需新样式走既有令牌与 primitives）、`editor/index.html`、`package.json`、`contract.json`、`docs/specs/**`。
