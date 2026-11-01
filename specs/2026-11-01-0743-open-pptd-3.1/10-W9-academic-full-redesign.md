# W9 · EV 学术 deck 全量重构（按 skill 流程）

> 分支由 lead 派工时创建。最高约束：数据/证据/引用不改；版式与页面结构可整体重做；按 `skill/SKILL.md` 的 6 步流程与 academic kit 执行。

## 目标

把 `examples/ev-range` 从“论文素材拼版”重做成一套真正的学术报告 deck，而不是只改颜色：

- 按 `skill/kits/academic` 的页面配方重新组织叙事：title → gap/background → research question → method/data → factors → results（figure/table）→ discussion/limitations → conclusion → references。
- 允许合并/删除旧章节页、目录页，允许页面数量从 17 页调整到约 14–16 页；内容可小幅改写以符合学术叙事，但**数字、结论、方法、图注、引用不得改变或编造**。
- 视觉参考 `ref/reference-academic-blue.jpg`（用户指定）：深蓝封面 + 白色大标题 + 白色胶囊标签；内容页白底 + 顶部蓝色章节条（“01. 项目背景 —— 政策驱动”）+ 右上角小 logo；浅蓝圆角卡片/数据卡/表格/箭头；蓝色主色，允许轻阴影，不再走“纯白纸+细线”的极简路线。
- 每页重新排版（栏宽、标题位置、图表/表格占位、注释/来源行），不是在原 bounds 上换色；保留全部证据图（media/）与表格数据。
- 按 skill 流程：分类/选 academic kit → 读 kit.md/pages/design/quality → 页面 map → manifest/theme → 逐页生成 → check → build；不做生图/搜图。

## 前置上下文

- 必读：
  1. `skill/SKILL.md`（6 步流程与硬规则）
  2. `skill/kits/academic/kit.md`、`theme.md`、`pages/*.md`（title/gap/question/method/results-figure/results-table/discussion/conclusion/references）
  3. `skill/references/design.md` 的 academic 体系、`quality.md`（证据/caption/source/无伪造）、`format.md`/`elements.md`（按需）
  4. `examples/ev-range/deck.pptd` 与 17 个 `pages/*.page`、`media/*`（证据图）
  5. 当前 W8 交接（蓝色主题与已删装饰的版本）
- 基线：`run-all` 39/39；全部 e2e；golden 23 项目/144 页；`check examples/ev-range/deck.pptd` 0 error/0 warning；`build --format pptx` 成功。
- 设计参考：`ref/reference-academic-blue.jpg`（用户提供）为主；`ref/design-direction.md` 只保留克制/层级原则。参考风格要点：深蓝封面（可轻渐变）、白/浅蓝内容页、顶部蓝色章节条、圆角浅蓝卡片、白色胶囊标签、蓝色表头、右上小 logo、底部细线+页码。
- 稳定区：`packages/**`、`editor/**`、`tests/projects/**`、`tests/contract/**`、`contract.json`、`skill/**`（只读参考，不修改）、其他 examples。

## 工单

### T1 页面 map（skill Step 4）
- 读完全部 17 页与 media；列出新页面 map：每页 reader task + 选用的 academic 配方 + 证据/数据。
- 允许：删除 4 个纯章节分隔页与目录页，改由内容页顶部蓝色章节条承担；把旧内容重组为约 14–16 页；保留 title/作者/机构、数据采集、指标、阈值、RF、因子、LSTM、训练、验证、结论、参考文献等核心内容。
- 产出 map 写进 commit message/handoff（不必单独文件）。

### T2 主题与字体
- 更新 `deck.pptd` theme：`primary #1F5FBF`、`primaryDeep #123B7A`、`accent #2F80ED`、`bg #FFFFFF`、`text #1B2A3A`、`muted #5F7186`、`line #D6E4F7`、`success #2F6B57`、`warning #C98A2B`、`danger #B54A3F`、`primarySoft #EAF2FF`、`primaryTint #D6E6FB`、`accent3 #5B9BF5`、`accent4 #8FBDFA`、`accent5 #2A5FA8`、`accent6 #BFD8F7`。
- fonts：思源宋体（Source Han Serif CN）封面/章节标题（白色/深蓝粗体），LXGW Neo XiHei 或 MiSans 正文/标签；Times New Roman 英文摘要。
- textStyles：display/title/heading/body/caption/label/kicker；tableStyles：表头蓝底白字、行分隔浅蓝线；页脚/来源行 caption。
- 16:9 960×540 不变；统一页码/页脚/右上角 logo 文案（如 “EV RANGE · 学术报告”）。

