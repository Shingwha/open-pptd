# Spec RP-B · rp-paint：paint 纯化 + capture 协议清理（W5）

> agent 代号 RP-B，分支 `feat/rp-paint`。深读：`docs/specs/ref/render-pipeline-plan.md` §3.3/§3.4/§4 场景 A/C、§5 M3/M4；总裁定见 `08-render-pipeline.md`。
> 前置：W4 全部合并（A6 ui-u2 + RP-A rp-foundations）。**这是风险主峰，黄金基线 diff 是唯一验收权威。**

## 目标

1. renderer 改为消费 LayoutTree 的纯绘制（layout 之后无测量、模型永不写回）。
2. headless 截图协议清理：addBinding 就绪事件、server 内联、装配分叉消除。
3. writer 表格行高/行距与 measure 单源对齐（内部结构不动）。

## 工单（建议 commit 顺序）

### T1 renderPage → paintPage 签名切换（M3 核心）

- `packages/renderer/page.js`：新增 `paintPage(layoutPage, ctx)`——所有尺寸从 `LayoutElement.frame` 读；旧 `renderPage(container, page, deck, theme, opts)` **保留为兼容适配器**（内部 resolve → layout(fontMetricsMeasure 默认) → paintPage），2.x 期间不删（契约 4 导出面稳定，`editor/index.js` 未导出它但 renderer 入口导出）。
- 逐元素渲染分片（`renderer/{text,shape,line,image,icon,table,chart,background}.js`）：签名改为消费 LayoutElement（或保持旧签名 + 由 paintPage 预注入 frame——选侵入更小者，报告说明）；**删除全部测量代码**：`autoGrowTexts`（page.js 版）、`TABLE_MEASURE_TOL`。
- `editor/types/*.js` 的 render 分片注册签名同步（注册表机制原样保留）。

### T2 双拷贝删除

- `editor/app/view/measure.js`（autoGrowTexts 第二份拷贝）整体删除；其调用点改走 layout 输出。
- 表格渲染：`<tr height>` 写 layout 精确 rowHeights；外层容器高度预设 + overflow:hidden 隐患同步消除（方案 §3.3）。

### T3 writer 接口对齐（M3 尾）

- `packages/writer/pptx.js` 表格部件：`a:tr` 行高消费 layout 的 rowHeights 精确值（接口对齐层，**OOXML 内部结构不动**）。
- 行距：spcPct 补偿的 factor 来源从"options.fontMetrics 现查"换成 `measure.lineHeightMultiplierFor(font)` 同表推导（方案 §3.1 行高单源）。
- 守门：公式/包一致性等既有回归全绿；这是行为变更白名单项（表格页与旧输出允许像素级差异，黄金 diff 逐页人工确认一次）。

### T4 capture 协议清理（M4）

- `renderer/headless/cdp.js`：删 `document.title` 150ms 轮询（`:114-128`），改 `Runtime.addBinding("pptdReady")` + 页面侧 paint 完成后调用（页面侧接线点 = paintPage 完成回调 / shot 装配尾部）。
- `editor/app/shot.js` 空桩 view 装配分叉消除：headless 页面 = "paint 挂 DOM、无 interaction 分片"的标准装配，与编辑器共享 main 流水线（复用 `createEditor` 的 paint 通道或抽出的装配函数——以最小侵入为准，`editor.js`/`main.js` 的改动只许是抽出共享装配，行为不变）。
- server 内联：渲染命令默认跳过临时 server，paint 产物 `page.setContent()` 注入（resolve 阶段资源已在内存）；临时 server 仅留 `--debug-server` 后门。整条链 ~500 行 → ~200 行。
- `tests/e2e/render.mjs` 同步；`__pptdShot` 对外行为与 `?shot=1` 语义不变（ui-shots 仍可用）。

## 验收（完成前自测）

1. `node tests/run-all.mjs` 全绿（独立确认退出码）。
2. **黄金 diff**：`node tests/tools/golden-diff.mjs`——非表格页应全一致；表格页差异逐页 Read 目检并在报告里给出"确认接受"清单；任何非白名单漂移 = 打回。
3. `node bin/open-pptd.js render`（任一项目）输出与基线一致；链路行数统计（`git diff --stat` 里 headless 相关净删除）写入报告。
4. `grep -rn "scrollHeight\|offsetHeight\|offsetWidth" packages/renderer/ editor/app/view/` 仅剩 layout/adapters（dom 桩）合法处。
5. `git diff main -- packages/model/ packages/measure/ packages/layout/` 为空（本刀不动 RP-A 产物与模型层）。
6. dep-graph 绿（T5 已放行的 `renderer→layout`、`writer→measure` 边真实使用）。

## 禁触清单

`packages/model/**`、`packages/measure/**`、`packages/layout/**`（RP-A 所有物，只许 import）、`editor/interaction/**`、`editor/styles/**`、`editor/app/project/**`、`package.json`、`contract.json`、`docs/specs/**`。
