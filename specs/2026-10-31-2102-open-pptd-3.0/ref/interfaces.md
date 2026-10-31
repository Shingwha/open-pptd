# interfaces · 3.0 目标契约（草案）

> 本文件是跨波唯一契约。每波合并后由 lead 按现实回写；worker 只读本文件，不读其他波内部实现。
> 路径/包名为 spec 决策；若实现阶段必须调整，只能由 lead 统一改本文件后通知后续波次。

## 1. 包与入口

### 1.1 新增/保留的包

| 包 | 职责 | 双端 | 依赖 |
|---|---|---|---|
| `packages/model` | PPTD 格式、类型清单、theme、字体/图标 registry、表格模型、校验 | 是 | 无兄弟包 |
| `packages/measure` | 纯函数度量 | 是 | model |
| `packages/layout` | LayoutTree / TableFacts | 是 | model, measure |
| `packages/runtime` | ProjectRuntime：load/parse/resolve/serialize、checkProject、ResourceProvider 接口 | 是（纯逻辑） | model, measure, layout |
| `packages/export` | ExportService：check/pptx/png/bundle 编排、RenderBackend 接口、报告 | 是（纯逻辑 + 注入 backend） | runtime, writer, model, measure, layout |
| `packages/writer` | OOXML writer（消费 LayoutTree/TableFacts） | 是 | model, measure, layout（新增边） |
| `packages/renderer` | DOM 预览 / chart / table / headless（headless 保留 Node 子目录） | 浏览器 + headless | model, layout, vendor |
| `packages/server` | 本地服务 + save/SSE/themes/fonts/export-image | Node | runtime, export, writer, renderer/headless |
| `packages/cli` | 5 命令与程序化导出 | Node | runtime, export, server, paths/config |
| `editor/` | 浏览器预览/最小编辑器/画廊/Design 面板 | 浏览器 | model/renderer/writer/runtime/export |

**禁止**：runtime/export 不得 import editor/server/cli；model 不得 import 兄弟包；双端包不得出现 node:/DOM。dep-graph 边表同步更新。

### 1.2 包入口（contract 3.0）

- 根 `open-pptd`：Node 入口，导出 model/renderer/writer/runtime/export/paths/config/measure/layout；不导出 editor/server/cli？**决策：根入口保持 Node 专用，但只导出双端核心；server/cli 通过子入口 `open-pptd/server`/`open-pptd/cli`。**
- 子入口：`open-pptd/{model,renderer,writer,runtime,export,measure,layout,paths,config,server,cli,editor,editor/index.html}`
- `CONTRACT_VERSION = 3`；`contract.json.contractVersion = 3`；删除 `./internal/*`；删除旧深路径与 aliases。
- 公开名以 `contract.json` + `tests/contract/public-api.mjs` 断言；新增导出兼容，删除/改名破坏性。

## 2. ProjectSource

沿用并收紧现有 duck type（editor → runtime；browser/Node adapter 实现）：

```js
/**
 * @typedef {Object} ProjectSource
 * @property {{ writable:boolean, liveWatch:boolean, binary:boolean }} capabilities
 * @property {(input?: any) => Promise<ProjectFiles>} read
 * @property {(files: SourceFile[], opts?: { expectedRevision?: string }) => Promise<number>} [write]
 * @property {(path: string) => Promise<Uint8Array|null>} [readMedia]
 * @property {(cb: (evt: {kind:"deck"|"page"|"media", path:string}) => void) => (() => void)} [watch]
 */
```

- `ProjectFiles`：`{ manifestText, pageFiles: Map<string,string>, media?: Map<string,Uint8Array>, manifestPath?, revision? }`
- `SourceFile`：`{ path, text?, bytes? }`
- preview 可只实现 `read/readMedia/watch`；editor 保存需要 `write`。
- `expectedRevision` 用于冲突检测；不匹配必须抛 `RevisionConflictError`（含 currentRevision），不得静默覆盖。
- 删除旧的 `source.write(files)` 单参数歧义；统一 `SourceFile[]`。
- 实现（W2）：纯内存 `memorySource` 在 `packages/runtime/source.js`；Node 磁盘 source `createDiskProjectSource` 在 `packages/server/runtime-node.js`（Node-only）。

