# W1 基线记录 · open-pptd 2.x（2026-10-31）

> 环境：worktree `w1-baseline`，分支 `feat/3.0-w1-baseline`，起点 `7af07eb`（spec 组已提交）；Windows 10.0.28120 x64 + Git Bash + Node v24.21.0；零 npm 依赖。
> 本文件只记录事实，不改行为。命令均在 worktree 根执行。

## 1. 全量测试 `node tests/run-all.mjs`

首跑前先执行公式 fixture 生成（KaTeX 中间产物不入库）：

```text
$ node tests/tools/dump-formula-mml.mjs
KaTeX MathML 生成: 204/204

$ node tests/regression/formula.mjs
公式转换回归: 204/204 与官方 XSLT 字节一致
```

全量结果：**26/26 通过，exit 0，耗时 31s**（wall clock，含 9 套项目导出）。

```text
✓ 导出 + 包一致性 chart（24 页）
✓ 导出 + 包一致性 font-embed（7 页）
✓ 导出 + 包一致性 icon（2 页）
✓ 导出 + 包一致性 image（1 页）
✓ 导出 + 包一致性 line（2 页）
✓ 导出 + 包一致性 notes（5 页）
✓ 导出 + 包一致性 shape（8 页）
✓ 导出 + 包一致性 table（9 页）
✓ 导出 + 包一致性 text（8 页）
✓ 包级公开契约（contract 4）
✓ 依赖方向与环境全局
✓ 背景尺寸随 deck.size
✓ 校验器与导出闸门
✓ 颜色一致性
✓ 主题预设一致性
✓ 预置形状全量
✓ 公式转换
✓ 图标导出
✓ 线条导出
✓ 本地项目句柄读写
✓ 项目包图片完整性
✓ 资源路径解析（契约 5）
✓ 排版度量（measure）
✓ 布局与越界事实（layout）
✓ UI 令牌字面量门禁
✓ 智能参考线吸附（align-guides）

结果: 26/26 通过 ✅
```

## 2. 依赖门禁与契约

```text
$ node tests/regression/dep-graph.mjs
  登记豁免 3 处：
    - packages/model/font-registry.js:39（lazy path import in the Node fontDir branch ...）
    - packages/writer/pptx.js:188（downloadPptx browser download helper ...）
    - packages/writer/pptx.js:191（downloadPptx browser download helper ...）
✓ 依赖方向与环境全局检查通过

$ node tests/contract/public-api.mjs
✓ packages/layout/index.js 导出名齐全（1 个）
✓ packages/index.js 再导出 measure 命名空间
✓ packages/index.js 再导出 layout 函数
结果: 契约通过 ✅
```

## 3. headless 渲染 e2e `node tests/e2e/render.mjs`

**9/9 通过，exit 0，耗时 11s**；本机 Chrome：`C:/Program Files/Google/Chrome/Application/chrome.exe`；端口随机（本次 62969 / 50233 / 64162）。

```text
PASS  页面数一致  count=24 expected=24
PASS  输出文件数一致  files=24
PASS  渲染耗时合理（<60s）  4553ms
PASS  全部 PNG 尺寸 960×540
PASS  全部 PNG 非空（>5KB）
PASS  单页渲染只出 1 张且命名正确  deck-03.png
PASS  scale=2 输出 1920×1080  1920x1080
PASS  scale=2 右下角区域有内容（无白边）  colors=13
PASS  无残留定时器（进程可退出）  timeouts=0

✓ render 冒烟测试 9/9 通过
```

## 4. 导出产物 `tests/projects/*/out/check-*.pptx`

存在 **9 个**（run-all 生成，未入库）：

| 文件 | 字节 |
|---|---|
| chart/out/check-chart.pptx | 837227 |
| font-embed/out/check-font-embed.pptx | 2141500 |
| icon/out/check-icon.pptx | 51598 |
| image/out/check-image.pptx | 32135 |
| line/out/check-line.pptx | 27949 |
| notes/out/check-notes.pptx | 60091 |
| shape/out/check-shape.pptx | 156844 |
| table/out/check-table.pptx | 250837 |
| text/out/check-text.pptx | 141748 |

CLI `export`（chart 项目，输出到临时目录）：exit 0，1s，837227 bytes，输出：

```text
▸ 资源体检：字体 0/0 就绪 · 图标 0/0 · 媒体 0/0
✓ 已导出 → <tmp>/export-chart.pptx
```

CLI 帮助与 `check` 输出见 `ref/baseline-cli.txt`。

## 5. 图表 PNG 基线（tests/projects/chart）

**重要：2.x 单页渲染 `--page n`（n>1）存在竞态**——截图常早于页面切换/图表绘制，输出仍是第 1 页（文件名却是第 n 页）。证据：

