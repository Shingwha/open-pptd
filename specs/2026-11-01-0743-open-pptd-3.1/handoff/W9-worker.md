# W9 handoff · EV 学术 deck 按参考图全量重做

> 分支 `feat/3.1-w9-academic`，worktree `C:\Users\shifu\.worktrees\open-pptd\w9-academic`，起点 `main cd8434b`；Windows 10.0.28120 + Git Bash + Node 24；零新增依赖；本机 Chrome。
> 写入仅 `examples/ev-range/{deck.pptd,pages/*}`（media 未动）、`tests/golden/manifest.json`（仅 generated/ev-range 块）、本文件。未改 `examples/manifest.json`、其他 examples、`packages/**`、`editor/**`、`skill/**`、`tests/projects|contract|e2e`、`contract.json`；未 merge/push/tag；未碰主检出/其他 worktree/用户 55173 服务。

## A. 自测真实输出

```text
# 开工基线（cd8434b）
$ node tests/tools/dump-formula-mml.mjs → 204/204
$ node tests/run-all.mjs → 39/39 ✅
$ e2e：render 9/9、editor-minimal 21/21、page-ops 17/17、editor-ops 22/22、preview-shell 23/23、
       feedback-fixes 21/21、add-elements 12/12、browser-export 15/15、incremental-load 5/5 ✅
$ node tests/tools/golden-diff.mjs → 23 项目 / 144 页，字节一致 144、无漂移 ✅
$ check ev-range → 0 error / 0 warning
# 完工（最终代码）
$ node bin/open-pptd.js check examples/ev-range/deck.pptd → 0 error / 0 warning ✅
$ build ev-range --format pptx → 15 页，1168KB ✅；字体嵌入 2/2
  Source Han Serif CN 14,495,132B → 209,264B；LXGW Neo XiHei 5,635,356B → 126,740B
$ build ev-range --format png --page all → 15 张（逐页目检）
$ golden-render --filter ev-range → 15 页；尺寸/非空白 sanity gate 通过
$ node tests/tools/golden-diff.mjs → 23 项目 / 142 页，字节一致 142、感知 0、无未登记漂移 ✅
$ node tests/run-all.mjs → 39/39 ✅；node tests/docs/run.mjs → 35/35 ✅；dump-formula 204/204
$ 全部 e2e 重跑 → 9/9、21/21、17/17、22/22、23/23、21/21、12/12、15/15、5/5 ✅
$ git status → 工作树干净（2 个实现 commit + 本交接 commit）
```

## B. 页面 map / 主题 / 设计

**旧 17 → 新 15**：01 封面→01；02 概览→02 研究背景；03 目录→删除；04 章节 1→删除；05 数据→04；06 章节 2→删除；07 指标→05；08 阈值→06；09 RF→07；10 因子→08；11 章节 3→删除；12 LSTM→09；13 训练→10；14 章节 4→删除；15 验证→11；16 结论→拆为 12 讨论/局限 + 13 结论；17 封底→15。新增 03 研究问题、12 讨论、14 参考文献。删除的 4 个纯章节页与目录页由内容页顶部章节条承担。

**主题/字体**：primary `#1F5FBF`、primaryDeep `#123B7A`、accent `#2F80ED`、bg `#FFFFFF`、text `#1B2A3A`、muted `#5F7186`、line `#D6E4F7`、success `#2F6B57`、warning `#C98A2B`、danger `#B54A3F`、primarySoft `#EAF2FF`、primaryTint `#D6E6FB`、accent3–6 `#5B9BF5/#8FBDFA/#2A5FA8/#BFD8F7`。`textStyles` 新增 display/title/heading/body/caption/label/kicker/stat/nav/coverLabel；标题思源宋体，正文/标签 LXGW Neo XiHei，封面英文副题 Times New Roman。`tableStyles` 新增 `blue`、`blueCompact`、`formula`（表头蓝底白字、行分隔浅蓝、末行蓝线）。