## 3. ResourceProvider

```js
/**
 * @typedef {Object} ResourceProvider
 * @property {(ref: FontRef) => Promise<Uint8Array|null>} fontBytes
 * @property {(ref: FontRef) => Promise<"ready"|"system"|"missing"|"fetchable">} fontStatus
 * @property {(name: string) => Promise<string|null>} iconSvg
 * @property {(src: string) => Promise<Uint8Array|null>} imageBytes
 * @property {() => Promise<{fonts: object[], icons: object[], themes: object[]}>} [inventory]
 */
```

- `FontRef`：`{family, key?, file?, url?, subset?}`；解析顺序：deck/project → global user library → built-in registry → system → missing。
- Browser adapter：fetch/Cache/FontFace；Node adapter：fs + registry + user index；memory：tests。
- 图片返回原始字节（PNG/JPEG/GIF）；不支持格式返回 null 并诊断；转换（WebP/SVG→PNG）在 skill/agent 侧完成，不进入核心。
- 实现（W2）：`memoryProvider` 在 `packages/runtime/provider.js`；`createFsResourceProvider` 在 `packages/server/runtime-node.js`，不联网（`fetchable` 只表示 registry 有 url 无本地字节）。
- 可选环境事实扩展（W2，非必需）：provider 可提供 `fileExists(path)`、`fontRegistry()`、`iconRegistry()` 供 check 使用。

## 4. ProjectRuntime

```js
export async function loadProject(input, { source }) → ProjectFiles
export function parseProject(files) → Deck
export function createProject(files, deck?) → Project
export async function resolveProject(deckOrProject, { resources, themeLibrary? }) → ResolvedProject
export function serializeProject(project, { mode: "snapshot"|"raw" }) → FileBundle
export function checkProject(project, { resources, layout?, fileExists?, fontRegistry?, iconRegistry? }) → CheckReport
```

- `Project`：`{manifestName, manifestPath, baseDir?, pageFiles, media?, deck, manifestText?, revision?}`
- `ResolvedProject`：`{project, deck, theme, fontFaces?, imageMap, iconMap, fontStatus, missing:{fonts,icons,images}, unsupported:[]}`
- `FileBundle`：`{files: SourceFile[], manifestName}`；`snapshot` 由模型序列化；`raw` 仅 Node 磁盘原样（CLI bundle `--raw`），浏览器不实现。
- `loadProject` 不解析 page YAML 之外的环境资源；字体/图片解析在 `resolveProject`。
- `checkProject` 纯逻辑（W2 起同步，无 IO）；CLI/editor/server 共享；不写文件、不下载。
- W2 已实现：`packages/runtime/{index,source,provider,parse,resolve,serialize,check,errors,paths}.js`；CLI `check`/`export` 已接入，命令面与输出不变。

## 5. ExportService

```js
export async function exportProject(project, options, env) → ExportReport
```

`options`：

```js
{
  format: "pptx" | "png" | "bundle",
  outPath?: string,
  theme?: themeId | ThemeSnapshot,   // 仅显式 override；默认用 deck.theme
  check?: boolean,                   // default true; full checkProject
  fetchFonts?: boolean,              // default false; explicit only
  offline?: boolean,
  strict?: boolean,
  // pptx
  embedFonts?: boolean,              // default true
  fullFonts?: boolean,               // default false
  // png
  pages?: number[] | "all",          // default all
  scale?: 1|2|3,                     // default 1
  backend?: "capture"|"foreignObject"|"headless"|"auto",
  browserPath?: string,
  timeoutMs?: number,
  // bundle
  bundleMode?: "snapshot"|"raw"      // default snapshot; raw Node-only
}
```

