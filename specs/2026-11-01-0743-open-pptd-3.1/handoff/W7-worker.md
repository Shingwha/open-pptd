# W7 handoff · 画廊优化（删除青山项目 / 去子标题 / Logo 回页首）

> 分支 `feat/3.1-w7-gallery`，起点 `main e13bd6d`；Windows 10.0.28120 + Git Bash + Node v24.21.0；本机 Chrome；零新增依赖。
> 写入范围仅：`examples/qingshan-coffee-review-12p/**`（删除）、`docs/images/qingshan.png`（删除）、`examples/manifest.json`、`README/README.zh-CN`（示例卡片）、`tests/golden/manifest.json`（仅删 qingshan）、`editor/gallery.js`、`editor/styles/gallery.css`、`tests/perf/editor-perf.mjs`、`tests/tools/ui-shots.mjs`、`docs/images/{editor,gallery}.png`、本文件。`packages/**`、`editor/{preview,editor,main}.js`、`editor/interaction|app/**`、`tests/e2e|projects|contract`、`contract.json`、`skill/**`、其他 examples 零 diff；未 merge/push/tag。

## A. 自测真实输出

```text
# 开工基线（e13bd6d）
$ node tests/run-all.mjs → 首次 38/39（仅公式转换：缺 tests/fixtures/formula/mml/）
$ node tests/tools/dump-formula-mml.mjs → KaTeX MathML 生成: 204/204；复跑 run-all → 39/39 ✅
$ node tests/e2e/preview-shell.mjs → 23/23 ✅；node tests/e2e/feedback-fixes.mjs → 21/21 ✅
$ node tests/tools/golden-diff.mjs → 24 项目 / 156 页，字节一致 156、感知 0、无漂移 ✅
$ node tests/docs/run.mjs → 35/35 ✅；node tests/perf/editor-perf.mjs → 全部达标 ✅

# 完工（最终代码）
$ node tests/run-all.mjs → 39/39 通过 ✅
$ node tests/e2e/editor-minimal.mjs → 21/21；page-ops → 17/17；editor-ops → 22/22
$ node tests/e2e/feedback-fixes.mjs → 21/21；preview-shell → 23/23
$ node tests/e2e/browser-export.mjs → 15/15；incremental-load → 5/5；render → 9/9 ✅
$ node tests/tools/golden-diff.mjs → 23 项目 / 144 页，字节一致 144、感知 0、无未登记漂移 ✅
$ node tests/docs/run.mjs → 35/35 ✅
$ node tests/tools/ui-shots.mjs → 14 张截图（business-review-7p，7 页）
```

`test:perf` 两次（阈值收紧后）：
- Run1：六茶 p50 4.9 / p95 6.0ms、全量 11.7ms；远川全量 4.7ms、切页 8.5ms → 14/14 PASS。
- Run2：六茶 p50 5.5 / p95 6.9ms、全量 11.4ms；远川全量 4.3ms、切页 7.8ms → 14/14 PASS。

一次性 CDP 抽验（脚本在系统临时目录，未入库）：`examples/manifest.json` 14 条（PPT 9 / 海报 5），无 qingshan；PPT 页 9 卡、`.gallery-card-desc` = 0、`badMeta` = []（每卡标题/“N 页”/≥1 标签俱全）；首页封面 pointer 拖拽 `panning=false`、canvas rect 前后一致、wheel 未被吞；滚动到中部 `scrollY=389` 后点 `.brand-home` → `scrollY=0`（旧逻辑 `grid.scrollIntoView` 落点为 gridTop=313，hero 被裁）；点第 2 张卡 → `?deck=examples%2Fbusiness-review-7p%2Fdeck.pptd`、7 页、Home 消失。

## B. 实现 / 删除 / 偏差 / 坑

