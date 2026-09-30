# open-pptd 渲染管线重构方案

> 范围：**只做渲染管线**——从 Deck 模型到视觉输出之间的全部环节（测量、布局、DOM 绘制、无头截图、图片导出、预览/导出一致性）。
> 不动：writer 的 OOXML 内部结构、editor 状态层、PPTD 格式契约、CLI 命令面。
> 依据：前期代码考古（30 个妥协点清单）中与渲染管线相关的 9 项 + 表格高度耦合专项分析。

---

## 1. 现状诊断：渲染管线的六个病根

| # | 病根 | 证据 | 后果 |
|---|---|---|---|
| R1 | **渲染函数 mutate 输入模型** | `renderer/page.js:69-81` autoGrowTexts 把 scrollHeight 写回 `el.bounds[3]`；`editor/app/view/measure.js:13-42` 是**同逻辑的第二份拷贝**；表格写回靠 `TABLE_MEASURE_TOL=8` 防"+1px 无界增长"自激回路 | 渲染层污染数据层；dirty 判定被写回污染；同一段逻辑维护两遍 |
| R2 | **文字高度三套体系** | ①浏览器 scrollHeight 实测 ②writer 的 spcPct 行距补偿（兜底 1.2）③`validate.js:253-275` 拍脑袋启发式（LaTeX 按一个"∑"估） | 预览/导出/校验三方对"这行字多高"没有共同答案 |
| R3 | **表格高度无单源真相** | `model/table.js:207` estimateTableLayout 只做 min-height，实际高度两端引擎各自撑高；模型的 `bounds[3]` 是陈旧值，但 validate 的越界检查仍消费它 | 表格在 PPT 里比预览静默长高（行距兜底 1.2 vs 雅黑实测 1.32）；超高越界、压下方元素均无检测 |
| R4 | **headless 截图是重机械 + 土协议** | 临时 server + 探测本机 Chrome + 自研 WebSocket + CDP 共 ~500 行；**用 `document.title` 字符串当跨进程就绪信号**，150ms 轮询（`renderer/headless/cdp.js:114-128`）；`editor/app/shot.js` 用空桩 view 分叉装配 | 协议脆弱（任何页面逻辑碰 title 即坏）；装配分叉是 bug 培养皿 |
| R5 | **前端图片导出走 foreignObject 脆弱链** | `editor/app/export-image.js`：DOM 序列化进 SVG 再栅格化；任何不兼容节点整张图**静默变白**，外链图直接丢 | 用户拿到白图无感知；与 headless 截图是两套渲染路径，输出不一致 |
| R6 | **图表预览/导出布局漂移** | ECharts 布局引擎 vs PowerPoint 布局引擎；chart-rework-p0 已收口大部分，I20（nice-number）/I22（气泡尺寸）为文档化的"接受项" | 已知裂缝，靠文档兜底 |

**根因一句话**：现有管线没有"布局"这个独立阶段——几何信息（多高、多宽、断几行）散落在 DOM 实测、导出补偿、校验估算三处，渲染函数被迫边画边量边写回。**本方案的核心就是把这个缺失的阶段补出来。**

---

## 2. 目标架构：三段式渲染管线

```
                    ┌─────────────────────────────────────────────┐
 Deck ──①──▶ ResolvedDeck ──②──▶ LayoutTree ──③──▶  Paint 后端     │
        resolve          layout            paint   ├─ DOM（预览）   │
     （已有，主题解析/      （★本次新增：     （纯函数   ├─ SVG 字符串  │
      默认值填充/资源收集）   所有几何在此确定）  无测量）  └─ Canvas（可选）│
                            ▲                                    │
                     MeasurePort                                 ▼
              ├─ fontMetricsMeasure（纯函数，默认）         Capture（headless CDP）
              └─ domMeasure（浏览器精修，可选）               ──▶ PNG/PDF
```

**LayoutTree 是本次重构的中心概念**：一棵与 Deck 平行的纯数据树，承载"每个元素最终的几何事实"——

