# repo-map · open-pptd 当前仓库地图

> 依据：2026-10-31 主检出 `C:\Users\shifu\Desktop\open-pptd`（Windows 10 + Git Bash + Node 24）。
> 本文件是稳定知识，所有波次共用；不描述 3.0 目标实现细节（见 `interfaces.md`）。

## 1. 目录职责

| 目录 | 职责 | 3.0 变化 |
|---|---|---|
| `bin/open-pptd.js` | CLI 薄入口，转发 `packages/cli/bin.js` | 保留，5 命令入口 |
| `packages/model/` | PPTD 格式、模型、解析/序列化、theme、字体注册、图标注册、校验、类型注册表、表格模型、SVG、公式 | 继续作为格式/类型源；新增主题/字体库核心；TypeManifest 统一 |
| `packages/renderer/` | 浏览器 DOM 预览：page/text/shape/line/image/icon/table/chart/background + headless CDP | 消费 TypeManifest render 分片；PNG 后端统一 |
| `packages/writer/` | 自研 OOXML PPTX writer：slide/text/shape/line/image/icon/table/chart/font/zip | 消费 TypeManifest toXml 分片 + LayoutTree/TableFacts；字体走 ResourceProvider |
| `packages/measure/` | 纯函数字体度量（font-metrics/metrics-table） | 唯一度量实现；删除 adapters/dom 桩 |
| `packages/layout/` | resolve→layout：LayoutTree、text/table frame、overflow | 表格 TableFacts 唯一高度；无 DOM |
| `packages/server/` | 本地静态服务、`/api/save`、`/events` SSE、`/api/export-image`、gallery manifest | 保留 save/SSE；新增 themes/fonts API；保存原子化 |
| `packages/cli/` | 2.x 命令：serve/export/export-project/render/ensure/check/gallery/assets/fonts/icons/doctor/paths | 3.0 收敛为 open/build/check/assets/doctor |
| `packages/vendor/echarts.mjs` | ECharts 浏览器/SSR 共享 vendor | 保留；chart 懒加载 |
| `editor/` | 网页编辑器/画廊：main/editor/dom/ui/gallery/theme；app/project 加载保存；interaction 编辑手势/面板/对话框；types UI shard；styles；components 半成品 | 最小编辑器 + Design 面板 + preview/editor 拆分 + 单壳 |
| `editor/app/project/` | ProjectSource、loader、saver、font-manager、images、icons、live-reload、handle-store | 迁移到 ProjectRuntime/ResourceProvider；save 原子化 |
| `editor/interaction/` | canvas/stage/drag-select/align-guides/arrange/history/properties/fields/add-menu/contextmenu/font-panel/theme-panel/excel-grid/dialogs | 保留变换/多选/参考线/content editors/page menu；删除属性/快捷条等 |
| `editor/types/` | 每类型的菜单/create/props/quickbar UI shard | 只保留 text/table/chart contentEditor；其余类型无 UI |
| `assets/` | `fonts/registry.json`、`icons/registry.json`（字节不入 git / 按需下载） | 字体全局库 home；registry 只读包内 |
| `examples/` | 16 套展示项目（deck.pptd + pages + media + meta/style） | README/画廊展示；不作为 skill 配方源 |
| `skill/` | **3.0 新增**：SKILL.md + references + kits | 外部 skill 仓归档；release 产出 skill zip |
| `docs/` | 当前：embedding / image-generation / release-workflow / archive / images | 只保留 release-workflow + images；其余删除 |
| `specs/` | 当前：UI 重设 spec / DSH mapping；3.0 本组 | 旧 specs 删除；只保留本组活跃 spec |
| `tests/` | run-all、contract、regression、e2e、golden、projects、tools | 增加 runtime/export/table/theme/font/image/cli/skill/docs 门禁 |
| `scripts/` | pack-release、gen-font-metrics、gen-icon-registry、gen-preset-geometry | 增加 skill zip；pack-release 更新 |
| `.github/workflows/` | pages.yml、release.yml | release 增加 skill zip；DSH 无关 |

## 2. 入口点与核心模块

### 2.1 包入口（当前 contract 2）

- 根：`packages/index.js`（Node 专用，导出 model/renderer/writer/server/cli/paths/config/measure/layout）
- 子入口：`open-pptd/model|renderer|writer|server|cli|editor|paths|config|measure|layout`
- 机器可读：`contract.json`
- 依赖门禁：`tests/regression/dep-graph.mjs`
- 契约测试：`tests/contract/public-api.mjs`

### 2.2 CLI

