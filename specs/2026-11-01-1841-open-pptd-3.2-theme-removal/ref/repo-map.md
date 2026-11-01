# repo-map · open-pptd 3.2 主题库删除

> 本文件是 W1–W3 共用稳定知识；只写“找什么去哪、怎么跑、哪里有坑”。实现细节以代码为准。

## 1. 目录职责

| 路径 | 职责 |
|---|---|
| `packages/model/` | PPTD 模型、theme/fonts 解析、validate、表格模型、主题/颜色工具、字体 registry |
| `packages/layout/` | `layout(deck)` → LayoutTree；文本度量、表格事实 |
| `packages/renderer/` | DOM 渲染（预览/缩略图/headless 共用 paintPage） |
| `packages/writer/` | PPTX/PNG/bundle 写出；theme 颜色映射 schemeClr |
| `packages/runtime/` | ProjectRuntime / ProjectSource / ResourceProvider / 字体状态 |
| `packages/export/` | 导出编排 `exportProject`（check/pptx/png/bundle） |
| `packages/server/` | 本地静态服务、save/SSE/fonts/themes/export-image |
| `packages/cli/` | `open/build/check/assets/doctor` 五命令 |
| `editor/` | 单页应用：Home 画廊 + 编辑器 + full/embedded preview；实例化 UI 服务 |
| `examples/` | 14 个示例项目 + `manifest.json`（画廊） |
| `assets/` | 字体/图标 registry 与本地资源（字节不入 git） |
| `tests/` | contract/cli/skill/docs/regression/runtime/export/e2e/golden/perf |
| `skill/` | AI 知识包（SKILL.md + references + kits） |
| `specs/` | spec 组与 handoff；不要改历史组 |

## 2. 入口点

- CLI：`bin/open-pptd.js` → `packages/cli/bin.js` → `packages/cli/index.js`。
- 浏览器：`editor/index.js` / `editor/main.js`（Home ⇄ Editor）；实例上下文 `editor/context.js`。
- 预览核心：`editor/preview.js`（`createPreview`，embedded/full）。
- 编辑器：`editor/editor.js`（`createEditor`），组合 `editor/app/*` 与 `interaction/*`。
- 服务：`packages/server/index.js` 的 `createServer/startServer`；`packages/server/themes.js`、`theme-store.js` 是本次删除对象。
- 导出：`packages/export/index.js` 的 `exportProject`。
- 渲染单页：`editor/app/paint-page.js`（layout → paintPage）。

## 3. 主题/颜色数据流（本次核心）

```text
deck.pptd theme {colors, textStyles, tableStyles}
  → packages/model/theme.js resolveTheme(deck) (+ deck.fonts)
  → editor state.theme（resolved）
  → layout(deck{theme: state.theme}) / paintPage / writer
```

- `theme.colors`：`$token` 引用源；`resolveColor` 解析。
- `theme.textStyles`：文本风格；`computeBaseStyle` 解析 `content.style: "$key"`；`body.fontFamily` 同时是无 style 文本的全局默认字体。
- `theme.tableStyles`：表格风格；`resolveTableStyle`/`cellTextStyle`。
- `deck.fonts`：字体资源表（family/url/file/subset）；`mergeFonts` 注入 `theme.fontResources`。
- 编辑器设计面板：`editor/interaction/design-panel.js`；当前 theme/library/colors/fonts/appearance 全在一个文件。
- 主题库：`packages/model/theme-library.js`（本次删除；保留颜色 token 工具），`theme-presets.js` 的 `THEME_PALETTES`（本次删除），`packages/server/theme-store.js`、`themes.js`（本次删除）。

## 4. 构建 / 测试命令（真实可跑）

