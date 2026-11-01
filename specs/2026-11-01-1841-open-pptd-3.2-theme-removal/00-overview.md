# open-pptd 3.2 · 删除主题库，颜色编辑收敛

> 启动：2026-11-01 18:41（UTC+8）
> 起点：main `a029b9e`（3.1 终验后）
> 组名：`2026-11-01-1841-open-pptd-3.2-theme-removal`

## 目标

1. **删除主题库/主题切换**：内置 10 套、我的主题 store、`~/.open-pptd/themes`、`/api/themes`、CLI `assets themes`、`build --theme`、`applyTheme`、`THEME_PALETTES`、主题文件格式及相关 UI。
2. **PPTD 标准 Theme 不动**：`theme = {colors, textStyles, tableStyles}` 原样保留；旧 deck 不迁移；`textStyles/tableStyles` 永远不被前端颜色编辑修改。
3. **保留颜色编辑**：Design 面板“颜色”tab 只改 `theme.colors`；字体库/字体状态/外观不变。
4. **修预览刷新根因**：颜色变更统一出口；`state.themeRevision` 变化时 `view.render()` 自动全量重画缩略图；撤销/重做同步；取色器拖动实时 + 缩略图 debounce。
5. **示例只改 EV**：封面/尾页渐变里的硬编码主题色改为 `$token`；其他示例保持作者原样。golden 项目/页数仍 23/142。

## 非目标

- 不拆 `theme.textStyles/tableStyles` 到 `styles`；不改 PPTD 格式；不写迁移脚本。
- 不新增主题类型、排版主题、样式库、品牌库。
- 不新增依赖、不新增测试套件；只更新/替换现有测试。
- 不改公式解析、`packages/model/vendor/**`、导出引擎的算法。
- 不 bump `package.json` 版本（3.0.0 尚无 v3 tag）；不 push / tag / release。
- 不改其他波次/历史 specs。

## 已拍板决策

| 决策 | 结论 |
|---|---|
| 主题库 | **删除**（用户 2026-11-01 决定） |
| deck theme 结构 | **保持** `{colors, textStyles, tableStyles}`，符合 PPTD 标准 |
| 旧 deck | 不迁移；`theme.textStyles/tableStyles` 原样可读、原样保存 |
| 颜色编辑 | 保留；只写 `theme.colors` |
| 前端修改 text/table 样式 | 禁止；没有 UI 入口 |
| 示例 token 化 | 只改 EV 封面/尾页渐变；其他不动 |
| CLI 破坏性变化 | 删除 `assets themes`、`build --theme`；记 CHANGELOG，版本另定 |
| 预览刷新 | 由 view 按 `themeRevision` 决定全量缩略图，不靠调用方传 `thumbs` |

## 全局不变量

1. `deck.theme` 始终是标准 `{colors, textStyles, tableStyles}`；任何颜色写入必须保留后两块（深比较相等）。
2. 最终 main 不再有 `applyTheme`、`THEME_PALETTES`、`normalizeThemeFile`、`createThemeStore`、`/api/themes`、`assets themes`、`build --theme` 的引用。
3. `theme.colors` 仍是 16 个标准 token + 自定义 token；图表/表格/页面引用照常解析。
4. 颜色编辑是唯一的前端 theme 写入；字体、字号、行高、表格样式不受影响。
5. 现有 golden 基线除 EV 渐变页外零变化；EV rebaseline 后第二遍 142/142 字节一致。
6. 不引入新的兼容层；`normalizeTheme` 对字符串主题保留“警告 + 默认主题”的宽松解析（已有行为），但不恢复 palette 预设。
7. 所有新增/修改注释、文档用中文；commit 风格沿用 `feat(scope): …` / `chore(scope): …`。

## 波次表