- 入口：`bin/open-pptd.js` → `packages/cli/bin.js`
- 当前命令：`serve` / `export` / `export-project` / `render` / `ensure` / `check` / `gallery` / `assets` / `fonts` / `icons` / `doctor` / `paths`
- 业务：`packages/cli/{export,render,check,ensure,assets,fonts,icons,gallery,doctor,resource-status,download}.js`
- 当前 serve 状态：`~/.open-pptd/state/serve.json`；`--detach/--json/--stop`
- 3.0 目标：`open/build/check/assets/doctor`，见 `ref/cli.md`

### 2.3 编辑器

- 页面：`editor/index.html`（静态骨架）+ `editor/main.js`（boot）+ `editor/editor.js`（createEditor 装配）
- 画廊：根 `index.html` + `editor/gallery.js`
- 状态/API：`editor/app/state.js`（deck/selection/history/clipboard/ops）、`editor/app/api.js`
- 视图：`editor/app/view/{view,viewport,thumbnails,dom-measure}.js`
- 交互：`editor/interaction/*`
- 类型 UI：`editor/types/*` + `packages/model/registry.js` 分片
- 主题注入：`editor/theme.js`（UI 令牌，不等于 deck 主题）
- 资源：`editor/app/project/*`
- 保存/导出：`editor/app/project/saver.js`、`editor/app/export-image.js`
- 放映：`editor/app/present.js`
- 嵌入/headless：`editor/?shot=1` + `editor/app/shot.js` + `packages/renderer/headless/*`

### 2.4 渲染/导出数据流（当前）

```text
deck.pptd + pages/*.page
  → parseDeck (model/pptd-io)
  → editor loader / gallery loader / CLI loadProjectFiles
  → layout(deck, measure) → LayoutTree
  → renderer paintPage / renderPage (DOM preview, gallery, present, thumbnails)
  → writer buildPptx (OOXML) / renderDeck (headless PNG) / export-image (browser PNG)
```

当前问题：loader 有 3–4 套；PNG 有 foreignObject/headless/capture 多条；表格高度有 layout/renderer/writer/table-editor 多定义；图表 DPR 在 headless 首屏错误。

### 2.5 类型注册表（当前）

- `packages/model/registry.js`：`registerType/getType/allTypes`，按 type 合并分片。
- 分片：
  - renderer `packages/renderer/types/index.js`（render）
  - writer `packages/writer/types/index.js`（toXml）
  - editor `editor/types/*`（label/menu/create/props/quickbar）
  - group 有编辑器 shard；renderer/writer 不注册；`ELEMENT_TYPES` 包含 group，注释与实际有历史偏差。
- 3.0 目标：TypeManifest 唯一类型清单，见 `ref/interfaces.md`。

## 3. 构建、测试、lint 命令（真实可跑）

零构建、零 npm 依赖；Node ≥ 18。

```bash
npm test                     # tests/run-all.mjs：导项目 + 全套 regression/contract
npm run test:deps            # dep-graph
npm run test:formula         # 公式
npm run test:icon            # 图标
npm run test:shapes          # 预置形状
npm run test:render          # e2e headless PNG（需 Chrome/Edge）
npm run test:incremental     # e2e 增量加载（需 Chrome/Edge + serve）
npm run test:isolate         # 单页隔离导出（诊断）
npm run test:fixtures        # 生成公式 KaTeX 中间产物
npm run pack                 # scripts/pack-release.mjs
```

3.0 目标新增：`npm run test:skill`（skill 引用/kit/fragments）、`npm run test:docs`（链接/命令检查）；具体见 `ref/testing.md`。

## 4. 关键类型/接口/数据流

- Deck：`{version,title,size,theme,fonts,pages,extra}`；Page：`{pageType,background,notes,elements,extra}`。
- Element：`{elementId,elementType,bounds,rotation,flip,opacity,...}`；类型字段见 `packages/model/style-spec.js` + `references/pptd`（当前 skill 仓）。
- Theme：`{colors,textStyles,tableStyles}`（官方结构）；`DEFAULT_THEME`/`THEME_PALETTES` 在 `packages/model/theme-presets.js`。
- Fonts：`deck.fonts` 资源表 + `assets/fonts/registry.json` + home 字节；`packages/model/font-registry.js`、`writer/font.js`。
- ProjectSource：`editor/app/project/source.js` 的 duck type（capabilities/read/write/readMedia/watch）。
- LayoutTree：`packages/layout/index.js`；Table facts 目前由 `measureTable` 产出，writer 自行重算。
- Export：`packages/writer/pptx.js`（browser/Node 共用）、`packages/cli/export.js`（Node 资源/provider）、`editor/app/project/saver.js`（browser）、`editor/app/export-image.js`（PNG）、`packages/server/export-image.js`（headless capture）、`packages/renderer/headless/shoot.js`（CDP）。
- Skill：外部仓 `open-pptd-skill`（待迁入 `skill/`）；SKILL.md + references + slides_categories（无 templates 目录）。