**T1 删除**：`git rm -r examples/qingshan-coffee-review-12p`（deck.pptd + meta.yaml + 12 个 page，共 14 个文件）、`git rm docs/images/qingshan.png`；`node scripts/gen-gallery-manifest.mjs` → 14 套（PPT 10→9、海报 5），manifest 仅少 qingshan 块并把 `generated` 刷新为当前时间；README 两个文件删该卡片并把首行剩余两卡 32%→48%（保持居中两列不换行），第二行 3 张海报 27% 不动；`tests/golden/manifest.json` 删 qingshan 块、totals 24/156→23/144（JSON 1 空格缩进 + CRLF 原样，diff 仅 -122 行 + totals 2 行）。
**T2 卡片**：`editor/gallery.js` 不再拼 `entry.description`，信息区只剩标题行（含页数）与标签行；`gallery.css` 删除 `.gallery-card-desc` 规则，`.gallery-card-info` padding-top 12→8（`--space-3`→`--space-2`）、`.gallery-card-tags` margin-top 8→4（`--space-2`→`--space-1`）；标题保持单行省略，卡片高度不再受描述两行占位影响。
**T3 Logo**：Home `.brand-home` 点击由 `grid.scrollIntoView({block:"start"})` 改为 `window.scrollTo({top:0})`，保留 `preventDefault()`；编辑器视图的 shell 拦截逻辑未动。
**T4 基准**：perf 常量 `QINGSHAN`→`BUSINESS_REVIEW`（`examples/business-review-7p`，`REVIEW_PAGES=7`），ready/等待绘制/断言/标签全部同步（“远川复盘”），阈值由 80/40ms 收紧为全量 ≤40ms、切页 ≤30ms（实测 4.3–4.7 / 7.8–8.5ms，约 8×/4× 余量）；ui-shots `DECK` 改 `examples/business-review-7p/deck.pptd` 并重生成，`editor.png` 118,793B、`gallery.png` 149,023B 覆写 `docs/images/`。
**测试克制**：未新增测试文件，未改 `tests/e2e/**`（现有断言只用 `cards > 0` / 标题“山茗集”，不依赖 qingshan 数量或 description）。
**偏差/说明**：① README 首行两卡放大到 48%（工单允许调整 width 百分比）；② perf 阈值主动收紧而非沿用 80/40；③ `examples/manifest.json` 的 `description` 字段仍由扫描器生成（UI 已不展示），未删数据；④ 手工抽验用临时 CDP 脚本，验证后删除，未入库；⑤ `gallery.js` 中 `grid` 仍为 tabs/空状态服务，仅 Logo 监听不再引用它。
**坑**：golden manifest 为 CRLF + 1 空格缩进，直接 `JSON.stringify` 写回需补 CRLF，否则整文件行尾 diff；仓库根 `/` 会重定向到 `/editor/`，临时脚本里 `fetch('examples/manifest.json')` 必须写成 `/examples/manifest.json`；ui-shots 使用固定 9247，运行前确保无其他 CDP 套件并行。

## C. 文件 / commit 指针 / 审计 / 未决

| commit | message |
|---|---|
| `5182985` | chore(examples): 删除青山咖啡示例项目并同步画廊清单/黄金基线与 README |
| `4d677b5` | feat(gallery): 卡片去掉描述子标题并收紧信息间距，品牌点击回到页首 |
| `b2a3398` | test(perf): 性能基准换为远川经营复盘 7 页并收紧阈值 |
| `7dec236` | test(ui): 截图 deck 换为远川经营复盘并更新编辑器/画廊展示图 |
| （本提交） | docs(w7): 写 W7 交接 |

删除：`examples/qingshan-coffee-review-12p/{deck.pptd,meta.yaml,pages/*.page}`（14 文件）、`docs/images/qingshan.png`。修改：`README.md`、`README.zh-CN.md`、`examples/manifest.json`、`tests/golden/manifest.json`、`editor/gallery.js`、`editor/styles/gallery.css`、`tests/perf/editor-perf.mjs`、`tests/tools/ui-shots.mjs`、`docs/images/editor.png`、`docs/images/gallery.png`。
**探索审计（只读）**：工单 08 + `ref/repo-map.md` + `handoff/W2-worker.md`、`W4-worker.md`；`editor/gallery.js`、`editor/styles/gallery.css`、`tests/perf/editor-perf.mjs`、`tests/tools/ui-shots.mjs`、`tests/golden/manifest.json`、`tests/docs/run.mjs`、`tests/e2e/{preview-shell,feedback-fixes}.mjs`（相关片段）、`scripts/gen-gallery-manifest.mjs`、`examples/manifest.json`、`package.json`、`packages/server/gallery.js`、`packages/server/index.js`（manifest 路由 grep）。未全仓重读；未碰主检出/其他 worktree/用户 55173 服务（测试仅用临时端口与 9247）。
**未决**：`description` 仍在 manifest/扫描器中（仅 UI 不再展示），后续如需真正删除需改 `packages/server/gallery.js`（稳定区，本单未动）；画廊多行标题策略为单行省略（无换行抖动）；无新增 e2e 覆盖“无描述卡片”属用户要求的测试克制范围。
