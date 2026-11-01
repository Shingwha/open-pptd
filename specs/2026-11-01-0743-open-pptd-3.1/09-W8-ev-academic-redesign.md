# W8 · EV 学术 deck 蓝色重构 + 开幕夜海报删句

> 分支由 lead 派工时创建。最高约束：内容/数据/证据图不变；只重构视觉与版式；golden 一次性 rebaseline。

## 目标

1. **`examples/ev-range`（17 页）整体重构为蓝色学术风**：白/浅蓝纸面、海军蓝文字、单一蓝色强调；衬线标题 + 无衬线正文；去橙色、去暗底、去装饰框/刻度/大色块/花哨数字；保留论文内容、数据、表格、证据图片与页序。
2. **`examples/poster-artdeco-latelier`**：删除海报中的中文句 `香氛开幕夜 · 限定发布`（`cn-line` 元素），其余内容/布局不动。
3. EV 与海报的 golden 一次性 rebaseline；其余项目 golden 不变；第二遍 `golden-diff` 零未登记漂移。

## 设计方向（lead 拍板）

- 色板（写进 EV `deck.pptd` theme）：
  - `primary #1F4E79`、`accent #2E6F9E`、`bg #F7F9FC`、`text #1B2733`、`muted #5F6F80`、`line #D5DEE8`
  - `success #2F6B57`、`warning #8A6D3B`、`danger #A14B43`
  - `primarySoft #EAF1F8`、`primaryTint #D8E4EF`、`primaryDeep #12324F`
  - `accent3 #4E7FA8`、`accent4 #7FA3C0`、`accent5 #335F82`、`accent6 #8AA9C2`
- 字体：`deck.fonts` 增加 `思源宋体: { family: "Source Han Serif CN" }`；标题/封面/章节数字用 Source Han Serif CN；正文/说明用 LXGW Neo XiHei；英文摘要保留 Times New Roman。
- 页面：
  - 封面/封底/章节页：**浅纸底**（`$bg` 或白色），海军蓝标题/大号章节数字，1px 蓝色短线；不要整页深色、不要装饰框/圆点/刻度/spine。
  - 内容页：白/浅纸；kicker 蓝色小字 + 1px 蓝线；表格三线用 navy；关键数字用 navy，不用橙色。
  - 删除所有纯装饰 shape（`deco-*`、spine、ticks、frame 等）；保留分隔线/表格/证据图/必要的版式线。
  - 不新增渐变、阴影、卡片、色块、emoji、图标墙。
- 文案/数据/页码/页序/notes 不改；仅允许为去掉装饰后腾出的空间做小幅位置/宽度调整。

## 前置上下文

- 必读：`ref/repo-map.md` → `handoff/W5-worker.md`（项目/构建）→ `ref/testing.md` §4（golden rebaseline）→ 本工单。
- 基线：`run-all` 39/39；全部 e2e；`golden-diff` 156/156；`check examples/ev-range/deck.pptd` 0 error。
- 现状：EV 17 页、无 chart；text/shape/image/table；主题 `primary #20282E / accent #DE5618 / bg #E7E8E5 / primaryDeep #12181D`；封面/4 个章节页为深底 + 橙色 spine/装饰框/刻度；正文页大量 `$accent` 橙色标签/细线。
- 海报：`examples/poster-artdeco-latelier/pages/01_poster.page` 的 `cn-line`（bounds [80,680,560,20]）文本 `香氛开幕夜 · 限定发布`；删除该元素，其余不动。
- 稳定区：`packages/**`、`editor/**`、`tests/projects/**`、`tests/contract/**`、`contract.json`、`skill/**`、其他 examples。

## 工单

### T1 EV 主题/fonts
- 改 `examples/ev-range/deck.pptd` theme 色板/`textStyles`（title/cover 用 Source Han Serif CN）；`fonts` 增加思源宋体；tableStyles 用 navy/蓝线。保留 `$` token 引用，不在页面散落硬编码橙色。
- 验证：`node bin/open-pptd.js check examples/ev-range/deck.pptd` 0 error。

### T2 17 页视觉重构
- 逐页处理 `examples/ev-range/pages/*.page`：
  - 深底封面/章节页/封底改浅纸底 + navy 文字/数字 + 细蓝线；
  - 删除纯装饰 shape（deco-*、spine、tick、frame、点等），保留功能线/表格/图片；
  - 橙色 `$accent`/硬编码橙→蓝 token；关键数字/标签改 navy/蓝；
  - 表格三线/表头改蓝；图片保留只加细边（可选）；
  - 内容/数据/页序/notes 不变；可小幅调整 bounds 解决删除装饰后的空白。
- 验证：`check` 0 error；`build --format pptx` exit 0；人工抽验 17 页无重叠/溢出致命问题。

### T3 海报删句
- 删除 `examples/poster-artdeco-latelier/pages/01_poster.page` 的 `cn-line` 元素；不移动其他元素（如需消除大洞可 ≤8px 微调 info-1，需说明）。
- 验证：check/build；该中文句不再出现在渲染/导出。

### T4 Golden rebaseline
- 先跑 `check/build`；然后：
  `node tests/tools/golden-render.mjs --filter ev-range`
  `node tests/tools/golden-render.mjs --filter poster-artdeco-latelier`
- sanity gate（页数/尺寸/非空/非全白）通过；`tests/golden/manifest.json` 单独 commit（`chore(golden): rebaseline ev academic + poster line`）。
- `node tests/tools/golden-diff.mjs` 第二遍全量 156/156 字节一致、0 未登记漂移；其他 22 项目零变化。
- 如 `docs/images/poster-artdeco.png` 明显过期，可用渲染结果替换（可选）。

### T5 回归/交接
- `run-all` 39/39、全部 e2e、docs/skill/cli 抽验；golden 全量。
- 写 `specs/2026-11-01-0743-open-pptd-3.1/handoff/W8-worker.md`（A/B/C，50–70 行）：色板/字体、删除装饰清单、17 页改动概览、golden 前后、e2e、偏差。

## 验收

1. EV 17 页全部浅色学术风，无橙色/暗底/装饰框/刻度/大色块；标题衬线、正文无衬线；内容/数据/图片/页序保持。
2. 海报中文句已删除；其余不动。
3. `check` 0 error；`build pptx` 成功；golden rebaseline 后第二遍 156/156 字节一致；其他项目零 diff。
4. 全部 e2e、run-all 39/39、docs 35/35；写入范围外零 diff；无新增依赖。

## 禁触清单

`packages/**`、`editor/**`、`tests/golden/*.json` 以外测试数据、`tests/projects/**`、`tests/contract/**`、`contract.json`、`skill/**`、其他 examples、`examples/manifest.json`（由 W7 负责）。

## 交接 / 报告

最后 commit 写 handoff；报告含：主题 tokens、字体、逐页改动摘要、删除的装饰元素数量、海报 diff、golden 命令/前后、e2e、偏差、探索审计。