## 5. 约定

- 代码注释英文；commit 信息中文 conventional（如 `refactor(editor): ...`）。
- 零 npm 依赖、零构建；ESM；相对 import。
- 依赖方向：editor → packages；packages/model 不 import 兄弟包；双端包禁 node:/DOM（见 dep-graph）；3.0 新增 runtime/export 边表。
- 契约：barrel/contract.json/contract tests 三处一致；新增导出兼容，删除/改名破坏性需升 CONTRACT_VERSION。
- 测试：新增 regression 加一行 `tests/run-all.mjs`；新增组件项目直接放 `tests/projects/`；golden 由 `tests/tools/golden-*` 维护。
- 文档：当前 docs 有历史遗留；3.0 只保留 release-workflow + images，见 `ref/docs.md`。
- UI：现有 Line 细线风格；3.0 最小编辑器保留 tokens/components 中原语的最小部分；不新增 UI 框架。

## 6. 环境陷阱

- Windows + Git Bash；路径/引号要小心（历史上存在非 ASCII 路径，当前 `C:\Users\shifu\Desktop\open-pptd`）。
- Node 24；无 npm 依赖；`node tests/run-all.mjs` 会导出 projects 并依赖字体/浏览器，首次可能较慢。
- 字体本体约 155 MB 不入 git；`~/.open-pptd/assets/fonts` 需按需下载；CI/无字体环境部分测试会 skip 或 fallback。
- Chrome/Edge：本机已安装；`renders`/`test:render`/headless 需要；Office PowerPoint 已安装但 3.0 不用；WPS/LibreOffice 未安装。
- `tests/tools/ui-shots.mjs` 使用固定 CDP 端口 9247；多 agent 并行时不要同时跑。
- serve 默认 55173，端口占用自动顺延；`--detach` 状态文件单实例；3.0 `open` 可能改为按项目/端口索引。
- 图片资产：docs/images 约 3.5 MB，README 引用；不要误删。
- 源码/资源路径：`packages/model/vendor`、`packages/vendor/echarts.mjs` 体积大（约 1.6 MB），懒加载策略需谨慎。
- 当前没有 DSH 适配维护；3.0 删除 DSH 文档与相关引用。
- 3.0 计划文档在 `specs/2026-10-31-2102-open-pptd-3.0/`；不要把它当旧 specs 删除。

## 7. 找 X 去哪

| 找什么 | 去哪 |
|---|---|
| PPTD 格式/字段 | `packages/model/style-spec.js`、`packages/model/model.js`、`packages/model/pptd-io.js`、当前 skill references/pptd.md（迁入后 `skill/references/format|elements|charts.md`） |
| 元素类型注册/分片 | `packages/model/registry.js`、`renderer/types`、`writer/types`、`editor/types` |
| 图表类型/option/导出路由 | `packages/model/chart/**`、`renderer/chart.js`、`writer/chart/**` |
| 表格高度/合并 | `packages/model/table.js`、`measure/font-metrics.js`、`layout/index.js`、`renderer/table.js`、`writer/table.js`、`editor/interaction/dialogs/table-editor.js` |
| 文字度量 | `packages/measure/**`、`editor/app/view/dom-measure.js`（将删除） |
| 主题/配色/字体 | `packages/model/theme*`、`editor/interaction/theme-panel.js`（将删除）、`font-panel.js`（将删除）、`editor/app/project/font-manager.js` |
| 导出 PPTX | `packages/writer/**`、`packages/cli/export.js`、`editor/app/project/saver.js` |
| PNG/headless | `editor/app/export-image.js`、`packages/server/export-image.js`、`packages/renderer/headless/**` |
| 本地服务/保存/SSE | `packages/server/**`、`editor/app/project/source.js`、`live-reload.js`、`saver.js` |
| 画廊/编辑器 UI | `index.html`、`editor/index.html`、`editor/main.js`、`editor/app/**`、`editor/interaction/**`、`editor/styles/**` |
| 测试/黄金基线 | `tests/**`、`tests/tools/golden-*` |
| 发布/安装 | `scripts/pack-release.mjs`、`.github/workflows/release.yml`、`install.ps1/sh`、`docs/release-workflow.md` |
| Skill | 外部 `open-pptd-skill`（待迁入 `skill/`）；3.0 目标 `skill/SKILL.md` + references + kits |
| 3.0 决策 | 本组 `ref/decisions.md` |
