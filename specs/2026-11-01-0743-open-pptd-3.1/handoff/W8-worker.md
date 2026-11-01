# W8 handoff · EV 学术 deck 蓝色重构 + 开幕夜海报删句

> 分支 `feat/3.1-w8-ev`，起点 `main 8117243`；Windows 10.0.28120 + Git Bash + Node 24；零新增依赖；本机 Chrome。
> 写入仅 `examples/ev-range/{deck.pptd,pages/*}`（media 未动）、`examples/poster-artdeco-latelier/pages/01_poster.page`、`docs/images/poster-artdeco.png`（过期，已换）、`tests/golden/manifest.json`（仅 ev/poster 两块）、本文件。未改 `examples/manifest.json`、其他 examples、`packages/**`、`editor/**`、`tests/projects|contract|e2e`、`contract.json`、`skill/**`；未 merge/push/tag；未碰主检出/其他 worktree/用户 55173 服务。

## A. 自测真实输出

```text
# 开工基线（8117243，改前）
$ node tests/tools/dump-formula-mml.mjs → 204/204
$ node tests/run-all.mjs → 39/39 ✅
$ e2e：render 9/9、editor-minimal 21/21、page-ops 17/17、editor-ops 22/22、preview-shell 23/23、
       feedback-fixes 21/21、add-elements 12/12、browser-export 15/15、incremental-load 5/5 ✅
$ node tests/tools/golden-diff.mjs → 23 项目 / 144 页，字节一致 144、无漂移 ✅
$ check ev-range → 0 error / 2 warning（res-label 内容撑高）；check poster → 0 error / 2 warning
# 完工（最终代码）
$ node bin/open-pptd.js check examples/ev-range/deck.pptd → 0 error / 0 warning ✅
$ node bin/open-pptd.js check examples/poster-artdeco-latelier/deck.pptd → 0 error / 2 warning（既有 est 撑高）
$ build ev-range --format pptx → 17 页，1083KB ✅；build poster pptx → 1 页，85KB ✅
$ build ev-range --format png --page all → 17 张（人工逐页查看）
$ golden-render --filter ev-range → 17 页；--filter poster-artdeco-latelier → 1 页；sanity gate 通过
$ node tests/tools/golden-diff.mjs → 23 项目 / 144 页，字节一致 144、感知 0、无未登记漂移 ✅
$ node tests/run-all.mjs → 39/39 ✅；node tests/docs/run.mjs → 35/35 ✅
$ 全部 e2e 重跑 → 9/9、21/21、17/17、22/22、23/23、21/21、12/12、15/15、5/5 ✅
$ 17 张 PNG 逐页目检：浅纸底、无橙色/暗底/deco、标题衬线、表格 navy；无致命重叠/溢出
$ git status → 工作树干净（5 个逻辑 commit，无 push）
```

## B. 设计 / 改动 / 偏差