`env`：

```js
{
  resources: ResourceProvider,
  renderBackend?: RenderBackendFactory,
  sink?: { writeFile(path, bytes), download(name, bytes, mime), ... },
  onProgress?: (evt) => void
}
```

`ExportReport`：

```js
{
  ok: boolean,
  format,
  outPath?: string,
  pages?: number[],
  checked: {fonts,icons,media},
  fetched: [], embedded: [], skipped: [], missing: [],
  warnings: string[],
  errors: string[]
}
```

- 所有格式先跑 `checkProject`；error 阻断；warning 软；strict 时 warning/missing 阻断。
- PPTX/bundle 不依赖浏览器；PNG 依赖 browser backend。
- bundle `snapshot` 与编辑器“导出项目包”一致；`raw` 保留磁盘原样（CLI 归档模式）。
- **禁止**再出现 saver/export-image/cli export 各自实现 zip/preflight/report。
- W3 已实现：`packages/export/{index,errors,report,pptx,bundle,png}.js`（纯双端）。报告扩展字段 `check`（结构化 CheckReport）、`skippedIcons`、`unsupported`、`files`、`artifacts`（无 sink 时内存字节）、`bytes`。
- W3 错误码：`ERR_INVALID_FORMAT/ERR_INVALID_OPTION/ERR_NO_RESOURCES/ERR_NO_RENDER_BACKEND/ERR_RENDER_BACKEND/ERR_PAGES/ERR_BUNDLE_RAW/ERR_EXPORT`；check 失败以 `ok:false` 返回，基础设施失败抛 `ExportError`。
- CLI 兼容期口径（W3）：`export` 传 `checkLayout:false` 保持旧闸门输出；`export-project` 已按 checkProject 阻断坏 deck；W10 切到完整 check。

## 6. RenderBackend / PNG

```js
createRenderBackend({
  width, height, scale,
  mode: "headless"|"capture"|"foreignObject",
  target, // server/CLI/editor host
  ...adapter
}) → {
  prepare(): Promise<void>,          // 在第一次 paint 前设好 viewport/deviceScaleFactor/pixelRatio
  paint(page, { pixelRatio }): Promise<void>,
  capture(): Promise<Uint8Array>,
  dispose(): Promise<void>
}
```

- 导出 `pixelRatio` 恒等于 `scale`；在第一次 paint 前确定；第 1 页和后续页同一策略。
- headless：导航/ready → setDeviceMetricsOverride → **重新 paint page 0** → capture；后续页 goto 后 capture。
- capture：服务端临时项目 + headless；返回 PNG bytes。
- foreignObject：浏览器 DOM → dataURL/SVG/canvas；仍用 `pixelRatio=scale`，图表 canvas 不被二次压扁。
- 三条 backend 共用 ExportService 的页选择、scale、命名、zip、报告；只有 rasterize 实现不同。
- 禁止依赖 `window.devicePixelRatio` 决定导出清晰度。
- W3 已实现 Node/headless backend：`packages/renderer/headless/backend.js`（由 CLI/`render.js` 注入 `env.renderBackend`）。修复要点：导航前 `setDeviceMetricsOverride(dsf=scale)`；ready 后按 deck 尺寸复设并重绘 page 0；每次 goto 后等 ready 再截图；临时渲染 server 必须 `liveReload:false`（否则 SSE 重载把页码重置为 0）。

## 7. TypeManifest

```js
export function defineType({
  id, label,
  schema?: (el) => Issue[],          // 可选；默认通用 schema
  layout?: (theme, el, ctx) => LayoutPart,
  render?: (theme, el, ctx) => Node|null,   // renderer shard
  toXml?: (theme, el, ctx) => string,       // writer shard
  contentEditor?: () => Promise<ContentEditorModule>, // text/table/chart only
  composite?: boolean,               // group: shell only; render/writer skip
})
```

