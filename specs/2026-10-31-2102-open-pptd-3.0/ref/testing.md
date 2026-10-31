# testing · 3.0 测试矩阵与门禁

> 目标：每波可独立全绿；不靠人工记忆守行为。测试必须真实可跑、零依赖、可在本机/CI 执行；浏览器/Office 依赖按可用性 skip。

## 1. 现有门禁

- `node tests/run-all.mjs`：导出所有 `tests/projects/` + contract/regression 套件。
- `tests/regression/dep-graph.mjs`：依赖方向/环境全局。
- `tests/contract/public-api.mjs`：barrel/contract.json/exports/editor entry。
- `tests/golden/*` + `tests/tools/golden-*`：预览 PNG 指纹。
- `package-integrity.mjs`：PPTX 包内引用完整。
- `measure/layout/validate/color/theme/preset-shapes/formula/icon/line/export-media/resource-paths/handle-io/ui-token-literals/align-guides`。
- `tests/e2e/render.mjs`（headless PNG smoke）、`incremental-load.mjs`。
- `tests/tools/ui-shots.mjs`（CDP 9247，非回归；多 agent 不并行）。

## 2. 3.0 新增/改造套件

| 套件 | 目的 | 依赖 |
|---|---|---|
| `tests/runtime/` | load/parse/resolve/serialize；memory/disk provider；revision | W2 |
| `tests/export/` | check/pptx/bundle/png；report；error/strict/offline/fetch | W3 |
| `tests/regression/parity-png.mjs` | chart page 1/2 scale 1/2；foreignObject vs headless vs capture；图表清晰度/尺寸 | W3/W9 |
| `tests/regression/measure-consistency.mjs` | 编辑器/CLI/gallery layout 一致（纯度量） | W5 |
| `tests/regression/table-facts.mjs` | 样式感知 cell；rowSpan 补差；rowHeights 长度；writer frame cy；table editor 行高 | W5 |
| `tests/regression/theme-library.mjs` | 主题列表/保存/导入/导出；apply preserve refs；custom token | W6 |
| `tests/regression/font-library.mjs` | 本地/URL 导入、list/remove、deck refs、浏览器/CLI bytes、embedding | W6 |
| `tests/regression/type-manifest.mjs` | 每个类型有元数据/分片；未知类型；lazy writer 不进预览 | W4 |
| `tests/e2e/editor-minimal.mjs` | 文字/表格/图表内容编辑、颜色、变换、多选、参考线、添加、删除、保存 | W7 |
| `tests/e2e/page-ops.mjs` | 前插/后插/前移/后移/置顶/置底/删除/拖拽；undo | W7 |
| `tests/e2e/preview-shell.mjs` | createPreview/createEditor 双实例、destroy、单壳 Home/Editor | W8 |
| `tests/regression/save-atomic.mjs` | 原子 batch、失败回滚、revision conflict | W9 |
| `tests/regression/image-alpha.mjs` | 透明 PNG 渲染/PPTX 字节；格式拒绝/转换提示 | W9 |
| `tests/cli/surface.mjs` | 5 命令 help/JSON/旧命令消失；open manifest 自动识别 | W10 |
| `tests/skill/` | SKILL/refs 链接/命令 lint；kit fragments 组装 check/build；无 calibration demo；skill zip | W11/W12 |
| `tests/docs/` | docs 只剩 release+images；无断链/旧命令/已删文档引用 | W13 |

## 3. 全量门禁命令（目标）

```bash
node tests/run-all.mjs          # 全量纯 Node + 项目导出
node tests/regression/dep-graph.mjs
node tests/contract/public-api.mjs
npm run test:render             # headless PNG smoke（有 Chrome/Edge）
npm run test:incremental        # 可选（有浏览器）
npm run test:skill              # skill lint + kit check/build
npm run test:docs               # docs 链接/命令
npm run test:export             # runtime/export parity（新增）
npm run test:editor             # minimal e2e（有浏览器；无则 skip）
```

- 纯 Node 套件必须在无 Chrome/Office 的环境可跑；浏览器套件 skip 时报告 `SKIP`，不得假装通过。
- 不引入 npm 依赖；测试脚本手写 Node。

## 4. Golden / rebaseline

- 当前：24 项目 / 156 页 golden；`tests/tools/golden-render.mjs` 生成，`golden-diff.mjs` 比对。
- W5 表格/度量变更会改一批页面：
  1. 表格修复代码单独 commit。
  2. 运行 golden rebaseline，生成 diff 报告（页数/尺寸/空白/最大变化）。
  3. Sanity gate：页数、尺寸、PNG 非空、无渲染错误、无全白页；失败则中止，不写基线。
  4. 自动接受新 manifest（用户选择），但必须第二次运行零差异。
  5. 基线更新单独 commit（`chore(golden): rebaseline after table fix`），不混代码。
- 后续 W7/W8/W13 不得改变默认 deck 的视觉；出现 diff 先查是否预期（shell/dom/measure 不应改渲染像素）。
- 透明 PNG alpha 测试可单独 fixture，不进 golden。
- 预览 vs PPTX 不做像素 CI；PPTX 用结构完整性 + 组件项目手验；Office 渲染后移。