```ts
interface LayoutTree {
  pageSize: { w: number, h: number }
  pages: LayoutPage[]
}
interface LayoutPage {
  elements: LayoutElement[]  // 与 page.elements 一一对应（elementId 关联）
}
interface LayoutElement {
  elementId: string
  frame: { x, y, w, h }            // 最终几何（h 为内容撑开后的实际值）
  text?: { lines: LayoutLine[], contentHeight: number }   // 断行结果
  table?: { columnWidths: number[], rowHeights: number[], totalHeight: number }
  overflow: { x: boolean, y: boolean, page: boolean }      // 越界事实，校验直接消费
}
```

三条铁律：

1. **layout 之后无测量**。paint 阶段只读 LayoutTree，不碰 scrollHeight/offsetWidth。渲染函数签名从 `(model) → DOM + 副作用` 变为 `(layoutTree) → DOM`，纯函数。
2. **模型永不写回**。`el.bounds` 是作者的声明意图；LayoutTree 是排版事实。两者分离存放，编辑器选中框/对齐线/越界警告一律读 LayoutTree。dirty 判定从此干净。
3. **MeasurePort 可插拔，但默认确定性**。默认实现是字体度量表驱动的纯函数（Node/CLI/CI 可跑、可快照测试）；浏览器内可选 domMeasure 精修适配器。

---

## 3. 模块设计

### 3.1 measure/ —— 统一排版度量（地基）

```
packages/measure/
├── index.ts            # MeasurePort 接口
├── font-metrics.ts     # ★ 纯函数实现（默认）
├── metrics-table.ts    # 内置字体度量表（ascent/descent/lineGap/字宽类）
└── adapters/
    ├── embedded.ts     # 从嵌入字体字节实测（复用现有 font.js 管线，A 类资产保留）
    ├── system.ts       # 系统字体查表（雅黑1.32/宋体1.00/Calibri1.22 等公开常量）
    └── dom.ts          # 浏览器离屏批量测量（编辑器内精修用）
```

核心能力（全部纯函数，输入 = 富文本 runs + 样式 + 字体度量，输出 = 几何）：

```ts
measureTextRuns(runs, style, maxWidth, fonts): { lines, height }   // 断行 + 行高
measureCell(cell, colWidth, fonts): number                          // 单元格内容高
measureTable(table, fonts): { columnWidths, rowHeights, totalHeight }
```

要点：
- **断行模拟**：按字宽类（CJK ≈ 1.0em、拉丁 ≈ 0.5em、按字体度量表精化）做贪心断行。不需要逐字形精度——PPTX 导出端 `spAutoFit`/`a:tr` 都是 min-height 语义，测量只需"不偏小"。宁高勿低，加安全余量系数（默认 1.06，实测校准）。
- **行高计算单源**：`lineHeight = fontSize × lineHeightMultiplier`，与 writer 的 spcPct 补偿（`lh / fontLineFactor`）从同一度量表推导——R2 的三套体系收敛为一套，writer 侧改为消费 measure 的输出（接口对齐，writer 内部不动）。
- **LaTeX/公式**：行内公式按 "0.5em × max(2, 长度/4)" 估算宽度、独占段落按 1.6 倍行高估算（误差被安全余量覆盖）；校验器不再拿"∑"当一字宽。
- **fallback 消灭**：字体度量缺失时从内置表查系统字体常量，查不到才用 1.2——并在 diagnostics 里记一条（不再静默）。

### 3.2 layout/ —— 布局阶段（新增包）

```ts
layout(resolvedDeck: ResolvedDeck, measure: MeasurePort): LayoutTree
```

职责：
- 逐元素计算最终 frame：文本框内容超高 → frame.h = max(声明 h, contentHeight)；表格 → 精确 rowHeights/totalHeight（R3 的确定值）
- 生成 overflow 事实：元素超页边、元素间重叠（表格长高后压下方元素——**这个新检测能力是确定高度之后的免费副产品**）
- 图表元素：尺寸透传（图表布局语义单源 `model/chart/layout.js` 保留，I20/I22 维持文档化接受项，本期不动）