- **唯一类型列表**：`ELEMENT_TYPES`、validate、layout、add menu、content editor 均从 TypeManifest 派生；删除硬编码 switch/独立数组。
- 分片合并：model 定义元数据；renderer 注册 `render`；writer 注册 `toXml`；editor 注册 `contentEditor`/label。render/toXml 分片必须可动态 import；预览不得加载 writer，导出不得加载 UI。
- `schema`/`layout` 默认纯函数；类型特例（text/table/group）在 shard 内处理，不写回 model。
- `group`：`composite: true`，无 render/toXml；layout 跳过 shell，成员独立；编辑器不提供组合操作；已有 group 壳按成员渲染。
- `contentEditor` 只允许 text/table/chart；不得有 menu/create/props/quickbar 字段。

### 7.1 TableFacts

```js
{
  columnWidthsPx: number[],
  rowHeightsPx: number[],      // 内容感知 + rowSpan 补差 + 一次取整
  totalHeight: number,
  overflow: object
}
```

- `layout.frame.h = totalHeight`；renderer box height = totalHeight；writer `a:ext cy = totalHeight`；selection/overflow = totalHeight。
- `bounds.h` 只作为 `rowHeights` 比例种子；无 rowHeights = 内容高；纵向缩放统一写 `rowHeights`。
- rowSpan 额外高度平均分给跨度行；padding 只算一次；整数余数确定分配。
- writer 消费 layout facts，不自行 `measureTable`。

## 8. ThemeStore

```js
/**
 * @typedef {Object} ThemeFile
 * @property {number} version
 * @property {string} id
 * @property {string} name
 * @property {string} [description]
 * @property {boolean} [builtin]
 * @property {Record<string,string>} colors     // 17 标准 key + 任意自定义 token
 * @property {Record<string,object>} textStyles
 * @property {Record<string,object>} tableStyles
 */

export const ThemeStore = {
  list(): Promise<ThemeFile[]>,                 // builtin + user
  read(id): Promise<ThemeFile|null>,
  save(theme): Promise<ThemeFile>,              // user only; builtin read-only
  remove(id): Promise<void>,                    // user only
  import(json): Promise<ThemeFile>,
  export(id): Promise<string>
};
```

- 内置主题：默认主题 + 10 个 palette 展开为完整主题（默认 textStyles/tableStyles + palette colors）。
- 用户主题：`~/.open-pptd/themes/*.json`；本地 server `/api/themes`；静态站只读内置。
- 应用：

```js
applyTheme(currentDeckTheme, theme) → { theme, preserved: {colors:string[], textStyles:string[], tableStyles:string[]} }
```

  - 主题 colors/textStyles/tableStyles 覆盖当前；
  - 扫描 deck 引用（`$token`、`style`、`textStyle`）；新主题缺少但 deck 仍引用的项从旧主题保留；
  - 未引用的旧项丢弃；结果可撤销；报告 preserved。
- 自定义颜色：`colors` 任意 key；UI 添加/编辑/删除；删除被引用 token 必须警告/阻止；颜色选择器读取全部 token。
- 主题库只存 JSON，不存字体字节；textStyles/tableStyles 的 fontFamily 由 FontLibrary 解析。

## 9. FontLibrary

```js
/**
 * @typedef {Object} FontEntry
 * @property {string} key
 * @property {string} family
 * @property {string} file        // user library 相对文件名
 * @property {"builtin"|"user"|"url"|"system"} source
 * @property {string} [license]
 * @property {number} [size]
 * @property {boolean} [subset]
 */

export const FontLibrary = {
  list(): Promise<FontEntry[]>,             // builtin registry + user index
  importFile(bytes, meta): Promise<FontEntry>, // 本地/URL 下载后复制到 home
  remove(ref): Promise<void>,               // user only；警告被项目使用
  resolve(ref): Promise<FontEntry|null>     // deck/project → user → builtin → system
};
```