## 5. 跨端 parity

### 5.1 PNG

- 同一 chart 项目、scale=2：
  - headless CLI `build --format png`（page 1 & 2）
  - server `/api/export-image` capture（若可用）
  - browser foreignObject（若可用）
  - 比较尺寸 1920×1080、非空、图表区域边缘密度/清晰度（不能第 1 页明显糊）。
- 修复点：headless 设 deviceScaleFactor 后重绘 page 0；RenderBackend `prepare` 前不 paint；`pixelRatio=scale`。

### 5.2 文字顺序

- 同一 text-heavy 项目：editor layout vs CLI layout/golden；frame/height 完全一致（纯度量）。
- gallery/thumbnails/present 同 measure；不允许 DOM measure 改变 frame。

### 5.3 表格

- 样式感知：cellStyle fontSize 10/11 vs 默认 13；measure 必须读 cellTextStyle。
- rowSpan：2/3 行合并、不同内容、padding 一次、整数余数；总高不低于合并内容。
- rowHeights 长度不等于 rows → 校验/规范化，不静默丢。
- writer `a:ext cy` = tableFacts.totalHeight；renderer box = totalHeight。
- table editor 行高 = measureTable 最终值，不是 estimateTableLayout 最小。

## 6. CLI / 契约

- help 只 5 命令；旧命令不存在/迁移提示。
- `open --json` 单行；manifest 自动识别（deck.pptd/唯一 *.pptd/多个 fail）；`--stop` 不误杀。
- `build` 三格式；pptx/bundle 无浏览器；png 无浏览器错误；`--fetch` 不隐式。
- `check` 只读、`--json`、`--strict`。
- `assets themes/fonts` 导入/导出/删除/应用；`doctor` 路径/PNG 能力。
- `contract.json`/exports/CONTRACT_VERSION=3 一致；旧深路径/internal 移除；dep-graph 新边表。
- 程序化 API `exportDeck/exportProject/renderDeck` 旧名删除/替换；不保留 shim。

## 7. 主题 / 字体

- 主题：内置 10 套完整；用户保存/导入/导出；应用 preserve referenced custom token/styles；未引用丢弃；undo；自定义 token 添加/删除/颜色选择器。
- 字体：全局库导入 local/URL、list/remove；deck.fonts family；浏览器/CLI 相同字节；系统/缺失；全局 embed/subset；无 per-font chip。
- Design 面板 e2e：主题应用/保存、颜色新增、字体导入/选择、外观切换。

## 8. 图片 / skill

- 透明 PNG：PNG alpha fixture；renderer `<img>` 透明；PPTX 内 PNG 字节/alpha；未压平；浅/深底检查（人工/抽样）。
- 图片格式：WebP/SVG 被拒绝或转换提示；PNG/JPEG/GIF 通过。
- skill：
  - SKILL.md frontmatter/链接/命令 lint；
  - refs format/elements/charts/design/quality/shapes/images 存在且互链可达；
  - kits 6 个；kit.md/pages/fragments 完整；
  - fragments 组装测试 deck，`check` + `build --format pptx`；无缺资源/溢出致命；
  - 无完整 demo/calibration 在 skill；
  - skill zip 包含 SKILL.md/refs/kits/README；release 资产。
- 不依赖 Office/WPS；不依赖图片生成/搜索工具做 CI。

## 9. Docs

- `docs/` 只含 `release-workflow.md` + `images/`；旧 embedding/image-generation/archive/DSH/specs 不存在。
- 扫描代码/测试/README 注释，无指向已删 docs；无旧 CLI 命令当前用法。
- README skill 安装指向 release skill zip；`docs/release-workflow` 资产列表含 skill zip。
- `npm run test:docs` 在 W13/W14 运行。

## 10. 每波验收模板

```text
1. 全量门禁命令 + 真实输出（通过数/失败项）
2. 本波核心路径抽验（具体命令/结果）
3. diff 范围检查（禁触清单零 diff；handoff 例外）
4. 性能/体积（如本波涉及 lazy/字体/chart）
5. 未决/已知跳过（浏览器/Office/外部工具）
```

### 10.1 导出验收口径（2026-11-01 调整）

- **不要求 PPTX/ZIP 字节一致或字节数固定**：zip DOS 时间戳、`docProps/core.xml` 时间与内嵌 xlsx 时间戳天然非确定，字节比较过于苛刻。
- 导出验收改为结构性事实：
  1. 命令 exit 0；`tests/regression/package-integrity.mjs` 通过；
  2. 包内引用完整（图片/图标/字体关系）；
  3. 字体场景断言 `ppt/fonts/*.fntdata` 与 `embeddedFontLst` 存在，且无“未嵌入/缺失”警告；
  4. bundle 断言条目集合与页面/媒体数量；PNG 断言尺寸与非空/区域指标。
- 字节/哈希只用于“默认 deck 未受影响”的辅助 sanity（同一进程/同机重复可复现时），不作为阻断门禁。