### T3 逐页重排（参考图风格）
- 封面：深蓝/轻渐变整页；白色思源宋体大标题（两行以内），英文副题白色小字；下方白色描边胶囊标签 2–3 个（作者/方向/模型），右上角小 logo。参考图的“负责人/参赛赛道/参赛组别”布局。
- 内容页统一骨架：白底；顶部 52–64px 蓝色章节条，白字 “0N. 章节 —— 小节”（左侧）+ 右上角小 logo；标题区下方直接进入内容卡；底部 1px 浅蓝线 + 页码/来源。
- 内容区用参考图的圆角浅蓝卡片/数据卡（`#EAF2FF` 或白底 + `#D6E4F7` 边 + 轻阴影），每页 2–4 个卡片，卡片内标题/正文/数据；避免卡片套卡片。
- 数据页：左侧文字/表格卡，右侧图卡；蓝底白字表头；大号数据用深蓝粗体；图/表 caption + source；证据图原图保留，可放白色圆角图卡内。
- 方法/流程页：横向步骤条/箭头连接（参考图底部箭头条），每步一个浅蓝卡；不用旧的分隔页。
- 结果页：RF/LSTM 对照卡、误差表、验证图；关键数字/提升幅度用蓝色强调；不重绘论文原图。
- 讨论/局限/结论：结论式标题 + 2–3 个要点卡；limitations 单独浅蓝卡；参考文献页简洁列表。
- 删除 4 个纯章节分隔页与旧目录页，改由内容页顶部章节条承担；允许约 14–16 页；保留 title/作者/机构、数据、指标、阈值、RF、因子、LSTM、训练、验证、结论/局限、参考文献。
- 不再使用橙色/暗底/旧装饰框/刻度/圆环；允许参考图的轻渐变/圆角卡片/轻阴影/胶囊标签，但每页克制在 2–4 个视觉块。
- 内容/数据/页序/notes 可小幅重组，但数字/结论/方法/图注/引用不得改或编造。

### T4 校验/导出/golden
- `node bin/open-pptd.js check examples/ev-range/deck.pptd` → 0 error（warning 修复到 0 或说明）。
- `node bin/open-pptd.js build examples/ev-range/deck.pptd --format pptx -o <tmp>` → 成功。
- golden：`node tests/tools/golden-render.mjs --filter ev-range`，sanity gate；`tests/golden/manifest.json` 单独 commit；`golden-diff` 23 项目/144 页第二遍 144/144 字节一致；其他 22 项目零变化。
- 回归：`run-all` 39/39、全部现有 e2e、docs 35/35；**不新增测试**（用户要求）。

## 验收

1. 页面结构/版式按 academic kit 重做，非“换色”；约 14–16 页；核心内容/数据/证据/引用保留。
2. 视觉：按 `ref/reference-academic-blue.jpg`——深蓝封面/白色大标题/胶囊标签，白底内容页 + 蓝色章节条 + 浅蓝圆角卡片/数据卡/蓝色表头/轻阴影；标题衬线、正文无衬线；图/表有 caption/source；check 0 error、build 成功。
3. golden ev-range rebaseline，其他项目零 diff；全部 e2e/run-all/docs 绿。
4. 写入范围外零 diff；无新增依赖；skill/ 只读未改。

## 禁触清单

`packages/**`、`editor/**`、`skill/**`、`tests/projects/**`、`tests/contract/**`、`contract.json`、其他 examples、`examples/manifest.json`（如需改 meta 先报告）。

## 交接 / 报告

最后 commit 写 `specs/2026-11-01-0743-open-pptd-3.1/handoff/W9-worker.md`（A/B/C，50–70 行）：页面 map（旧→新）、主题/fonts、逐页摘要、删除/合并页、golden 前后、check/build/e2e、偏差、探索审计。