- 用户字体：`~/.open-pptd/assets/fonts/user/` + 索引；全局复用；浏览器/CLI 同一套。
- `deck.fonts` 只引用 family；不再区分“我的字体/内置”。
- 导出字体嵌入全局设置：`embedFonts`/`fullFonts`；所有 used fonts 统一；系统字体不嵌入；缺失字体警告。
- 文本/表格/图表字体选择器按 theme/library/system 分组；不维护 per-font embed/subset chip。
- 项目包携带字体后移；PPTX 嵌入负责交付；项目包依赖全局字体库。

## 10. Editor

### 10.1 createPreview / createEditor

```js
createPreview(rootEl, {
  source, deck?, deckUrl?, theme?, chrome?, on?
}) → { ready, destroy, view, io, state }

createEditor(rootEl, {
  source, deck?, deckUrl?, theme?, chrome?, dialogs?, on?
}) → { ready, destroy, preview, editor, io, state }
```

- `createPreview`：load/layout/paint、翻页、缩放/平移、放映、live reload、导出、主题明暗；用于画廊封面、headless、嵌入预览。
- `createEditor`：在 preview 上增加单选/多选/变换/智能参考线、文字/表格/图表内容编辑、颜色、添加 3 类、删除、undo/redo、保存、页面操作、Design 面板。
- 自包含：骨架渲染进 rootEl；dom/dialog/toast/popover/present/theme 实例级；无 document 全局骨架/单例；destroy 幂等；双实例互不污染。
- `chrome`: `"full" | "embedded"`；删除 `"shot"`/`interactive` 旧分支；headless 直接用 createPreview。
- `locale` 删除；`dialogs` 保留（宿主可注入 alert/confirm）。

### 10.2 Editor API

```js
editor: {
  // selection / transform
  select(id, mode?), selectMany(ids, mode?), selectAll(), clearSelection(),
  getSelected(), getSelection(), getSelectedElements(), isSelected(id),
  beginChange(), endChange(), refreshPreview(),
  moveSelected(dx,dy), resizeSelected(patch), rotateSelected(angle),
  deleteSelected(), undo(), redo(),
  // content
  openTextEditor(el?), openTableEditor(el?), openChartEditor(el?),
  updateSelected(patch),
  // page ops
  addText(), addTable(), addChart(), insertPage(at), deletePage(i), movePage(from,to),
  // save/export
  save(), exportPptx(), exportPng(), exportBundle(),
  // navigation/view
  goToPage(i), nextPage(), prevPage(), zoomIn(), zoomOut(), zoomReset(),
  present(), reload()
}
```

- 内容编辑只允许单元素；多选时打开编辑器先归一为单选。
- 页面操作单页；无页面多选/批量/复制页。
- 删除的 API 不保留：group/ungroup、align/distribute、moveLayer/edge、clipboard、duplicate、page duplicate/batch。
- `view`/`state` 暴露为只读/不稳定；对外 API 以 `editor` 为准。

### 10.3 ProjectSource 读写

- preview：只读 source；editor：读写 source；local handle 用 readwrite；save 原子 + revision conflict。
- 删除 `source` 内部的 fetch("/api/save") 硬编码；HTTP adapter base-aware（含 `/pptd` 前缀、export-image 端点）。
- `directoryHandleSource` 保存要批量原子写/回滚；`httpSource` 保存要服务端原子 batch。

## 11. CLI 5（详见 ref/cli.md）

```text
open-pptd open [dir] [--deck <file>] [--port <n>] [--detach] [--json]
                    [--open|--no-open] [--stop] [--blank]
open-pptd build <manifest> --format pptx|png|bundle [-o <path>]
                    [--fetch|--offline] [--strict] [--json]
                    pptx: [--theme <id>] [--no-embed-fonts] [--full-fonts]
                    png:  [--page <n|all>] [--scale <1|2|3>] [--browser <path>] [--timeout <ms>]
                    bundle: [--raw]
open-pptd check <manifest> [--json] [--strict]
open-pptd assets list|sync [all|fonts|icons] [--from <zip>] [--json]
                    | clean [--json]
                    | themes list|import|export|delete|apply
                    | fonts list|import|remove
open-pptd doctor [--json]
```