**色板（deck.pptd theme）**：primary `#1F4E79`、accent `#2E6F9E`、bg `#F7F9FC`、text `#1B2733`、muted `#5F6F80`、line `#D5DEE8`、success `#2F6B57`、warning `#8A6D3B`、danger `#A14B43`、primarySoft `#EAF1F8`、primaryTint `#D8E4EF`、primaryDeep `#12324F`、accent3–6 `#4E7FA8/#7FA3C0/#335F82/#8AA9C2`。`textStyles.title` 改 Source Han Serif CN + `$primary`；kicker/body/subtitle/caption 用 LXGW Neo XiHei；tableStyles `threeline` 表头/三线改 `$primary`，`default` 表头填 navy。fonts 增加 `思源宋体: { family: "Source Han Serif CN" }`，删除已无引用的阿里妈妈数黑体。
**17 页改动**：封面/4 个章节页/封底全部改 `$bg` 浅纸底；标题、章节号、TOC 编号、关键数字用思源宋体 navy，正文/标签/说明用 LXGW；章节页新增 1px 蓝色短线；cover 的 title-bar、封底 rule 压成 1px；kicker/页眉细线保留蓝色，页脚 1px line，内容页 title 走 `$title`（衬线 navy）。
**删除装饰 shape 共 58 个**：封面 10（spine、frame、circle、dot、5 tick、bottom-band）；4 个章节页各 9（spine、frame、ring、dot、4 tick、end-cap，共 36）；封底 10（同封面）；P10/P15 `concl-bar` 各 1。另新增 4 个章节页 1px `rule`（替换 tick 组）；保留功能线（sep、chrome-rule、页脚线、vsep/v-rule 1px）、表格、证据图与图版细边；chrome-rule-accent 3px→1px，P16 v-rule 3px→1px、P10/P15 结论文本左移补位。
**颜色替换**：所有 `#FFFFFFxx` 半透明白、`$primaryDeep` 深底、`$accent` 橙散点全部清除；stat/res 数字、表 7/8 含 Q 数值、表 4 高速阈值改 `$primary`；P16「尚待确定」由 `$warning` 改 `$accent`（避免棕橙感），「已验证」保留 `$success`。文案/数据/页序/notes 未改；仅 `res-label` 高 12→14（消除既有 check 警告）与上述删装饰后的补位。
**海报**：删除 `cn-line`（`香氛开幕夜 · 限定发布`）9 行，其余元素零移动、零改色；`info-1` 未微调（渲染后 650→724 间距自然）；`docs/images/poster-artdeco.png` 原图仍含该句，已用新渲染 2x（1440×1920）覆盖。
**偏差/说明**：① 章节页新增 4 条 1px 蓝线，属设计明确要求的版式线；② 内容页小标签由阿里妈妈改 LXGW，数字/大标题才用衬线，避免小字衬线发虚；③ 图 8/10/12/14 等证据图内部原有红/绿曲线未改（属论文原图，非 deck 配色）；④ P16 竖分隔线保留为 1px `$line` 功能线；⑤ 未新增任何测试。
**坑**：`--filter` 两次 rebaseline 会合并 manifest，第二次只覆盖 poster 块；manifest 写入 LF，diff 仅 73 行（generated + ev 17 页指纹 + poster 1 页指纹）；PNG build 的 `-o` 是目录，pptx 的 `-o` 是文件。

## C. commit / 文件 / 探索审计 / 未决

| commit | message |
|---|---|
| `15c1f91` | feat(ev-range): 重构主题为蓝色学术色板并引入思源宋体标题 |
| `fc11860` | feat(ev-range): 17 页改为浅纸底海军蓝学术版式（删除 58 个装饰 shape） |
| `4b2bb1b` | feat(poster): 删除开幕夜中文副标题并同步展示图 |
| `39de050` | chore(golden): rebaseline ev academic + poster line |
| （本提交） | docs(w8): 写 W8 交接 |

修改：`examples/ev-range/deck.pptd`、`examples/ev-range/pages/*.page`（17）、`examples/poster-artdeco-latelier/pages/01_poster.page`、`docs/images/poster-artdeco.png`、`tests/golden/manifest.json`。`git diff --name-only 8117243 -- packages editor tests/projects tests/contract contract.json skill examples/manifest.json` → 空；其他 examples 零 diff（golden 第二遍全量佐证）。
**探索审计（只读）**：工单 09、`ref/repo-map.md`、handoff W6/W7、`packages/model/theme.js`（tableStyles 继承链）、`packages/model/font-library.js`、`packages/measure/metrics-data.json`（字体映射）、`tests/tools/golden-render.mjs|golden-diff.mjs`、`packages/cli/build.js`（-o 语义）。17 页逐页 Read 后重写；未全仓重读。
**未决**：① 海报 `est` 元素 19px 实际高 vs 声明 18 的既有 geometry warning 仍在（工单要求其余不动，未修）；② 若后续要求严格“零警告”，可把 `est` bounds 高 18→20，不在本单范围；③ 证据图片内彩色曲线保留，属论文原图。