```sh
# 全量回归（导出所有 tests/projects + contract/cli/skill/docs/regression/runtime/export）
node tests/run-all.mjs

# 单套件
node tests/cli/surface.mjs
node tests/skill/run.mjs
node tests/docs/run.mjs
node tests/contract/public-api.mjs
node tests/regression/theme-library.mjs      # W2 后改名/替换
node tests/regression/theme-presets.mjs      # W2 删除

# e2e（本地 Chrome；各自 CDP 端口，串行跑）
node tests/e2e/editor-minimal.mjs            # 9341
node tests/e2e/page-ops.mjs                  # 9342
node tests/e2e/preview-shell.mjs             # 9343
node tests/e2e/editor-ops.mjs                # 9344
node tests/e2e/feedback-fixes.mjs            # 9345
node tests/e2e/add-elements.mjs              # 9346
node tests/e2e/browser-export.mjs            # 9345（不要与 feedback-fixes 同时）
node tests/e2e/incremental-load.mjs          # 9241
node tests/e2e/render.mjs

# golden（ES 模块；EV 改动后才需要）
node tests/tools/golden-render.mjs --filter ev-range
node tests/tools/golden-diff.mjs

# 性能
node tests/perf/editor-perf.mjs

# 单项目抽验
node bin/open-pptd.js check examples/ev-range/deck.pptd
node bin/open-pptd.js build examples/ev-range/deck.pptd --format pptx -o /tmp/ev.pptx
```

## 5. 基线（开工前）

- `run-all`：39/39。
- `tests/cli/surface.mjs`：72/72。
- `tests/skill/run.mjs`：101/101。
- `tests/docs/run.mjs`：35/35。
- golden：23 项目 / 142 页，第二遍 142/142 字节一致。
- e2e：editor-minimal 21、page-ops 17、editor-ops 22、preview-shell 23、feedback-fixes 21、add-elements 12、browser-export 15、incremental 5、render 9。
- EV 当前 15 页、章节条 24px（已 rebaseline）。

## 6. 约定

- Zero-dependency ESM，Node ≥ 18（当前环境 Node 24），无 build step。
- 注释/文档中文；公开 API 注释可中英混排但保持文件内一致。
- commit：`feat(scope): …` / `fix(scope): …` / `chore(scope): …` / `docs(spec): …`。
- 不新增依赖；不新增测试套件（除非替换旧套件）。
- 不 push / tag / release。
- `packages/model/vendor/**`、公式解析（`latex.js`/`mathml2omml.js`/`vendor`）禁触。

## 7. 环境陷阱

- Windows + Git Bash；路径含空格/中文时用引号；不要用 `sed -i` 改多字节文件（可能破坏编码），优先 Edit/Write。
- e2e 依赖本机 Chrome/Edge；每个套件固定 CDP 端口，不能并行跑同端口。
- golden 渲染慢；`--filter ev-range` 只重渲 EV，`golden-diff` 比较全量。
- `assets/` 字体/图标字节可能不在工作树；不要因缺失资源改测试逻辑。
- 服务端口随机（`port:0`）；e2e 自己起服务。
- `tests/run-all.mjs` 的套件列表是手工维护；新增/删除 suite 必须同步该文件。
- `tests/docs/run.mjs` 会扫描全仓已删除文档引用；README 改动要过它。
- `tests/e2e/editor-minimal.mjs` 对 Design 面板 DOM 有硬断言，改 UI 必须同步。
- `tests/e2e/incremental-load.mjs` 的 fixture 当前写 `theme: cyan`；删 palette 后要改成合法 colors 对象或省略。

## 8. “找 X 去哪”

| 找什么 | 去哪 |
|---|---|
| 默认 theme / 颜色 token | `packages/model/theme-presets.js`、`theme.js` |
| 主题库/applyTheme | `packages/model/theme-library.js`（W2 删除） |
| 颜色 token 增删/usage | `packages/model/theme-library.js`（W2 移到 `color-tokens.js`） |
| 设计面板 | `editor/interaction/design-panel.js` |
| 编辑器状态/历史 | `editor/app/state.js`、`editor/interaction/history.js` |
| 渲染调度/缩略图 | `editor/app/view/view.js`、`thumbnails.js` |
| 颜色写入/加载 | `editor/app/project/loader.js`、`source.js`、`io.js` |
| API 门面 | `editor/app/api.js` |
| CLI assets | `packages/cli/assets.js`、`bin.js` |
| CLI build | `packages/cli/build.js` |
| CLI doctor | `packages/cli/doctor.js` |
| server themes | `packages/server/themes.js`、`theme-store.js`（W1 删除） |
| export theme override | `packages/export/index.js`（W1 删除） |
| golden 清单 | `tests/golden/manifest.json`、`tests/tools/golden-*.mjs` |
| EV 页面 | `examples/ev-range/pages/*.page`，封面 01、尾页 15 |