**这是"预览=导出=校验"三角的真正地基**：writer 写 `a:tr` 用 layout 的 rowHeights 精确值（而非 min 语义碰运气）；validate 的越界检查读 overflow 事实（而非消费陈旧 bounds）；预览 paint 同一棵树。

### 3.3 paint/ —— 绘制后端（renderer 的纯化改造）

现有 `renderer/` 的逐元素 DOM 构建代码**大部分保留**，改造点：

| 改造 | 内容 |
|---|---|
| 输入切换 | `renderPage(theme, page)` → `paintPage(layoutPage, ctx)`；所有尺寸从 frame 读，不再从 el.bounds 现算 |
| 删除测量 | autoGrowTexts 两个拷贝（page.js + measure.js）整体删除；TABLE_MEASURE_TOL 删除 |
| 表格 | `<tr height>` 写 layout 精确值（CSS height 语义即固定值）；总高已知 → 外层容器高度预设，overflow:hidden 裁底边框的隐患同步消除 |
| 注册表 | types 注册机制原样保留（它是好设计），分片签名改为消费 LayoutElement |

新增第二个 paint 后端（小而值）：

- **paint-svg**：LayoutTree → SVG 字符串。纯函数、无 DOM，服务于：Node 端无浏览器出图（轻量场景）、缩略图、黄金快照的**结构化 diff**（比 PNG 像素对比定位更准）。element 级覆盖 text/shape/line/table 即可，图表走现有 ECharts SSR SVG 嵌入。

### 3.4 capture/ —— headless 截图（协议清理）

保留（A 类资产）：自研 MiniWebSocket（undici 句柄泄漏是真 bug）、Chrome 探测、CDP 客户端骨架。

改造：
1. **就绪协议**：删 `document.title` 轮询，改 `Runtime.addBinding('pptdReady')` + 页面侧 paint 完成后调用——事件推送替代 150ms 轮询，首个删除的土协议。
2. **装配分叉消除**：`shot.js` 的空桩 view 改为复用正式装配——headless 页面 = "paint 后端挂 DOM、无交互层"的标准装配根配置，与编辑器共享 main 流水线，只是不加载 interaction 分片。
3. **server 内联**：渲染命令默认跳过临时 server——paint 产物可直接 `page.setContent()` 注入（样式/字体/图片在 resolve 阶段已收集为内存资源），server 仅作为调试后门保留。整条链从 ~500 行收敛到 ~200 行。

### 3.5 export-image —— 图片导出路径统一

现状 R5 的两条路径（foreignObject 栅格化 vs headless CDP）统一为一条：

- **本地/serve 模式**：一律走 capture（headless）。foreignObject 链删除。
- **线上画廊（纯静态、无 Node）**：保留 foreignObject 兜底，但加逐元素体检——序列化前扫描 `<img>`/外链/CSS 不兼容特性，产出 `ExportImageResult { png, droppedElements[] }`，UI 明示"N 个元素未能导出"，消灭静默白图。

### 3.6 编辑器侧适配（最小侵入）

editor 状态层本期不动，只改对接口：
- 选中框/拖拽手柄/对齐参考线：从读 `el.bounds` 改读 LayoutTree 的 frame（table 长高后选中框终于贴合实际）
- dirty 判定：不再被测量写回污染（写回没了），`syncDirty` 的"被动同化进基线"特例赦免可删
- domMeasure 适配器：编辑器内 paint 前对变更元素批量离屏测量，修正纯函数估算的残差——测量结果存 layout 缓存，**不进模型**

---

## 4. 关键场景走查（重构后）

**场景 A：CLI `render` 出 PNG**
```
load → validate → resolve → layout(fontMetricsMeasure)  ← 纯 Node，无浏览器
     → 内存装配 paint 页 → setContent → addBinding 就绪 → screenshot
```
全链无临时 server、无 title 轮询、无写回。