**逐页**：01 深蓝渐变封面，白宋体两行标题、英文副题、3 个白色描边胶囊、作者/机构/基金/关键词；02 已知/缺口双卡 + 3 张数据卡 + 深蓝结论条；03 深蓝 RQ 卡（问题/范围/可证伪/证据映射）+ H1–H3 三卡 + 结论条；04 采集—清洗—事件—片段横向流程（箭头）+ 表 2 + 图 1/2；05 指标逻辑/相关方向双卡 + 表 3 七项公式；06 图 4 + K-means/表 4/60.68 阈值卡 + 能量回收条；07 客观赋权/OOB 双卡 + 图 9 + 图 10 + 权重排序；08 反向化/归一化/加权求和三卡 + Q 公式条 + 图 12；09 全宽图 13 + 输入/门控双卡；10 训练设置卡 + 表 7 + `0.017 → 0.005` KPI 条；11 2×2 图 14 + 表 8 + R² 公式 + 结论条；12 解释/替代解释双卡 + 5 行局限卡 + 下一步；13 三张答案卡（含 3,622 / 0.017→0.005 / 0.9953）+ 贡献深蓝卡 + 边界；14 只列 4 条真实来源/标准 + 图表索引 + 数据可用性；15 与封面同构的收尾，结论句 + 讨论胶囊 + 致谢/联系方式/基金/DOI。

**参考图落地**：56px 蓝色章节条（白字 `0N. 章节 —— 小节` + 右上 `EV RANGE · 学术报告`）；白底、48px 外边距、23px 深蓝衬线标题；#EAF2FF 或白底+#D6E4F7 边+轻阴影的圆角卡；蓝底白字表头；大号深蓝数据；底部 1px 浅蓝线+页码/来源；封面/封底深蓝渐变+白色胶囊。未使用橙色、旧暗底、旧装饰框、刻度、圆环；每页 2–4 个视觉块。

**证据/数据**：media 11 张原图全部保留（图 1/2/4/9/10/12/13/14），fit contain、未裁切；表 2/3/4/7/8 数值逐项保留；688.7 万、78.9%、20,300,600、6,845,881、3,622、8.715%、7.041%、60.68、11.07、33.98、0.017→0.005、0.9953 等关键数字已 grep 核对；参考文献只列原文 DOI、GB/T 32960、T/CSAE 172-2021、平台数据，未编造条目，注明“完整参考文献见原文”。

**偏差/说明**：① Times New Roman 未写入 `deck.fonts`——引擎把系统字体记为 `not-in-registry` 并在 build 报“未嵌入”；改用 `fontFamily` 直接引用，封面英文正常渲染，嵌入字体 2/2 干净。② 表 3 的 8 行公式表内容高度超过声明 bounds，check 会把任何包裹卡片判为重叠；该页去掉右侧卡片、表格落在白底上（蓝表头+浅蓝行线），左栏仍保留卡片语言。③ 章节条与深色 RQ/贡献卡用纯色 `#1F5FBF/#123B7A`：渐变底上的白字会被 contrast 检查按页面白底误判为 1.00:1，纯色可保持 0 warning；封面/封底仍用渐变。④ 表 3 两个标准差公式用 7px 内联字号以容纳 8 行，公式内容未改。⑤ 部分标题改为结论式/问题式（如“预测偏差来自被忽略的驾驶行为差异”），数字、结论、方法、图注、引用未改。

## C. commit / 文件 / 探索审计 / 未决

| commit | message |
|---|---|
| `73fcfb6` | feat(ev-range): 按参考图重做蓝色科研竞赛风 15 页学术 deck |
| `172bf99` | chore(golden): rebaseline ev-range to 15-page blue academic layout |
| 本提交 | docs(w9): 写 W9 交接 |

修改：`examples/ev-range/deck.pptd`、`examples/ev-range/pages/*`（15 个新页，17 个旧页删除）、`tests/golden/manifest.json`、本文件。`git diff --name-only cd8434b -- packages editor tests/projects tests/contract contract.json skill examples/manifest.json` → 空；其他 22 项目 golden 第二遍全量佐证零漂移。
**探索审计（只读）**：工单 10、参考图 `ref/reference-academic-blue.jpg`、`skill/SKILL.md`、`kits/academic/kit.md|theme.md|pages/*.md`、`references/design.md|quality.md|format.md|elements.md|shapes.md`、全部 17 个旧 page、W8 handoff、`tests/tools/golden-render.mjs|golden-diff.mjs`、`assets/fonts/registry.json`；未全仓重读，未读 engine 源码。
**未决**：① PowerPoint/WPS 播放兼容性未验证（只验证 build 成功与 PNG 渲染）；② Times New Roman 依赖系统字体，未嵌入，跨平台缺字时会回退；③ 表 3 右侧卡片因 checker 误报暂时移除，若后续 checker 支持渐变/撑高容器可恢复；④ 旧目录/章节页删除属用户明确要求。