- `--page 2` 两次均得到 8733 bytes / sha256 `01b0622d…`（= 第 1 页）；
- `--page 3` 一次得到第 1 页、一次得到正确的 26160 bytes；
- `--page 4` 正确（21981 bytes）；`--page 5/6/7/8` 均得到第 1 页。
- 整 deck 渲染（page=all）稳定：scale=1 与 scale=2 都是 24 页、24 个不同 hash。

因此本基线用 **整 deck 渲染后抽取第 1/2 页**，结果（PNG 不提交）：

| page | scale | 尺寸 | 字节 | sha256 |
|---|---|---|---|---|
| 1 | 1 | 960×540 | 8733 | `01b0622dca83b5898e4efaa6116d4e6fb4279ccaa1fd292f62b8c7ddb81446cc` |
| 2 | 1 | 960×540 | 10753 | `1eb66434359f071a0a4adbf1f17458f54f92041f454c8ab8e3a0775bbed8b761` |
| 1 | 2 | 1920×1080 | 29118 | `846d85804e2d02695d66fdf2754bffacb5c1478ceb18eda8842e0dce33b24fa6` |
| 2 | 2 | 1920×1080 | 41400 | `6ffeca9f562d1b55c7ac1ded3b8cf8d7edec146a65ff0caaa51df05aac9efc20` |

整 deck：scale=1 `renderedPages=24, distinctHashes=24`；scale=2 同样 `24/24`。图表页 PNG 的确定性目前成立（同次运行内 24 页互异），但跨机器/跨 Chrome 版本不保证字节一致。

## 6. 表格关键值（W5 对照）

`measureTable(el)` 与 `layout(deck)` 的 `table` 完全一致；`layout.frame.h = max(bounds.h, totalHeight)`。列宽为比例数组（和≈1），行高/总高单位 px。

### examples/business-review-7p（3 张表）

| page | elementId | declared [x,y,w,h] | frame.h | columnWidths | rowHeights | totalHeight |
|---|---|---|---|---|---|---|
| 2 | compare-table | [520,268,380,190] | 213 | [0.34,0.2,0.2,0.26] | [31,26,26,26,26,26,26,26] | 213 |
| 4 | region-table | [664,178,236,292] | 293 | [0.44,0.28,0.28] | [53,48,48,48,48,48] | 293 |
| 6 | roadmap-table | [520,266,380,202] | 203 | [0.24,0.19,0.19,0.19,0.19] | [41,54,54,54] | 203 |

### tests/projects/table（21 张表，摘要）

- 全部表的 `layout.table` 与直接 `measureTable` 一致（24 条记录零差异）。
- 典型：page1 tb1 declared h=220 → totalHeight=108（frame 仍 220，表内容不撑高）；page6 tb1 内容换行 → rowHeights `[30,38,26,27]`，totalHeight=121；page7 tb2 单行 → totalHeight=30；page9 tb2 5 行 → totalHeight=134。
- 完整逐表数据在采集脚本输出（临时目录，未入库）：`tableFacts` 数组含 project/page/elementId/declared/frame/table/measureTable。

## 7. 文字 frame 基线（tests/projects/text）

68 个 text 元素，7 个 `grown=true`（frame.h > declared.h）。样例：

| page | elementId | declaredH | frameH | lines | contentHeight |
|---|---|---|---|---|---|
| 2 | pg-title | 40 | 42.4 | 1 | 42.4 |
| 3 | pg-title | 40 | 84.8 | 2 | 84.8 |
| 8 | pg-title | 40 | 127.2 | 3 | 127.2 |

其余 61 个未撑高。完整 68 条在临时采集输出中，未入库。

## 8. 工作区与 golden

- `git status --short` 在全部基线命令后为**空**（`tests/projects/*/out/` 被 ignore；未改任何跟踪文件）。
- 本波不改渲染/度量，无 golden diff；`tests/golden/**`、`tests/projects/**` 基线数据未动。
- `node tests/e2e/incremental.mjs` / `test:isolate` 不在本工单必跑清单，未执行。

## 9. 采集命令（可复现）

```text
node tests/tools/dump-formula-mml.mjs
node tests/regression/formula.mjs
node tests/run-all.mjs
node tests/regression/dep-graph.mjs
node tests/contract/public-api.mjs
node tests/e2e/render.mjs
node bin/open-pptd.js --help
node bin/open-pptd.js export tests/projects/chart/deck.pptd -o <tmp>/export-chart.pptx
node bin/open-pptd.js check tests/projects/table/deck.pptd
```

PNG/表格/文字的采集使用临时脚本调用公开 API（`renderDeck`、`loadProjectFiles` + `parseDeck` + `layout` + `measureTable`），未写入仓库。
