# W7 · 画廊优化（隐藏青山 / 去子标题 / Logo 回顶）

> 分支由 lead 派工时创建。最高约束：只改画廊展示与导航；不改项目数据/渲染/编辑器。

## 目标

1. 画廊不再显示 `qingshan-coffee-review-12p`（青山咖啡），但**保留项目文件**（golden、README 截图、examples 链接仍可用）。
2. 删除卡片子标题（`.gallery-card-desc`）：卡片只保留 **标题 + 页数 + 标签**；画廊更紧凑、不重复长描述。
3. 点击 Home 的 `OPEN PPTD` 品牌时，滚动到页面最顶部，而不是把网格顶部对齐视口（当前会停在 hero 被裁掉的高度）。
4. 顺带收紧卡片信息区间距（去掉描述后不要留下大空白），画廊整体更干净。

## 前置上下文

- 必读：`ref/repo-map.md` → `handoff/W2-worker.md`（画廊视觉）→ `handoff/W4-worker.md`（封面静态/Logo）→ 本工单。
- 基线：`run-all` 39/39；`preview-shell` 23/23、`feedback-fixes` 21/21；`golden-diff` 156/156；`docs` 35/35。
- 事实：
  - `editor/gallery.js:251-254` 生成 `.gallery-card-desc`；`editor/styles/gallery.css:199-209` 是它的样式。
  - `editor/gallery.js:136-144` 的 `.brand-home` 点击调用 `grid.scrollIntoView({block:"start"})`，所以停在网格顶部而不是页首。
  - `examples/manifest.json` 由 `scripts/gen-gallery-manifest.mjs` 扫描 `examples/` 生成；`packages/server/gallery.js` 的 `scanExamples` 读 `meta.yaml` 的 title/description/tags/kind。
  - 青山条目由 `examples/qingshan-coffee-review-12p/meta.yaml` 提供；项目本身被 golden/README 使用，不能删目录。
- 稳定区：`packages/{model,renderer,writer,...}`、`editor/{preview,editor,main}.js`、其他 styles、tests/golden|projects、contract.json、skill/**。

## 工单

### T1 隐藏青山（保留项目）
- `packages/server/gallery.js`：`scanExamples` 支持 `meta.hidden === true`（或 `gallery:false`）→ 跳过该条目（在读 meta 后、push 前继续）。
- `examples/qingshan-coffee-review-12p/meta.yaml`：加 `hidden: true`（保留 title/tags 供未来恢复）。
- 重新生成 `examples/manifest.json`（`node scripts/gen-gallery-manifest.mjs`），确认 qingshan 条目消失、其余条目不变。
- 验证：Home PPT tab 由 10 → 9 张；本地 server `/examples/manifest.json` 与静态 manifest 都不含 qingshan；项目文件/README/golden 不受影响。

### T2 删除卡片子标题
- `editor/gallery.js`：去掉 `.gallery-card-desc` 的 innerHTML 片段；保留标题/页数/标签。
- `editor/styles/gallery.css`：删除 `.gallery-card-desc` 规则；调整 `.gallery-card-info`/标题/标签间距，使无描述时卡片信息区紧凑且多行标题不跳。
- 不删 manifest 的 description 字段（数据保留，不展示）；不改扫描排序逻辑（或同步调整为按 id 排序，若描述不再展示则排序依据不应再依赖它——可改为 id/标题排序）。
- 验证：所有卡片无子标题；标题+页数+标签仍完整；窄屏不溢出。

### T3 Logo 回页首
- `editor/gallery.js` 的 `.brand-home` 点击改为 `window.scrollTo({ top: 0 })`（或滚动 `#home-view` 顶部）；不阻止默认导航以外的新行为——Home 上保持 `preventDefault`，只回顶。
- 验证：滚到页面中部后点 Logo → `window.scrollY === 0`，hero/标题完整可见；不触发路由/重载。

### T4 测试/截图
- 新增或扩展 e2e（建议 `tests/e2e/gallery-cleanup.mjs`，CDP 9349）：
  - `qingshan` 卡片不存在；`.gallery-card-desc` 数量 0；
  - 每张卡片有标题/页数/标签；
  - 滚到中部点 Logo → scrollY=0；
  - Home 封面仍静态（不 pan）、点卡片仍进入项目。
- 更新受影响 e2e 的计数/选择器（若硬编码 10）。
- 重跑 `tests/tools/ui-shots.mjs`，更新 `docs/images/gallery.png`（无子标题、9 张 PPT）。
- 回归：run-all 39/39、全部 e2e、golden 156/156、docs 35/35；写 handoff W7-worker.md（A/B/C，50–70 行）。

## 验收

1. 画廊不显示青山；项目文件/README/golden 不变。
2. 卡片无子标题；标题+标签+页数可读；布局紧凑。
3. Logo 点击回页首（scrollY=0），不是网格高度。
4. 全部 e2e、run-all、golden、docs 绿；写入范围外零 diff；无新增依赖。

## 禁触清单

`packages/**`（仅 `server/gallery.js` 的 hidden 支持）、`examples/` 中除 qingshan meta 与 manifest 外的项目、`editor/{preview,editor,main}.js`、`editor/interaction/**`、`editor/app/**`、`tests/golden/**`、`tests/projects/**`、`contract.json`、`skill/**`。

## 交接 / 报告

最后 commit 写 `specs/2026-11-01-0743-open-pptd-3.1/handoff/W7-worker.md`；报告含：hidden 实现、manifest diff、卡片改动、Logo 前后 scrollY、e2e/golden、偏差、探索审计。
