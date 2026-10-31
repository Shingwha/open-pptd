# open-pptd 3.0 重构总纲

> 启动：2026-10-31 21:02（UTC+8）
> 状态：**spec-only**。本文档组只做设计对齐，不改代码、不派工、不建 worktree。
> 组名：`2026-10-31-2102-open-pptd-3.0`（启动时定死，跨天不改名）

## 0. 阅读顺序与权威

1. 本文件（目标、波次、红线、共享文件）
2. `ref/repo-map.md`（仓库地图、命令、环境陷阱）
3. `ref/interfaces.md`（目标接口与数据流）
4. `ref/decisions.md`（每个决定的理由、取舍、被否决方案）
5. 按主题读 `ref/{cli,editor-ux,theme-font,image-assets,skill,docs,testing}.md`
6. 当前波次工单 `01-W1-baseline-cleanup.md`；W2+ 只有占位，上一波合并后 JIT 补全

真相优先级：**代码与测试 > handoff > spec**。本 spec 是意图，不是现状。

## 1. 目标

把 open-pptd 3.0 做成一个**AI 生成、人类预览/小改、可导出**的演示文稿系统，同时消除 2.x 的重复实现与历史包袱：

1. **一套运行时与导出**：浏览器、CLI、server 共用 ProjectRuntime + ResourceProvider + ExportService；两边只写 adapter。
2. **一套类型清单**：TypeManifest 是元素类型的唯一来源；renderer/writer/editor 只注册分片，导出分片懒加载。
3. **一套度量与表格事实**：纯函数度量统一；表格以内容 `totalHeight` 为唯一高度事实；rowSpan 平均补差。
4. **一个最小但可用的编辑器**：保留文字/颜色/表格内容/图表内容、拖动/缩放/旋转/多选/智能参考线、增删、页面单页操作、保存/导出；其余编辑 UI 删除。
5. **可复用字体与主题库**：主题为完整快照（颜色 + 文本/表格样式）；字体为全局库；deck 只引用 family；应用主题替换并保留被引用自定义项。
6. **图片资产系统**：原始资料/论文图表优先；简单数据可原生重绘；生图/搜图仅在工具存在且用户 opt-in 时使用；透明走 PNG alpha。
7. **Skill 回归主仓**：`skill/` 为唯一源；设计套件 + 页面配方，不做固定 deck；6 个 kit、4 套内容优先体系；外部 skill 仓归档。
8. **Docs 清理**：主仓只保留发布相关文档与 README 资产；嵌入/生图/归档/DSH/旧 specs 删除，引用同步更新。
9. **契约 3.0**：无向后兼容；删除旧 CLI、别名、深路径、`./internal/*`、旧 API。

### 1.1 成功判据

- `npm test`（全量回归）绿；contract/dep-graph/golden/表格/主题/字体/图片/CLI/skill 门禁全部通过。
- 浏览器预览与 CLI/headless PNG 在 scale 1/2 下图表首屏不糊；文字度量一致。
- 同一项目经编辑器/CLI/server 导出 PPTX/PNG/项目包走同一 ExportService；无重复业务逻辑。
- 默认 deck 的 golden 稳定；表格修复后的一次性 rebaseline 有 sanity gate 和二次稳定性检查。
- 前端只剩约定的最小功能；不残留已删除功能的 UI/死代码/样式。
- `skill/` 的 kits/recipes/fragments 通过 `check` + `build`；skill zip 随 release 产出；外部 skill 仓归档。
- 主仓 docs 只剩 `docs/release-workflow.md` 与 `docs/images/`；无断链、无对已删文档的代码注释引用。

## 2. 非目标 / 明确后移

以下不在 3.0 实现范围，不得在波次中顺手加入：

- PowerPoint/WPS COM 渲染 PNG（Office 原生渲染后端）。
- 浏览器无关 PNG（第二套 SVG/Canvas 渲染器）。
- 图片版 PPTX（整页栅格化的 PPTX）。
- PPTX→PPTD 导入/回写；PPTX 是单向交付 fork。
- shape text（文字嵌入形状）的 UI 或模型新特性；整项后移。
- 备注编辑、编辑器内预检、打开 zip/拖拽导入、AI 协作 UI、自动保存、内联文本编辑。
- DSH 适配与 DSH 主题文档。
- 页面多选/批量删除/复制页、组合/取消组合、对齐/分布按钮、层级顺序、复制粘贴、透明度/翻转。
- 形状/线条/图片/图标的内容或样式编辑（仍可选中/变换/删除）。
- 主题 textStyles/tableStyles 的可视化编辑器（随主题保存/应用，但 v1 以颜色编辑为主）。
- 项目包携带自定义字体；全局字体库为准。
- 主题/字体库的浏览器 IndexedDB 存储；本地 home 库 + 静态站内置库为准。
- WebP/SVG/AVIF 原生支持；统一转 PNG。
- 任何新 npm 依赖、构建步骤、框架或 UI 组件库。

