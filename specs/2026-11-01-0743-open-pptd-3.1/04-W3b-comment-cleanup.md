# W3b · 注释 / 文档整理

> 分支/前置：W3a 已合并；只改注释，不改代码行为。排除公式解析与 vendor。
> 可按文件组并行 3–4 个 worker；每组文件不相交，lead 逐组门禁后合并。

## 目标

把 3.0 期间积累的“文件 banner + 历史 wave + spec/契约编号复述”压成按功能组织的简洁文档：
- 文件头 3–6 行：用途 + 关键不变量（如有）；不再写历史过程、wave 编号、契约版本、旧实现对比。
- 删除 `// ====` 长横线 banner、重复的 “single source/must not/red line” 散文、与代码不符的过期说明。
- 保留：公共 API/契约 typedef 的 JSDoc、复杂算法（表格度量/rowSpan、布局、zip/OOXML、图表路由、PNG backend）、真实约束/安全说明、非显然的 “why” 单行注释。
- 语言英文；用户可见文案不动；公式解析与 `vendor/` 不动。

## 范围与文件组

**排除（禁止改注释）**
- `packages/model/mathml2omml.js`、任何 formula 相关文件/测试/fixtures
- `packages/model/vendor/**`、`packages/vendor/**`、第三方生成文件
- `packages/model/preset-geometry.data.js`、`packages/measure/metrics-data.json` 等生成数据

**组 A：model / measure / layout**
- `packages/model/*.js`（除 mathml2omml/vendor）、`packages/model/types/**`、`packages/model/chart/**`
- `packages/measure/**`、`packages/layout/**`

**组 B：writer / renderer**
- `packages/writer/**`（含 chart/、types/）
- `packages/renderer/**`（含 headless/、types/）

**组 C：runtime / export / server / cli / paths / config / barrels**
- `packages/runtime/**`、`packages/export/**`、`packages/server/**`、`packages/cli/**`
- `packages/paths.js`、`packages/config.js`、`packages/index.js`、各 `packages/*/index.js`

**组 D：editor / bin / scripts / tests**
- `editor/**`（含 styles? 只改 JS 注释；CSS 注释可一并清理）、`bin/**`、`scripts/**`
- `tests/**`（不含 fixtures/golden 数据；e2e/regression/tools/lib 的 banner 与说明）

## 规则

1. 文件头最多 6 行（不含空行）；第一行 `<path> — <purpose>`；需要时补 1–3 条不变量/约束。
2. 删除所有 `W1…W14`、`RP-C`、`M1…M6`、`spec 09`、`contract 4/5`、`editor-ux §`、`D1…D16` 等历史/设计编号（公共契约的 `contract 3.0` 可在 barrel 保留一行）。
3. 不复制 spec 内容；需要背景时用一句 “see specs/…/ref/interfaces.md” 或删除。
4. 函数 JSDoc：只保留公共/跨模块/复杂函数；参数名/类型/返回保留；删除逐行复述代码的注释。
5. 行内注释：只留非显然的 why/约束；删除 “step 1/step 2” 式叙述（若代码已自明）。
6. 不改代码、不改字符串、不改缩进逻辑；只删/改注释行与空行。
7. 每个文件改完跑一次语法检查（`node --check` 对 .js；.mjs 同样）；不引入格式工具。

## 验收

1. `git diff` 只含 `//`、`/* */`、空行变化；`git diff -U0 | grep '^[+-][^+-]'` 抽样无代码行。
2. `run-all` 39/39；dep-graph/contract；e2e 全过；golden 零漂移。
3. 全仓扫描：非排除文件无 `W\d`/`RP-C`/`spec 09`/`editor-ux §`/`contract 4|5` 等历史标记（barrel 的 contract 3.0 一行除外）；无 >20 行 banner。
4. 公共 API JSDoc 仍在（contract typedef、excel-grid opts、表格算法、zip/OOXML、PNG backend 等）。
5. 每组单独 commit；无新增依赖；写入范围外零 diff。

## 前置上下文

待 W3a 合并后补：行号基线、并行分组、当前 e2e/截图命令、稳定区、已知坑。