- 旧命令/别名全部删除：serve/export/export-project/render/ensure/paths/gallery/fonts/icons。
- 所有 JSON 输出单行；人类文本 stderr（`open --json`/`build --json`）。
- `open` 无参数 Home；`--blank` 空白编辑器；`<dir>` 自动识别唯一 `.pptd`；缺失/多个 fail-fast。
- `build` 默认完整 check；`--fetch` 显式下载项目引用字体；不读 config.autoFetch。
- `check` 只读；`--strict` warnings 也失败。
- `assets` 管理内置/用户主题与字体；`doctor` 环境 + 路径 + 库摘要。

## 12. Contract 3.0 / 迁移

- `CONTRACT_VERSION = 3`；`contract.json.contractVersion = 3`。
- `exports` 增加 `./runtime`、`./export`；删除 `./internal/*`；删除旧深路径。
- 旧 `editor/index.js` 导出 `createEditor` 保留但签名/行为按 10.1；新增 `createPreview`；删除旧 `interactive`/`chrome:"shot"`/locale。
- 旧根入口再导出 server/cli → **移到子入口**，根入口只导出双端核心；Node 专用 server/cli 从 `open-pptd/server|cli` 进入。
- 旧 CLI 全部删除；`build` 替代 export/export-project/render/ensure；`open` 替代 serve；`assets` 吸收 fonts/icons；`doctor` 吸收 paths。
- 旧 `renderPage`/`autoGrowTexts` 删除（3.0）；只用 layout + paintPage。
- 迁移表随 W10 写入 `ref/cli.md` 和 README/CHANGELOG。

## 13. Skill / Docs / Images（详见各 ref）

- `skill/`：`SKILL.md` + `references/{format,elements,charts,design,quality,shapes,images}.md` + `kits/{academic,business-review,consulting-report,brand-proposal,lecture,poster}/` + README；发布 `open-pptd-skill-v<ver>.zip`。
- 图片：`skill/references/images.md` 唯一源；原图优先；生图/搜图工具存在 + 用户 opt-in；透明 PNG alpha + 回归测试。
- Docs：最终 `docs/release-workflow.md` + `docs/images/`；删除 embedding/image-generation/archive/DSH/旧 specs；代码/测试/README 引用同步更新。

## 14. 错误类型（统一）

- `RevisionConflictError { currentRevision }`：保存冲突；UI 提示覆盖/重新加载/取消。
- `ResourceMissingError { kind, ref }`：字体/图标/图片缺失；导出软降级或 strict 阻断。
- `UnsupportedFormatError { format }`：图片/导出格式不支持。
- `RenderBackendUnavailableError { backend }`：PNG 无浏览器；提示 Chrome/Edge。
- 所有公开错误带 `code` 字符串；JSON 输出使用 `{ok:false,error:{code,message}}`。
- W2 已实现 code：`ERR_REVISION_CONFLICT` / `ERR_RESOURCE_MISSING` / `ERR_UNSUPPORTED_FORMAT`（`packages/runtime/errors.js`）。

## 15. 不做兼容的边界

- 不保留旧 CLI、旧包入口、旧深路径、旧编辑器选项、旧字体/主题面板 API、旧 skill 仓 clone URL。
- 旧 deck 数据仍可读：`deck.theme`/`deck.fonts` 格式保持可解析；不存在自动升级脚本；缺失字体/主题引用按新规则报告。
- 任何“为了旧调用方”加的 alias/shim 都视为违规；需要时更新调用方或 README/CHANGELOG。