## 3. 全局不变量 / 红线

1. **一套实现**：ProjectRuntime + ResourceProvider + ExportService + TypeManifest 是唯一业务核心；浏览器/CLI/server 只做 source/provider/backend/sink adapter。禁止再出现第二套 loader、render/export、zip、字体/图片解析。
2. **纯函数度量**：预览、headless、CLI、check、gallery、golden 统一 `fontMetricsMeasure`；删除 DOM measure（`editor/app/view/dom-measure.js`、`packages/measure/adapters/dom.js` 桩）。任何使用 DOM 测量改变 frame 的行为都视为违规。
3. **表格唯一高度**：`tableFacts.totalHeight` 是视觉、选框、writer 的唯一高度；`layout.frame.h = totalHeight`，renderer box = totalHeight，writer `a:ext cy` = totalHeight。`bounds.h` 只作 `rowHeights` 比例种子。rowSpan 额外高度平均分给跨度行，统一取整。
4. **预览=图像基准**：预览/PNG 以图像为准；PPTX 是原生可编辑导出，不承诺像素级等于预览。禁止图片版 PPTX；PPTX 单向。
5. **PNG 双浏览器后端**：foreignObject + headless 共用 ExportService/RenderBackend；`pixelRatio=scale` 在第一次 paint 前确定；禁止依赖 `window.devicePixelRatio` 的导出路径。Office 后移。
6. **主题/字体资源化**：主题库完整快照；应用主题替换 colors/textStyles/tableStyles 并保留仍被引用的自定义 token/样式；字体全局库；deck.fonts 只引用 family；导出字体嵌入为全局设置。
7. **图片证据优先**：论文/文档原图与真实数据优先；简单指标可原生重绘并标注；生成图/搜图必须工具存在 + 用户 opt-in；数据/证据/logo/真人/产品/论文图永不生成。透明 PNG alpha 端到端，加回归测试，不改引擎除非测试失败。
8. **编辑器最小集**：只保留 `ref/editor-ux.md` 的功能；删除的 UI 不得以隐藏入口、兼容层或旧组件形式复活。
9. **无兼容**：`CONTRACT_VERSION = 3`；删除旧 CLI（serve/export/export-project/render/ensure/paths/gallery/fonts/icons）、旧 API/选项、旧深路径、`./internal/*`、兼容别名。不写 shim、不保留双入口。
10. **零依赖/零构建**：不新增 npm 依赖；不引入打包器；ESM + 原生动态 import 懒加载。
11. **文档单一源**：skill 是 `skill/`；图片资产规则是 `skill/references/images.md`；主仓 docs 只保留 `docs/release-workflow.md` + `docs/images/`；不再有 embedding/DSH/archive 文档。
12. **门禁全绿**：每波波末全量回归 + 本波核心路径抽验；红的分支整支打回，不手改越界救火。
13. **语言/风格**：代码注释英文；commit 信息中文 conventional；spec 中文；不提交生成物、字体本体、临时截图。

## 4. 波次表

> 只有 W1 是完整工单；W2–W14 只有目标/范围/验收/依赖，等上一波合并后补 `## 前置上下文` 再派工（JIT）。并行只允许文件级不相交；默认串行，宁慢不乱。