| 波 | 分支 | 依赖 | 写入范围 | 门禁 |
|---|---|---|---|---|
| W1 | `feat/3.2-w1-cli-server-theme-removal` | 无 | `packages/cli/**`、`packages/server/**`、`packages/export/index.js`、`packages/paths.js`、`packages/runtime/provider.js`、`tests/cli/surface.mjs` | `run-all`、CLI surface、`doctor/assets` 抽验 |
| W2 | `feat/3.2-w2-theme-library-editor-colors` | 无（与 W1 并行；合并顺序 W1→W2） | `packages/model/**`、`editor/**`、`tests/contract/**`、`tests/regression/{color-tokens,theme-*}`、`tests/run-all.mjs`、`tests/e2e/{editor-minimal,incremental-load}.mjs` | `run-all`、editor-minimal、incremental-load、golden 142/142 |
| W3 | `feat/3.2-w3-invalidation-examples-docs` | W2 | `editor/app/**`（失效/实时）、`editor/context.js`、EV pages、README/CHANGELOG、e2e、golden | 全部 e2e、run-all、docs、golden、perf |

**状态（2026-11-01）**：W1 ✅ `04c3f29`（run-all 39/39、CLI 73/73）；W2 ✅ `c65cd04`（run-all 38/38、editor-minimal 21/21、incremental 5/5、golden 142/142）；W3 进行中。

W1/W2 文件级不相交，可并行；合并顺序 W1 先，避免 W2 删除 model 导出后 CLI 仍引用。W3 在 W2 合并后派工。

## 共享文件所有者

| 文件/目录 | 所有者 |
|---|---|
| `packages/cli/**`、`packages/server/**`、`packages/export/index.js`、`packages/paths.js`、`packages/runtime/provider.js`、`tests/cli/**` | W1 |
| `packages/model/**`、`editor/interaction/design-panel.js`、`editor/app/project/{loader,source,io}.js`、`editor/app/api.js`、`editor/app/toolbar.js`、`editor/skeleton.js`、`editor/styles/design.css`、`tests/contract/**`、`tests/regression/{color-tokens,theme-*}`、`tests/run-all.mjs`、`tests/e2e/{editor-minimal,incremental-load}.mjs` | W2 |
| `editor/app/state.js`、`editor/app/view/view.js`、`editor/app/project/loader.js`（W3 增量）、`editor/context.js`、`editor/interaction/design-panel.js`（W3 增量）、`examples/ev-range/pages/{01_cover,15_final}.page`、`README*.md`、`CHANGELOG.md`、`tests/e2e/**`（W3 增量）、`tests/golden/**` | W3 |

## 波次级门禁

- **W1**：`node tests/run-all.mjs` 全绿（39/39，主题库测试仍在 W2 前通过）；`node tests/cli/surface.mjs` 全绿；`doctor --json` 无 themes 字段；`assets list --json` 无 themes；`build --theme` 报未知选项。
- **W2**：`node tests/run-all.mjs` 全绿（套件数减 1：theme-library→color-tokens，theme-presets 删除）；`node tests/e2e/editor-minimal.mjs` 全绿；`node tests/e2e/incremental-load.mjs` 全绿；`golden-diff` 142/142（W2 不改渲染）。
- **W3**：全部 e2e（editor-minimal/page-ops/editor-ops/preview-shell/feedback-fixes/add-elements/browser-export/incremental/render）全绿；`run-all` 38/38；`tests/docs` 35/35；EV rebaseline 后 golden 23 项目/142 页第二遍 142/142；`tests/perf/editor-perf.mjs` 通过；`check examples/ev-range/deck.pptd` 0 error/0 warning。
- **终验（lead）**：run-all + 全 e2e + golden + docs + perf；`git diff` 范围审查；无越界写入。

## 回归红线

- 任何页面渲染、PPTX/PNG 导出行为不得因删除主题库变化（EV 渐变 rebaseline 除外）。
- `theme.textStyles/tableStyles` 在任何颜色编辑/撤销/重做后必须与编辑前深比较相等。
- `view.render` 不得因主题 revision 丢失缩略图更新；也不得让普通内容编辑退化为全量重绘。
- 不新增 `styles`/`palette` 字段，不写旧 deck 迁移逻辑。
- 不新增测试套件；颜色 token 套件复用/替换 theme-library 套件。

## 接口索引

- `ref/interfaces.md`：颜色 token API、editor 颜色写入契约、CLI 删除面、测试命令。
- `ref/repo-map.md`：相关目录/入口/命令/陷阱。
