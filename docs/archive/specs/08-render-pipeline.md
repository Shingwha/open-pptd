# Spec · 渲染管线重构总纲（08-render-pipeline）

> 权威参考：`docs/specs/ref/render-pipeline-plan.md`（方案全文，含三段式架构、LayoutTree 类型、M0–M6 迁移序列）。
> 本文件是范围裁定：哪些进本次 2.0、怎么切波次、与 UI 刀如何衔接。三个工单：`09-rp-foundations.md`（RP-A）、`10-rp-paint.md`（RP-B）、`11-rp-editor-export.md`（RP-C）。

## 1. 范围裁定（lead 拍板）

| 里程碑 | 做/不做 | 归属 | 裁定理由 |
|---|---|---|---|
| M0 黄金基线 + 字体度量表 | ✅ 做 | RP-A | 廉价、保护性；M3 验收依赖它 |
| M1 measure 包 | ✅ 做 | RP-A | 价值地基：文字高度三套体系收敛为一 |
| M2 layout 包 + validate 切换 | ✅ 做 | RP-A | overflow 事实是"预览=导出=校验"三角地基 |
| M3 paint 纯化 + writer 接口对齐 | ✅ 做 | RP-B | 核心价值：消灭"边画边量边写回"（风险主峰，黄金基线守门） |
| M4 capture 协议清理 | ✅ 做 | RP-B | addBinding 就绪 + setContent 内联 + 装配分叉消除 |
| M5 export-image 统一 | ✅ 做（**有修订**） | RP-C | 见 §2 修订 1 |
| M6 编辑器适配 | ✅ 做 | RP-C | 选中框/对齐线读 frame；须在 U1/U2 合并后做 |
| paint-svg 第二绘制后端 | ❌ 本次不做 | — | "够用子集"定位有价值但非必需；黄金 diff 用 PNG 像素对比已覆盖；列入 2.x backlog |
| Canvas 后端 | ❌ 不做（方案本身列可选） | — | — |
| 图表 I20/I22 | ❌ 不做 | — | 维持文档化接受项 |
| writer OOXML 内部结构 / editor 状态层大改 / PPTD 格式 / CLI 命令面 | ❌ 不做 | — | 方案头部自定的边界，与本次总红线一致；editor 状态层仅允许 §3.6 的最小适配 |

**与 UI 刀的关系**：RP-A（纯 `packages/` + 测试）与 A6 ui-u2（纯 `editor/`）写入范围不相交，**并行**；RP-B/RP-C 串行在其后（paint 签名切换要动 editor 调用点，必须等 editor 稳定）。

## 2. lead 修订（偏离原方案处，均已定案）

1. **M5 本地模式不"一律走 capture"**：改为 **capture 优先 + 探测不到浏览器时回退 foreignObject**。理由：headless Chrome/Edge 在用户机器上不保证存在（R-9 同源风险），编辑器图片导出不能因此回归不可用；回退路径必须带原方案的逐元素体检（`ExportImageResult { png, droppedElements[] }`），消灭静默白图的目标不变。部署态（GitHub Pages）维持 foreignObject + 体检。
2. **黄金基线的存放**：PNG 本体 gitignore（`tests/golden/png/`），**每页感知哈希 + 元数据进 `tests/golden/manifest.json` 入库**；diff 工具 `tests/tools/golden-diff.mjs` 输出哈希不一致清单 + 差异 PNG 供人工复核。理由：全量 PNG 入库会让仓库膨胀几十 MB。
3. **基线规模以现状为准**：仓库现有 15 套 examples + `tests/projects/` 全部测试项目（方案写的"24 examples"是旧计数）。
4. **group 元素（U1 新增）**：layout 阶段跳过组壳、逐成员布局（与 renderer 的 `renderPage` 跳过语义一致）；组 frame 由 editor 侧现逻辑计算，不进 LayoutTree。
5. **M1 的 LaTeX 估算维持方案的简化式**（行内 0.5em×max(2,长度/4)、独占段 1.6 倍行高），不做精确排版。
6. **新增包是纯新增导出**：`CONTRACT_VERSION` 维持 2 不 bump（§4.4：纯新增不递增）；`package.json` exports 与 `contract.json` 增补 `./measure`、`./layout` 两个条目（RP-A 执行，属跨波授权改动）。

## 3. 波次与写入范围（并入总波次表）

| 波次 | Agent | 内容 | 写入范围 | 前置 |
|---|---|---|---|---|
| W4 ∥ | RP-A | M0+M1+M2（`09-rp-foundations.md`） | `packages/measure/**`、`packages/layout/**`（均新建）、`packages/model/validate.js`、`package.json`（仅 exports 增 2 条）、`contract.json`（仅 entries 增 2 条）、`tests/contract/public-api.mjs`（增 2 入口断言）、`tests/regression/validate.mjs`（行为变更同步）、`tests/regression/` 新增 measure/layout 套件、`tests/run-all.mjs`（注册新套件）、`tests/tools/golden-*.mjs`、`tests/golden/**`、`.gitignore`、`tests/regression/dep-graph.mjs`（边表扩展）、`docs/embedding.md`（新入口） | W2 |
| W5 | RP-B | M3+M4（`10-rp-paint.md`） | `packages/renderer/**`、`packages/writer/**`（仅接口对齐）、`editor/app/view/{view,measure}.js`、`editor/app/{present,shot,export-image}.js`、`editor/types/*.js`（render 分片签名）、`tests/e2e/render.mjs` | W4 全部合并 |
| W6 | RP-C | M5+M6（`11-rp-editor-export.md`） | `editor/app/export-image.js`、`editor/interaction/{canvas,stage,coords}.js`、`editor/app/state.js`（仅 syncDirty 特例删除）、`packages/server/**`（如 capture 需要出图端点） | W5 |
| W7 | lead | 终验：全量回归 + 黄金 diff 复核 + 版本 2.0.0 + 汇总 | — | W6 |

**dep-graph 边表目标形态**（两个 agent 分步达成，最终态一致）：
- 允许的跨包边：`{writer, renderer, layout, measure} → model`；`layout → measure`；`renderer → layout`；`writer → measure`；writer/renderer → vendor（既存）。
- 继续禁止：model → 任何兄弟包；任何 packages → editor；editor → server/cli；editor 深路径（规则 6）。
- `measure`/`layout` 加入双端纯净扫描（无 node:/fs/window./document.，headless 豁免不适用）。

## 4. 不变式（三铁律，全程生效）

1. **layout 之后无测量**：paint 只读 LayoutTree，不碰 scrollHeight/offsetWidth。
2. **模型永不写回**：`el.bounds` 是作者声明，LayoutTree 是排版事实；渲染/校验/选中框不写回模型。
3. **MeasurePort 默认确定性**：默认 fontMetricsMeasure 纯函数（Node/CI 可跑可快照）；domMeasure 只是浏览器内可选精修适配器，结果存 layout 缓存、不进模型。