| 波 | 名称 | 目标 | 依赖 | 主要产出 | 波末门禁 |
|---|---|---|---|---|---|
| W1 | 基线 + 清理 | 冻结现状；删死代码/旧归档/旧 specs；记录基线 | — | 无行为变化；baseline 记录；docs 第一阶段清理 | 全量回归绿；golden 不变；无断链 |
| W2 | ProjectRuntime | 跨端 load/parse/resolve/serialize；Node source/provider | W1 | `packages/runtime/**`；runtime 测试 | 新测试 + 全量；CLI check 输出不变 |
| W3 | ExportService | 统一 check/pptx/bundle（含 Node PNG/headless）；图表 DPR 修复 | W2 | `packages/export/**`；backend 契约；parity 测试 | PNG scale 1/2 图表不糊；PPTX/包一致 |
| W4 | TypeManifest v2 | 类型清单唯一源；render/toXml 懒分片；validate/layout hook | W3 | `packages/model/registry|style-spec|validate` 等；类型测试 | 所有类型可创建/校验/渲染/导出；首屏减重 |
| W5 | 度量 + 表格 | 纯度量统一；样式感知表格；rowSpan 补差；writer 消费 facts；golden rebaseline | W4 | measure/layout/table/renderer/writer 改造 | 表格/测量 parity；golden 稳定二次通过 |
| W6 | 主题 + 字体库 | 完整主题库 + 全局字体库 + server/CLI assets；应用语义 | W2（可与 W4/W5 按文件所有权并行） | model/theme、paths、server API、cli assets、测试 | 主题/字体跨端一致；导入/导出/应用 |
| W7 | 最小编辑器 | 删除多余 UI；保留内容编辑/变换/多选/参考线/页面操作/Design 面板 | W4,W5,W6 | editor 交互/类型/HTML/CSS/state/api | 最小功能 e2e；删除项无残留 |
| W8 | 预览/编辑器/单壳 | createPreview + createEditor；自包含/实例服务；单壳 | W7 | editor.js/main/dom/dialogs/gallery/shell | 双实例互不污染；单壳 e2e |
| W9 | 保存/导出/PNG | 原子保存+冲突；浏览器 ExportService；PNG 双后端统一；透明 PNG 测试 | W3,W8 | source/saver/export-image/server API | 保存中断/冲突/PNG 后端 parity |
| W10 | CLI 5 + 契约 3.0 | open/build/check/assets/doctor；删旧命令/API；contract 3.0 | W3,W9 | cli/bin、contract.json、exports、契约测试 | CLI 5 快照；无旧命令；dep-graph/contract |
| W11 | Skill 第一批 | `skill/` 合并；refs 拆分；images.md；4 个 kit | W10 + W6 | skill/SKILL.md、references、kits academic/business/consulting/brand | skill lint；kit check/build |
| W12 | Skill 第二批 | lecture/poster kits；skill 测试/zip；发布文档 | W11 | kits lecture/poster；pack-release；skill README | 6 kit 全量 check/build；skill zip |
| W13 | Docs + 发布 | 删 embedding/archive 残留；release/README；golden 终态；打包 | W10,W11,W12 | docs/release-workflow、README、scripts/workflows | docs 只剩 release+images；release 干跑 |
| W14 | 终验 | 全量门禁 + 三入口 + 发布候选；不改功能 | W13 | 最终报告；release candidate | 全绿；无未决阻塞 |

### 4.1 并行与切波说明

- W4/W5 强耦合（同一批 model/layout/renderer/writer 文件），**串行**。
- W6 与 W4/W5 文件大多不相交（theme/font vs type/table），可在 lead 拥有 barrel/package exports 的前提下并行；若发生共享文件冲突，W6 后移，不硬并。
- W7 之后的前端波次全部串行；W8 依赖 W7，W9 依赖 W8 与 W3。
- W11/W12 的 6 个 kit 内容可并行给多个 agent，但 `skill/SKILL.md`、`skill/references/**`、`pack-release` 由唯一所有者（lead）整合；首批 4 个 kit 完成后再开第二批。
- W13 依赖 W10-W12；W14 最后。任何波若需要理解上一波内部实现才能开工，停：合并工单或让同一 agent 连做。

## 5. 共享文件所有权

以下文件**只能由 lead 或指定唯一所有者**改；worker 需要时在报告中申请，lead 合并后统一改：

- `package.json`、`contract.json`、`packages/index.js`、`packages/model/index.js`、`packages/renderer/index.js`、`packages/writer/index.js`、`packages/server/index.js`、`packages/cli/index.js`：lead。
- `README.md`、`README.zh-CN.md`、`CHANGELOG.md`、`docs/release-workflow.md`、`.github/workflows/release.yml`、`scripts/pack-release.mjs`：lead / W13。
- `skill/SKILL.md`、`skill/references/**`、`skill/README.md`、`skill/kits/README.md`：lead / W11-W12。
- `tests/run-all.mjs`、`tests/contract/public-api.mjs`、`tests/regression/dep-graph.mjs`、`tests/golden/**`：lead 或 W1 指定所有者。
- 并行波次的文件所有权在各自工单中逐文件列出；跨波只通过 `ref/interfaces.md` 和 handoff 耦合。

## 6. 门禁与完成定义

