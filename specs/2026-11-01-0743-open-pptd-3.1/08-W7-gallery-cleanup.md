# W7 · 画廊优化（删除青山项目 / 去子标题 / Logo 回顶）

> 分支由 lead 派工时创建。最高约束：直接删除 `examples/qingshan-coffee-review-12p`，不引入 hidden 标记/隐藏机制；同步所有依赖它的展示、基准与 golden。

## 目标

1. **删除 `examples/qingshan-coffee-review-12p` 整个项目**（画廊自然消失）；删除 `docs/images/qingshan.png`；README/README.zh-CN 的示例卡片与链接同步移除。
2. 删除卡片子标题（`.gallery-card-desc`）：卡片只保留 **标题 + 页数 + 标签**；画廊更紧凑。
3. 点击 Home 的 `OPEN PPTD` 品牌时滚动到页面最顶部（当前滚到网格顶部，hero 被裁）。
4. 更新依赖 qingshan 的内部基准：
   - `tests/perf/editor-perf.mjs` 的 12 页基准换成 `examples/business-review-7p`（7 页），标签/期望页数/阈值同步；
   - `tests/tools/ui-shots.mjs` 的截图 deck 换成 `examples/business-review-7p`，重新生成 `docs/images/editor.png`、`gallery.png`；
   - `tests/golden/manifest.json` 删除 qingshan 项目条目（156→144 页），`golden-diff` 23 项目/144 页通过。
5. 收紧卡片信息区间距；无子标题后不留大空白。

## 前置上下文

- 必读：`ref/repo-map.md` → `handoff/W2-worker.md`（画廊视觉）→ `handoff/W4-worker.md`（封面静态/Logo）→ 本工单。
- 基线：`run-all` 39/39；`preview-shell` 23/23、`feedback-fixes` 21/21；`golden-diff` 156/156；`docs` 35/35；`npm run test:perf` 全过。
- 事实：
  - `editor/gallery.js:251-254` 生成 `.gallery-card-desc`；`editor/styles/gallery.css:199-209` 是其样式。
  - `editor/gallery.js:136-144` 的 `.brand-home` 点击 `grid.scrollIntoView({block:"start"})` → 停在网格顶部。
  - `examples/manifest.json` 由 `scripts/gen-gallery-manifest.mjs` 扫描生成；qingshan 删除后自动少一项。
  - 依赖 qingshan 的内部位置：`tests/perf/editor-perf.mjs`（QINGSHAN 常量/标签/12 页期望）、`tests/tools/ui-shots.mjs`（DECK）、`tests/golden/manifest.json`、README 两张图/链接。
- 稳定区：`packages/**`、`editor/{preview,editor,main}.js`、`editor/interaction/**`、`editor/app/**`、`tests/projects/**`、`tests/contract/**`、`contract.json`、`skill/**`、其他 examples。

## 工单

### T1 删除项目与展示资产
- `git rm -r examples/qingshan-coffee-review-12p`；`git rm docs/images/qingshan.png`。
- README/README.zh-CN：删除该示例的 `<a><img></a>` 卡片（保持剩余卡片布局合理，可调整 width 百分比）；同步删除对应 alt/link。
- `node scripts/gen-gallery-manifest.mjs` 重新生成 `examples/manifest.json`（15→14 条；PPT 10→9）。
- `tests/golden/manifest.json`：删除 `examples/qingshan-coffee-review-12p` 块；确认 `golden-diff` 23 项目/144 页通过（不重渲染其他项目）。
- 检查 `tests/docs` 图片数量/README 图片路径仍通过（docs/images 仍 ≥6）。

### T2 删除卡片子标题
- `editor/gallery.js`：去掉 `.gallery-card-desc` innerHTML 片段；保留标题/页数/标签。
- `editor/styles/gallery.css`：删除 `.gallery-card-desc`；收紧 `.gallery-card-info`/标题/标签间距，多行标题不跳。
- 扫描排序若依赖 description，改为 id/标题排序。

### T3 Logo 回页首
- `editor/gallery.js` 的 Home `.brand-home` 点击改为 `window.scrollTo({top:0})`（保留 preventDefault；不路由/不重载）。

### T4 替换内部基准
- `tests/perf/editor-perf.mjs`：`QINGSHAN` → `examples/business-review-7p`（常量/标签/12→7 页/期望卡片数/阈值；保持阈值合理，跑 2 次稳定）。
- `tests/tools/ui-shots.mjs`：DECK → `examples/business-review-7p/deck.pptd`；重跑并覆盖 `docs/images/editor.png`、`gallery.png`。

### T5 回归/截图（不新增测试）
- **不新增测试套件**（用户要求测试克制）。只在现有断言受删除 qingshan/描述影响时更新；无影响则不改测试。
- 手工抽验（可用一次性 CDP eval，不提交脚本）：qingshan 卡片不存在、`.gallery-card-desc` 为 0、每卡有标题/页数/标签、滚到中部点 Logo 后 `scrollY===0`、封面仍静态、点卡片进入项目。
- 重跑 `node tests/tools/ui-shots.mjs`（已改 business-review-7p）覆盖 `docs/images/editor.png`、`gallery.png`。
- 回归：run-all 39/39、现有全部 e2e、golden 23 项目/144 页、docs 35/35、test:perf 稳定；写 handoff W7-worker.md（A/B/C，50–70 行）。

## 验收

1. qingshan 项目/图片/README 链接/画廊条目全部消失；无隐藏机制。
2. 卡片无子标题；标题+标签+页数可读；布局紧凑。
3. Logo 点击 scrollY=0。
4. golden 23/144 通过；perf/ui-shots 使用 business-review-7p 且稳定；全部 e2e/run-all/docs 绿。
5. 写入范围外零 diff；无新增依赖。

## 禁触清单

`packages/**`、`editor/{preview,editor,main}.js`、`editor/interaction/**`、`editor/app/**`、`tests/projects/**`、`tests/contract/**`、`contract.json`、`skill/**`、除 qingshan 外的 examples。

## 交接 / 报告

最后 commit 写 `specs/2026-11-01-0743-open-pptd-3.1/handoff/W7-worker.md`；报告含：删除清单、manifest diff、golden 23/144、perf 新基准两次结果、Logo 前后 scrollY、e2e/docs、偏差、探索审计。
