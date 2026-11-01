# W3b-A handoff · 注释整理（model / measure / layout）

> 分支 `feat/3.1-w3b-a`，起点 `main b60f4f0`；Windows 10.0.28120 + Git Bash + Node v24.21.0；零新增依赖。
> 写入范围：`packages/model/**`（排除 `mathml2omml.js`、`vendor/**`、`preset-geometry.data.js`）、
> `packages/measure/**`、`packages/layout/**`，共 57 个 .js + 本文件；其余文件零 diff。

## A. 自测真实输出

```text
基线（b60f4f0）：dump-formula 204/204 | run-all 39/39 ✅ | dep-graph ✓ | contract ✓
完工后：
KaTeX MathML 生成: 204/204
结果: 39/39 通过 ✅
dep-graph: 扫描 231 个文件，785 处 import（含包级 barrel 10 个）
✓ 依赖方向与环境全局检查通过
✓ packages/measure/index.js 导出名齐全（8 个）
✓ packages/layout/index.js 导出名齐全（1 个）
结果: 契约通过 ✅
node --check：57/57 文件通过（逐个检查本组全部 .js，0 fail）
git diff -U0 b60f4f0..HEAD -- packages/model packages/measure packages/layout \
  | grep -E '^[+-][^+-]' | grep -vE '^[+-][[:space:]]*(//|/\*|\*|$)'  → 0 行
git diff -U0 1683d34..HEAD（同上）→ 0 行
marker 扫描（W\d / RP-C / M1-6 / spec 09 / editor-ux / D\d / contract 4|5）→ 0 命中
`// ====` 长 banner → 0 行；全部文件头 3–6 行
```

## B. 改动内容 / 删除统计

- 57 文件，diff `+418 / -873`；注释行 1885 → 1430（净删 455 行，-24%）。
- 删除长横线 banner 199 行（`// ====`、`// ----`、`// ────` 及其包裹的 section 框）；小标题压成单行。
- 删除带历史/设计编号的注释 35 行（D11–D14、spec 09、I19/I22/I26/I28/I25、§3.1/§3.4 等；
  3 处行尾注释含代码前缀，为保持 diff 门禁为空而保留，见 C）。
- 57 个文件头统一为 3–6 行：首行 `packages/<path> — <purpose>`，随后只保留不变量/约束。
- 删除“旧实现对比 / previously / used to / had drifted”叙事与 step 1/2/3 复述，保留非显然 why。
- 修复与代码不符的过期注释：`registry.js` 头部不再列 menu/props/quickbar，改为实际
  render/toXml/label/create/addIcon/addHint；`model/index.js` 删除“300+ deep paths”，改为
  contract.json + public-api 断言的稳定入口；`theme-presets.js` 颜色 key 数 17 → 16；
  `model/index.js`、`measure/index.js` 的 “contract entry 4” 改为 “Contract 3.0 entry”。
- 保留的公共/跨模块 JSDoc 与 typedef：`layout` 的 LayoutTree/LayoutElement 与 no-measure-after-layout；
  `measure` 的 MeasurePort、measureTextRuns/measureCell/measureTable（seed → 非跨行 → rowSpan 缺口均分，
  一次取整）与安全系数；`table` 的占位语义、merge/split、rowHeights 生命周期与最小行高；
  `theme-library` 的 ThemeStore adapter 契约与 applyTheme preserved 规则；`font-library` 的 adapter 契约；
  `font` 的 parseFontInfo/buildEot/subsetTtf 字节级契约；`validate` 的返回结构/registerRule/schema hook；
  `chart` 的 CHART_META route/encode/coexist、resolvePlotLayout、resolveBarLayout 双侧投影、bubble 语义；
  `icon-fa` 的 viewBox 越界扩展；`svg-path` 的 parseSvgPath 契约与 golden 约束；`style-spec` 的 Fill/Border 投影。
- 未触碰：代码、字符串、类型、缩进、`mathml2omml.js`、`vendor/**`、`preset-geometry.data.js`、
  `tests/**`、`contract.json`、`package.json`、`run-all`、`skill/**`。

## C. commit / 偏差 / 探索审计

| commit | message |
|---|---|
| `f5c4432` | docs(model): 精简文件头与注释，删除历史编号与推导长文 |
| `e483726` | docs(model): 精简图表模块注释与文件头 |
| `6b4305b` | docs(measure): 精简度量与布局注释 |
| （本文件） | docs(w3b): 写 W3b-A 交接 |

**偏差 / 未决**：
1. `chart/labels.js`、`chart/resolve.js` 的 3 处行尾注释（含 `per the official spec` / `§3.1` / `§3.4`）
   保留原文：带代码前缀，改动会使 diff 门禁出现代码行；编号不在强制 marker 清单内。
2. 用户可见/日志字符串未改，包括 `chart/resolve.js` 警告文案里的 “官方 §5.4”（字符串红线）。
3. 文件头统计口径：首个非注释行之前的 `//` 行；57 文件全部在 3–6 行内。

**探索审计（只读）**：spec 04、ref/repo-map、handoff/W3a-a；通读本组 57 文件；核对
`editor/types/{text,chart,table}.js` 与 renderer/writer 的 registerType 字段、PRESET_SHAPES 形状数（187）、
`model/index.js` 顶层导出数（87）、theme colors key 数（16）、chart 类型数（13）；基线/完工各跑
dump-formula、run-all、dep-graph、contract。未全仓重读；未触碰主检出与其他 worktree。