每波最低门禁：

1. `node tests/run-all.mjs` 全绿（真实输出：通过数/失败项）。
2. 本波新增/修改的核心路径抽验（见 `ref/testing.md`）。
3. 写入范围内 diff；禁触清单零 diff（handoff 唯一例外）。
4. 不新增依赖、不新增构建步骤；dep-graph 通过。
5. 契约变化回写 `ref/interfaces.md` 后才允许派下一波。
6. golden 变化必须有 diff 报告 + 二次稳定性检查；表格/度量修复采用一次性 rebaseline，自动接受但要有 sanity gate。
7. 文档/链接/命令检查（W13）：无指向已删文档的引用；CLI help 只剩 5 命令；skill 引用可解析。

## 7. 契约与决策索引

- `ref/interfaces.md`：ProjectRuntime / ResourceProvider / ExportService / RenderBackend / TypeManifest / TableFacts / ThemeStore / FontLibrary / createPreview/createEditor / CLI 5 / contract 3.0。
- `ref/decisions.md`：所有拍板、理由、代价、被否决方案、后移清单。
- `ref/cli.md`：5 命令签名、JSON、迁移表。
- `ref/editor-ux.md`：最小编辑器保留/删除/页面操作/内容编辑器。
- `ref/theme-font.md`：主题库/字体库/Design 面板/应用语义。
- `ref/image-assets.md`：图片资产分类、论文提取、生图/搜图授权、透明、PPT 接线。
- `ref/skill.md`：skill 合并、kits/recipes、SKILL.md 流程、发布。
- `ref/docs.md`：docs 清理清单、删除顺序、引用更新。
- `ref/testing.md`：测试矩阵、golden、parity、skill 验证。
- `ref/repo-map.md`：目录/入口/命令/约定/环境陷阱/找 X。

## 8. 当前状态

- ✅ W1（2026-10-31 @ `feat/3.0-w1-baseline` → main `b9e876c`）：基线 26/26 全绿；死代码/docs 第一阶段已清；parity harness 已建。
- ✅ W2（2026-10-31 @ `feat/3.0-w2-runtime` → main）：ProjectRuntime + memory/disk source/provider；CLI check/export 接入，命令面与输出不变；runtime 92/92 已接入 run-all。
- ✅ W3（2026-10-31 @ `feat/3.0-w3-export` → main）：ExportService 统一 check/pptx/bundle/png；修复 headless 单页竞态与图表 DPR；export 56/56 已接入 run-all。
- ✅ W4（2026-10-31 @ `feat/3.0-w4-types` → main）：TypeManifest 成为唯一类型清单；validate/layout/菜单派生；renderer/writer 懒加载分片；type-manifest 42/42 已接入 run-all。
- ✅ W5（2026-10-31 @ `feat/3.0-w5-table` → main）：样式感知度量 + rowSpan 补差；frame/box/cy 统一 totalHeight；writer 消费 layout facts；golden 一次性 rebaseline（第二遍零漂移，白名单清空）；table-facts/measure-consistency 已接入 run-all。
- ✅ W6（2026-11-01 @ `feat/3.0-w6-theme` → main）：ThemeStore/FontLibrary + 用户 home 存储 + `/api/themes`/`/api/fonts` + CLI assets；预检接入用户字体；导出验收改为结构事实。另修正字体就绪判定（sfnt magic，Hedvig 注册表尺寸过期导致反复重下）。
- ✅ W7（2026-11-01 @ `feat/3.0-w7-editor` → main）：最小编辑器（删旧编辑 UI）；内容编辑/变换/多选/参考线/页面单页操作；懒加载 Design 面板。editor-minimal 21/21、page-ops 17/17。
- ✅ W8（2026-11-01 @ `feat/3.0-w8-shell` → main）：骨架模板化 + 服务实例化（dom/toast/dialogs）；createPreview；createEditor 基于 preview；单壳 Home/Editor。preview-shell 23/23；golden 字节一致。
- ✅ W9（2026-11-01 @ `feat/3.0-w9-save` → main）：revision 冲突 + 原子批量保存；浏览器导出接 ExportService；PNG foreignObject/capture 双后端；透明 alpha 回归。save-atomic 19/19、parity-png 22/22、browser-export 15/15。
- W10 详单待补 `## 前置上下文`（JIT）。
- 旧 `specs/2026-09-30-ui-redesign-line/**`、`specs/ref/**`、`docs/archive/**` 已由 W1 删除；本组 spec 不依赖它们。
