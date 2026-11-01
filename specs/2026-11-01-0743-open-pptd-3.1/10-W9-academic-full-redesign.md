# W9 · EV 学术 deck 全量重构（按 skill 流程）

> 分支由 lead 派工时创建。最高约束：数据/证据/引用不改；版式与页面结构可整体重做；按 `skill/SKILL.md` 的 6 步流程与 academic kit 执行。

## 目标

把 `examples/ev-range` 从“论文素材拼版”重做成一套真正的学术报告 deck，而不是只改颜色：

- 按 `skill/kits/academic` 的页面配方重新组织叙事：title → gap/background → research question → method/data → factors → results（figure/table）→ discussion/limitations → conclusion → references。
- 允许合并/删除旧章节页、目录页，允许页面数量从 17 页调整到约 14–16 页；内容可小幅改写以符合学术叙事，但**数字、结论、方法、图注、引用不得改变或编造**。
- 视觉：白/浅蓝纸面、海军蓝文字、单一蓝色强调、思源宋体标题 + 霞鹜新晰黑正文/图注；细发丝线；无装饰框/圆环/刻度/大色块/橙色/暗底。
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
- 设计参考：`ref/design-direction.md` 的克制原则；具体到学术：白/纸底、navy、衬线标题、单栏/双栏网格、图表优先、无装饰。
- 稳定区：`packages/**`、`editor/**`、`tests/projects/**`、`tests/contract/**`、`contract.json`、`skill/**`（只读参考，不修改）、其他 examples。

## 工单

### T1 页面 map（skill Step 4）
- 读完全部 17 页与 media；列出新页面 map：每页 reader task + 选用的 academic 配方 + 证据/数据。
- 允许：删除 4 个纯章节分隔页、目录页可改为“研究路线”或删除；把旧内容重组为约 14–16 页；保留 title/作者/机构、数据采集、指标、阈值、RF、因子、LSTM、训练、验证、结论、参考文献等核心内容。
- 产出 map 写进 commit message/handoff（不必单独文件）。

### T2 主题与字体
- 更新 `deck.pptd` theme：`primary #1F4E79`、`accent #2E6F9E`、`bg #F7F9FC`、`text #1B2733`、`muted #5F6F80`、`line #D5DEE8`、`success #2F6B57`、`warning #8A6D3B`、`danger #A14B43`、`primarySoft #EAF1F8`、`primaryTint #D8E4EF`、`primaryDeep #12324F`、accent3–6 蓝色阶；
- fonts：思源宋体（Source Han Serif CN）标题、LXGW Neo XiHei 正文、Times New Roman 英文摘要；
- textStyles：display/title/heading/body/caption/label/kicker；tableStyles 三线 + 表头 navy；页脚/来源行统一 caption。
- 16:9 960×540 不变；页码/页脚统一位置。

### T3 逐页重排
- 每页重新设计网格：标题区（kicker + 衬线标题 + 1px 蓝线）、内容区（单栏/双栏/图表区）、底部来源/页码；不要沿用旧的装饰性 bounds。
- 数据页：表格/图 + 解读并置；图必须有 caption + source；表格三线；数字用 navy 衬线，单位/注释小号。
- 方法/流程页：用简洁的水平/垂直步骤或矩阵，不用装饰卡片/图标墙。
- 结果页：RF/LSTM 对照、误差表、验证图，证据图优先；不重绘论文原图。
- 讨论/局限：明确 limitations；结论页回答研究问题；参考文献页列关键文献（沿用原 deck 中已有引用；不新增编造文献）。
- 删除无信息装饰 shape；保留功能线/表格/图版细边；不生成图片、不搜图。
- `notes` 可保留原文；如页面合并，notes 可合并，不编造。

### T4 校验/导出/golden
- `node bin/open-pptd.js check examples/ev-range/deck.pptd` → 0 error（warning 修复到 0 或说明）。
- `node bin/open-pptd.js build examples/ev-range/deck.pptd --format pptx -o <tmp>` → 成功。
- golden：`node tests/tools/golden-render.mjs --filter ev-range`，sanity gate；`tests/golden/manifest.json` 单独 commit；`golden-diff` 23 项目/144 页第二遍 144/144 字节一致；其他 22 项目零变化。
- 回归：`run-all` 39/39、全部现有 e2e、docs 35/35；**不新增测试**（用户要求）。

## 验收

1. 页面结构/版式按 academic kit 重做，非“换色”；约 14–16 页；核心内容/数据/证据/引用保留。
2. 视觉：白/浅蓝、navy、衬线标题、无橙色/暗底/装饰；图/表有 caption/source；check 0 error、build 成功。
3. golden ev-range rebaseline，其他项目零 diff；全部 e2e/run-all/docs 绿。
4. 写入范围外零 diff；无新增依赖；skill/ 只读未改。

## 禁触清单

`packages/**`、`editor/**`、`skill/**`、`tests/projects/**`、`tests/contract/**`、`contract.json`、其他 examples、`examples/manifest.json`（如需改 meta 先报告）。

## 交接 / 报告

最后 commit 写 `specs/2026-11-01-0743-open-pptd-3.1/handoff/W9-worker.md`（A/B/C，50–70 行）：页面 map（旧→新）、主题/fonts、逐页摘要、删除/合并页、golden 前后、check/build/e2e、偏差、探索审计。
