# Spec RP-A · rp-foundations：黄金基线 / measure / layout + validate 切换（W4，与 A6 并行）

> agent 代号 RP-A，分支 `feat/rp-foundations`。深读：`docs/specs/ref/render-pipeline-plan.md` §3.1/§3.2/§5 M0–M2、§4 场景 D；总裁定见 `08-render-pipeline.md`。
> 前置阅读：`00-overview.md`。**本工单禁触 `editor/**` 与 `packages/renderer/**`、`packages/writer/**`**（与 A6/RP-B 的隔离边界）。

## 目标

1. 旧管线的黄金基线就位（M3 的验收依据）。
2. `packages/measure/` 落地：统一排版度量，纯函数、双端、确定性。
3. `packages/layout/` 落地：LayoutTree + overflow 事实；`check` 校验切换到 overflow，启发式删除。

## 工单（建议 commit 顺序）

### T0 dep-graph 边表扩展（先行，为新增包开路）

`tests/regression/dep-graph.mjs`：允许边表加入 `layout → model`、`layout → measure`、`measure → model`；`measure`/`layout` 加入双端纯净扫描（同 model/writer：禁 node:/fs/window./document.）。此时两包尚不存在——规则写成"存在即检查"（目录缺失时跳过该包的文件收集，不报错）。

### T1 字体度量表（M0 前半）