**场景 B：编辑器实时预览**
```
文件变更 → parse → resolve → layout(domMeasure 精修) → paint DOM
选中框读 frame；越界警告读 overflow；dirty 只看 Command 版本
```

**场景 C：导出 PPTX（表格页）**
```
layout 已算出 rowHeights=[42, 38, 55, ...] 精确值
writer 写 <a:tr h="..."> 精确值 + 单元格 lnSpc 用同一度量表
→ PowerPoint 打开的行高与预览像素级逼近（同一度量源，不再是 1.2 vs 1.32 的 10% 漂移）
```

**场景 D：check 校验**
```
layout 的 overflow 事实 → "表格第 3 页实际高 812pt 超出画布 540pt"
替代现状的 2 倍阈值拍脑袋启发式（validate.js:253-275 整段删除）
```

---

## 5. 迁移序列（绞杀者，每步可独立发布）

| 阶段 | 内容 | 周期 | 验收门禁 |
|---|---|---|---|
| M0 地基 | 黄金基线：24 examples + 9 测试项目的 PNG 渲染基线（旧管线产出）；字体度量表构建（内置 27 字体实测 + 常见系统字体常量） | 1 周 | 基线管线跑通 |
| M1 measure | measure 包落地 + 单测（与 DOM 实测对拍：误差分布报告，校准安全余量系数） | 2 周 | 文本高度估算误差 ≤8%（P95）；表格行高误差 ≤4px |
| M2 layout | layout 包 + LayoutTree 类型 + overflow 事实；validate 切换到 overflow（启发式删除） | 1-2 周 | check 对现有 examples 输出等价或更准 |
| M3 paint 纯化 | renderer 改消费 LayoutTree；autoGrowTexts 双拷贝删除；writer 表格行高接口对齐 | 2 周 | 黄金 PNG 基线像素 diff 全绿（允许白名单差异） |
| M4 capture 清理 | addBinding 协议、setContent 内联、装配分叉消除 | 1 周 | render 命令输出与基线一致；链路行数 500→~200 |
| M5 export-image 统一 | 本地走 capture；线上 foreignObject 加体检 | 1 周 | 白图场景有逐元素诊断 |
| M6 编辑器适配 | 选中框/对齐线读 frame；domMeasure 接入；syncDirty 特例删除 | 1 周 | E2E 全绿 |

**总计 8-10 周（1 人）**。M1/M2 是价值地基（测量单源），M3 是风险主峰（paint 切换），M4-M6 是清理收尾。

---

## 6. 风险与权衡

| 风险 | 评估 | 对策 |
|---|---|---|
| 纯函数断行 ≠ 浏览器/PowerPoint 真实断行（字距、连字、CJK 避头尾） | 中。但 PPTX 端 min-height 语义 + 安全余量使"宁高勿低"策略成立；编辑器内 domMeasure 精修补残差 | M1 的对拍实验先行，误差超阈值则安全余量按字体分档 |
| 表格行高从 min 语义改精确值是**行为变更** | 低-中。视觉上 PPT 内表格可能与旧版输出有像素级差异 | 列入行为变更白名单；黄金 diff 中表格页逐个人工确认一次，之后锁定 |
| paint-svg 后端与 DOM 后端的双份维护 | 低。SVG 后端是"够用子集"定位（快照 diff/缩略图），不追求全特性 | 明确文档其适用范围，不进关键路径 |
| writer 消费 measure 输出的接口扰动 | 低。writer 内部结构不动，只把 spcPct 补偿的 factor 来源从"options.fontMetrics 现查"换成 measure 模块同表推导 | 接口适配层 + 现有 204 公式/包一致性回归守门 |

---

## 7. 一句话总结

**这次重构的本质：把"渲染"从'边画边量边写回'的纠缠过程，拆成 `resolve → layout → paint` 的纯净三段——几何事实在 layout 阶段一次性算定，之后谁画画、谁导出、谁校验，读的都是同一棵树。**

管线的确定性（Node 可跑、可快照、可 diff）取代浏览器的权威性，成为"预览=导出"的新地基。