- 内置 `packages/measure/metrics-table.js`：27 个注册字体的实测度量（ascent/descent/lineGap/字宽类加权）+ 常见系统字体常量（雅黑 1.32 / 宋体 1.00 / Calibri 1.22 等，方案 §3.1）。数据以**构建脚本一次性生成**：`scripts/gen-font-metrics.mjs`（从嵌入字体字节实测，复用 `writer/font.js` 的解析管线）→ 产物 `packages/measure/metrics-data.json` 入库。
- **字体字节来源**：worktree 没有 assets/fonts 本体。授权你**只读**访问 `C:\Users\法法\.pi\agent\skills\open-pptd\assets\fonts\`（主检出目录，只读复制到临时目录解析，绝不写入该目录）；缺失的字体（本机 16/27）用注册表 `url` 不下载，改用系统字体常量兜底并在 JSON 里标 `estimated: true`。

### T2 黄金基线（M0 后半）

- `tests/tools/golden-render.mjs`：用**现役旧管线**（现有 renderPage + headless CDP）把全部 examples（15 套）与 `tests/projects/` 渲染项目逐页出 PNG → `tests/golden/png/<project>/<page>.png`（gitignore）+ 写 `tests/golden/manifest.json`（每页 dHash/aHash + 尺寸 + 源 deck hash，**入库**）。
- `tests/tools/golden-diff.mjs`：按同一流程重渲当前代码 → 与 manifest 比对哈希 → 输出一致/漂移清单，漂移页把 diff PNG 落 `tests/golden/out/` 供 Read 目检。支持 `--whitelist <file>`（已知行为变更页列表）。
- `.gitignore` 加 `tests/golden/png/` 与 `tests/golden/out/`。
- 本机 headless 渲染可用（此前 ui-shots 已验证）；Chrome/Edge 探测复用 `renderer/headless/` 既有逻辑，**不改它的代码**。

### T3 measure 包（M1）

按方案 §3.1 结构（本仓是 JS 非 TS，接口用 JSDoc 表达）：

```
packages/measure/
├── index.js          # MeasurePort 接口 + 默认导出 fontMetricsMeasure
├── font-metrics.js   # 纯函数实现：measureTextRuns/measureCell/measureTable
├── metrics-table.js  # 度量表读取（T1 产物）
├── metrics-data.json
└── adapters/dom.js   # 浏览器离屏批量测量（本波次只留接口桩，M6 接线）
```

- 核心纯函数：`measureTextRuns(runs, style, maxWidth, fonts) → { lines, height }`、`measureCell(cell, colWidth, fonts) → number`、`measureTable(table, fonts) → { columnWidths, rowHeights, totalHeight }`。
- 贪心断行按字宽类（CJK≈1.0em、拉丁≈0.5em、度量表精化）；**宁高勿低**，安全余量系数默认 1.06（常量，可配）。
- **行高单源**：`lineHeight = fontSize × lineHeightMultiplier`，与 writer spcPct 补偿同表推导——本波次先在 measure 内提供 `lineHeightMultiplierFor(font)` API；writer 侧切换归 RP-B（禁触）。
- LaTeX 按方案简化式；度量缺失 fallback：内置表 → 系统常量 → 1.2 并记 diagnostics（不静默）。
- 单测 `tests/regression/measure.mjs`（注册进 run-all）：与 DOM 实测对拍——用 headless 起一次浏览器，把 20 组代表性文本的纯函数估算 vs DOM scrollHeight 误差打印分布报告，断言 **P95 ≤ 8%**、表格行高误差 ≤ 4px（不达标时校准安全余量系数并把定值写进 commit message）。

### T4 layout 包（M2）

```
packages/layout/index.js   # layout(resolvedDeck, measure) → LayoutTree
```

- LayoutTree 形状照方案 §2（pageSize/pages/elements/frame/text/table/overflow）；`overflow: {x, y, page}` + 元素间重叠检测（表格长高压下方元素——确定性高度后的免费副产品）。
- group 元素：跳过组壳、逐成员布局（裁定 §2.4）。
- 图表元素：尺寸透传（`model/chart/layout.js` 单源保留，I20/I22 不动）。
- **validate 切换**：`packages/model/validate.js` 删除 §4 场景 D 指向的拍脑袋启发式（约 253–275 行区段）；`validateDeck(deck, opts)` 签名不变，新增可选 `opts.layout`（LayoutTree）——传入时消费 overflow 事实输出越界/重叠问题；未传时跳过这类检查（其余检查不变）。`packages/cli/check.js` 的调用链改为 parse → resolve → layout → validateDeck(opts.layout)。**纯新增 opt，契约不 bump**。
- 同步更新 `tests/regression/validate.mjs`：既有断言中依赖旧启发式的用例改为"传 layout 后断言更准的事实"；这是**已登记的行为变更**（方案 §6 白名单），commit message 写明。
- 顺手项（已挂账的既有缺陷）：校验器溢出估算忽略 `lineHeightPx` 的问题随启发式删除自然消灭，无需单独修。

### T5 入口收口

- `packages/index.js` 再导出 `measure`/`layout`（命名空间或直导 `layout` 函数 + MeasurePort 工厂）。
- `package.json` exports 加 `"./measure": "./packages/measure/index.js"`、`"./layout": "./packages/layout/index.js"`；`contract.json` entries 同步加两条（**只加这两条，别的不动**）。
- `tests/contract/public-api.mjs` 加两入口断言（导出名 + entries↔exports 对应——既有双向比对逻辑会自动覆盖 entries 新增项）。
- `docs/embedding.md` 补两入口说明（短段落即可）。
- dep-graph 允许边补齐 `renderer → layout`、`writer → measure`（RP-B 将使用；现在加了只是允许，不构成违规）。

## 验收（完成前自测）

1. `node tests/run-all.mjs` 全绿（新增 measure/layout 套件后应 23/23；独立确认退出码）。
2. `node tests/contract/public-api.mjs` 绿（含新入口）。
3. `node tests/regression/dep-graph.mjs` 绿（新边表生效，双端纯净扫描覆盖 measure/layout）。
4. `node tests/tools/golden-diff.mjs` 对 **未改动渲染代码** 的当前分支跑 = 全一致（证明基线与 diff 工具自身可靠）。
5. `node bin/open-pptd.js check tests/projects/chart/deck.pptd`（或任一项目）输出等价或更准；构造一个"表格长高压下方元素"的临时 deck（/tmp 下，不入仓）验证新重叠检测能报出来。
6. `git diff main -- editor/ packages/renderer/ packages/writer/` 为空。

## 禁触清单

`editor/**`、`packages/renderer/**`、`packages/writer/**`、`packages/cli/**`（check.js 的调用链改造除外）、`packages/model/` 除 validate.js 外禁触、`scripts/` 除新增 gen-font-metrics.mjs 外禁触、`.github/`、`scripts/pack-release.mjs` 白名单（新增包在 packages/ 下已被 `packages` 递归覆盖，无需改）。
