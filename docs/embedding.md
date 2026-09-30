# open-pptd 嵌入契约（embedding）

> 面向**下游嵌入方**（DSH 适配仓、技能仓、任何宿主）的对外契约文档。
> 权威设计稿：`docs/specs/ref/integration-plan.md` §3.3（契约面）与附录 D（接口签名）。
> 本文件只描述**已冻结或已规划**的对外面，不描述内部布局。

## 0. 契约总览

| # | 契约 | 入口 | 状态 |
|---|---|---|---|
| 4 | 包级入口 `exports` map + `contract.json` | `open-pptd`、`open-pptd/{model,renderer,writer,server,cli}` | **已冻结（本文详解）** |
| 1 | 可挂载编辑器 `createEditor` | `open-pptd/editor` | **已实现（v2.0.0）** |
| 2 | 传输接缝 `ProjectSource` | `open-pptd/editor` 的 `options.source` | **已实现（v2.0.0）** |
| 3 | 主题注入（含 dark） | `open-pptd/editor` | **已实现（v2.0.0）** |
| 5 | 资源与配置解析 `paths` / `config` | `open-pptd/paths`、`open-pptd/config` | **已实现（v2.0.0）** |

包级契约版本 `CONTRACT_VERSION = 2`（`packages/index.js`），与 `contract.json` 的
`contractVersion` 必须一致。

---

## 1. 契约 4：包级入口（已冻结）

### 1.1 稳定入口

现有 300+ 深路径收敛为下列入口；**下游只允许使用这些入口**。

| 子路径 | 文件 | 内容 |
|---|---|---|
| `open-pptd` | `packages/index.js` | `CONTRACT_VERSION` + 五个子入口的全部公开名（Node 专用，见 1.3） |
| `open-pptd/model` | `packages/model/index.js` | 解析/序列化、数据模型、注册表、主题、校验、遍历、预置形状；命名空间 `chart` / `icons` / `fonts` / `bytes` |
| `open-pptd/renderer` | `packages/renderer/index.js` | `renderPage` / `autoGrowTexts` / `disposeChartInstances` / `iconThumb`；命名空间 `renderers` |
| `open-pptd/writer` | `packages/writer/index.js` | `buildPptx` / `downloadPptx` / `downloadBlob` / `magicMatches` / `ZipWriter`；命名空间 `xml` / `parts` / `text` |
| `open-pptd/server` | `packages/server/index.js` | `createServer` / `startServer` / `PROJECT_ROOT` |
| `open-pptd/cli` | `packages/cli/index.js` | `runCheck` / `exportDeck` / `exportProject` / `runRender` / `runFonts` / `runIcons` / `runGallery` |
| `open-pptd/editor` | `editor/index.js` | 契约 1/2/3（规划中） |
| `open-pptd/paths` | `packages/paths.js` | 契约 5（规划中） |
| `open-pptd/config` | `packages/config.js` | 契约 5（规划中） |
| `open-pptd/measure` | `packages/measure/index.js` | 统一排版度量：`measureTextRuns` / `measureCell` / `measureTable` / `lineHeightMultiplierFor` / `fontMetricsMeasure`（MeasurePort 默认实现）+ 度量表 |
| `open-pptd/layout` | `packages/layout/index.js` | `layout(deck, measure?) → LayoutTree`（最终几何 + overflow 事实） |
| `open-pptd/editor/index.html` | `editor/index.html` | 编辑器页面 |
| `open-pptd/package.json` | `package.json` | 清单 |

`open-pptd/measure` / `open-pptd/layout`（渲染管线三段式，spec 08–09）：

```js
// open-pptd/measure —— 确定性纯函数度量（Node/CLI/CI 可跑可快照）
import { fontMetricsMeasure, measureTextRuns, measureCell, measureTable, lineHeightMultiplierFor } from "open-pptd/measure";
measureTextRuns(runs, { fontSize, lineHeight, lineHeightPx, fontFamily }, maxWidth) // → { lines, height }
measureTable(tableElement) // → { columnWidths, rowHeights, totalHeight }

// open-pptd/layout —— 几何事实一次性算定；paint/校验/writer 读同一棵树
import { layout } from "open-pptd/layout";
const tree = layout(deck, fontMetricsMeasure); // LayoutTree：frame / text / table / overflow{x,y,page,overlaps}
```

包根 `open-pptd` 同时再导出 `measure` 命名空间与 `layout` 函数（Node 专用入口）。
上述两入口为**纯新增导出**（`CONTRACT_VERSION` 维持 2）；`measure`/`layout` 为双端纯函数包，
与 `model`/`writer` 同档环境纯净（禁 `node:`/`fs`/`window.`/`document.`）。

`open-pptd/model` 冻结导出名（`packages/model/index.js`）：

```
parseDeck serializeDeck createDeck createPage nextElementId deckSize
PAGE_WIDTH PAGE_HEIGHT PAGE_TYPES SUPPORTED_SHAPES
registerType getType allTypes ELEMENT_TYPES
resolveTheme resolveColor resolveFont DEFAULT_THEME DEFAULT_FONT THEME_PALETTES mergePaletteColors
validateDeck registerRule walkElements collectImageSrcs
shapePaths shapeMenuIcon PRESET_SHAPES
chart icons fonts bytes                       # 命名空间
```

`open-pptd/renderer` 的 `renderers` 命名空间含：
`renderText renderShape renderLine renderImage renderIcon renderTable renderChart pageBackground`。

以上清单由 `tests/contract/public-api.mjs` 逐一断言；**新增导出是兼容变更，删除/改名是破坏性变更**。

### 1.2 `contract.json`：机器可读契约清单

`exports` map 只在"包位于 `node_modules` 或被支持自引用"时生效。open-pptd 的 CLI 可能被
**解压到 `~/.open-pptd/cli/versions/<ver>`** 这样的普通目录（无 `node_modules` 条目），
此下游无法写 `import "open-pptd/model"`，也不应拼 `join(root,"packages","model","index.js")`
（那会依赖内部布局，A 一重构就碎）。

因此包根提供 `contract.json`，由 A 自己声明入口，下游只读它：

```json
{
  "name": "open-pptd",
  "contractVersion": 2,
  "entries": {
    "model": "packages/model/index.js",
    "renderer": "packages/renderer/index.js",
    "writer": "packages/writer/index.js",
    "server": "packages/server/index.js",
    "cli": "packages/cli/index.js",
    "editor": "editor/index.js",
    "paths": "packages/paths.js",
    "config": "packages/config.js"
  },
  "bin": "./bin/open-pptd.js"
}
```

解析三步（**从任意绝对路径 import 的推荐写法**）：

```js
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const EXPECTED_CONTRACT_VERSION = 2;           // 下游硬编码自己支持的版本
const root = resolveCliRoot();                 // 你的引擎定位逻辑，指向含 contract.json 的包根

const c = JSON.parse(readFileSync(join(root, "contract.json"), "utf8"));
if (c.contractVersion !== EXPECTED_CONTRACT_VERSION) {
  // fail-fast：宁可在启动时报错，也不要在导出到一半时行为诡异
  throw new Error(
    `open-pptd 契约版本不匹配：需要 ${EXPECTED_CONTRACT_VERSION}，实际 ${c.contractVersion}`
  );
}

const { parseDeck, serializeDeck } = await import(pathToFileURL(join(root, c.entries.model)).href);
const writer = await import(pathToFileURL(join(root, c.entries.writer)).href);
```

**`contractVersion` 的 fail-fast 语义**：契约版本不匹配时下游必须**立即失败**，不得尝试兼容。
版本号只在破坏性变更时 +1；新增导出/新增子命令不升版本。

`contract.json.entries` 与 `package.json.exports` 的对应条目由契约测试断言**双向一一对应**
（任一侧多出/缺失都失败），防止两处口径漂移。

### 1.3 不变量

1. **零依赖**。open-pptd 只 import Node 内置（`node:*`）与自己 vendored 的库
   （`packages/model/vendor/*.mjs`、`packages/vendor/echarts.mjs`），没有 `node_modules`
   依赖。因此**从任意绝对路径 `import()` 都不会触发依赖解析**——这正是 `contract.json`
   方案成立的前提，也是零依赖从"体积优点"升级为"架构资产"的原因。
2. **浏览器安全**。`open-pptd/model`、`open-pptd/renderer`、`open-pptd/writer` 的传递闭包内
   不含 `node:*` / 裸 `fs`（model / writer 另禁 DOM 全局；renderer 的 DOM 是其输出目标，
   允许 `window.` / `document.`）。`open-pptd/renderer` **不含** `packages/renderer/headless/`
   （无头截图是 Node 专用，浏览器端引入会把 Node 代码拉进页面）。
3. **根入口是 Node 专用**。`open-pptd` 再导出了 `server` / `cli`（依赖 `node:http` /
   `node:fs`），**不可在浏览器中 import**；浏览器侧只用 `open-pptd/model`、
   `open-pptd/renderer`、`open-pptd/writer`。
4. **依赖方向单一**：`editor/ → packages/`，`packages/` 永不 import `editor/`
   （`tests/regression/dep-graph.mjs` 规则 5 强制）。

### 1.4 深路径迁移映射

下游（尤其 `editor/`）把下表的左列换到右列；映射表由 `integration-plan.md` §3.3 定义。

| 现有深路径 | 目标入口 |
|---|---|
| `packages/model/{model,pptd-io,registry,theme,style-spec,validate,walk,preset-geometry*}.js` | `open-pptd/model` |
| `packages/model/icon-fa.js` → `open-pptd/model` 的 `icons` 命名空间 | `open-pptd/model` |
| `packages/model/font-registry.js` → `fonts` 命名空间 | `open-pptd/model` |
| `packages/model/bytes.js` → `bytes` 命名空间 | `open-pptd/model` |
| `packages/model/chart*.js` → `chart` 命名空间 | `open-pptd/model` |
| `packages/renderer/page.js` → `renderPage` / `autoGrowTexts` / `disposeChartInstances` | `open-pptd/renderer` |
| `packages/renderer/icon.js` → `iconThumb` | `open-pptd/renderer` |
| `packages/writer/pptx.js` → `buildPptx` / `downloadPptx` / `downloadBlob` | `open-pptd/writer` |
| `packages/writer/zip.js` → `ZipWriter`；`util.js` | `open-pptd/writer` |
| `packages/server/*` | `open-pptd/server` |
| `packages/cli/*` | `open-pptd/cli` |

### 1.5 弃用策略

- 未列入 §1.1 的子路径一律经 **`open-pptd/internal/*`**（映射到包内 `./*`）。
  **`./internal/*` 不保证稳定**：内部文件可随时改名、移动、删除，2.x 期间作为过渡通道
  仍可达，**3.0 移除**。
- 深路径（如 `packages/model/model.js`）在新代码中不得再出现；迁移完成后由 dep-graph 收口。
- 兼容性判据：**新增导出 / 新增子命令 = 兼容变更；改变既有导出名或子命令语义 = 破坏性变更**
  （升 `CONTRACT_VERSION` 与 semver major）。

### 1.6 自测

```sh
node tests/contract/public-api.mjs     # 契约 4：导出名/版本/exports↔contract.json 口径
node tests/regression/dep-graph.mjs    # 依赖方向与环境全局（含 barrel 不得 import editor/）
```

---

## 2. 契约 1：可挂载编辑器 `createEditor`（规划中，W1–W2 落地）

> 状态：**规划中**，签名如下（`integration-plan.md` 附录 D.2），本波次不实现。

```js
// open-pptd/editor
export function createEditor(rootEl, options);
```

| 参数 | 说明 |
|---|---|
| `rootEl` | `HTMLElement`，编辑器挂载点（取代现在的 `document` 全局） |
| `options.source` | **`ProjectSource`（契约 2）**，必填 |
| `options.deck` | 可选：`{ manifestText, pageFiles: Map<string,string> }` 初始文档；省略则由 `source.read()` 加载 |
| `options.theme` | 可选：`{ tokens?, mode? }`（契约 3） |
| `options.chrome` | 可选：`{ topbar?, brand?, github?, thumbbar?, quickbar?, zoom?, inspector? }` 或 `"full"` / `"embedded"` |
| `options.dialogs` | 可选：`{ alert(msg), confirm(msg) }` |
| `options.locale` | 可选：`"zh-CN"`（默认） |
| `options.on` | 可选：`ready / dirty / saved / error / deckChange / selectionChange` |

| 返回值 | 说明 |
|---|---|
| `ready: Promise<void>` | 首帧就绪 |
| `destroy(): void` | **幂等**；移除 DOM、解绑监听、关闭 `EventSource`、`disposeChartInstances`、清空 dom 缓存 |
| `api` | 现有 `EditorApi`（`select` / `updateSelected` / `deleteSelected` / `moveLayer` / `getPage`…） |
| `io` | 现有 io 面（`save` / `reload`…） |
| `state` / `view` / `controller` | 深度控制，**标注"不稳定"**，不属冻结契约 |

---

## 3. 契约 2：传输接缝 `ProjectSource`（规划中，W1–W2 落地）

> 状态：**规划中**，签名如下（`integration-plan.md` 附录 D.3）。

```js
/**
 * @typedef {object} ProjectSource
 * @property {{ writable: boolean, liveWatch: boolean, binary: boolean }} capabilities
 * @property {() => Promise<{ manifestText: string, pageFiles: Map<string,string>,
 *                            media?: Map<string, Uint8Array> }>} read
 * @property {(files: Array<{path:string, text?:string, bytes?:Uint8Array}>) => Promise<void>} write
 * @property {(path: string) => Promise<Uint8Array|null>} [readMedia]
 * @property {(cb: (evt: {kind:"deck"|"page"|"media", path:string}) => void) => (() => void)} [watch]
 */

export function httpSource({ base = "", deckUrl } = {});   // 现有 serve 的 fetch/SSE 模式；base 参数化
export function directoryHandleSource(handle);              // 浏览器 File System Access
export function memorySource({ files = {} } = {});          // 测试与嵌入
```

引擎只依赖这个鸭子类型接口；写路径归一到 `source.write()`，变更订阅走
`capabilities.liveWatch === false` 时回退轮询。

---

## 4. 契约 3：主题注入（规划中，W1–W2 落地）

> 状态：**规划中**，签名如下（`integration-plan.md` 附录 D.4）。引擎自备 light / dark
> 两套内置令牌值，下游不必自己猜暗色。

```js
// open-pptd/editor
export const TOKENS: string[];                                  // 引擎支持的令牌名（对标 tokens.css）
export function defaultTokens(mode: "light" | "dark"): Record<string,string>;
export function applyThemeTokens(
  rootEl: HTMLElement,
  opts: { tokens?: Record<string,string>, mode?: "light"|"dark" }
): () => void;                                                  // 返回还原函数
```

---

## 5. 契约 5：资源与配置解析 `paths` / `config`（规划中，W2 落地）

> 状态：**规划中**，签名如下（`integration-plan.md` 附录 D.1 的 `open-pptd/paths` /
> `open-pptd/config` 段，消费方式见附录 D.8）。规则：**读三级**（`$OPEN_PPTD_HOME` →
> `~/.open-pptd` → 包内 `assets`）**写一级**（永远写 `~/.open-pptd`）；
> `registry.json` 永远只读包内。

```js
// open-pptd/paths
export function openPptdHome(): string;          // OPEN_PPTD_HOME → os.homedir()/.open-pptd
export function ensureHome(): string;            // 幂等创建，返回 home
export const paths: {
  home, assets, fonts, icons, cli, cliCurrent, config, state, cache, tmp
};
export const resourceRoots: {
  fonts: string[];      // [home/assets/fonts, <pkg>/assets/fonts]
  icons: string[];      // [home/assets/icons, <pkg>/assets/icons]
  registry: string[];   // 【只有一根】[<pkg>/assets/{fonts,icons}]，永不含 home
};
export function resolveCliRoot(): string | null; // 供下游复用同一套引擎定位逻辑
export function contractRoot(): string;          // 含 contract.json 的包根

// open-pptd/config
export function readConfig(): { version: number; fontDir?: string; iconDir?: string;
                                exportTheme?: string; renderBrowser?: string; [k: string]: unknown };
export function writeConfig(patch: object): void; // 浅合并写回，保留未知键
```

下游**只消费 `paths`，不自己拼目录名字符串**（目录名归属由引擎独占）。

---

## 6. Host boot parameters (standalone entry `editor/main.js`)

The standalone page is also the **embedding boot path**: a same-origin host may inject the
boot parameters instead of forking the entry (added in v2.0.0, purely additive). Sources are
read in priority order — query string first, then `window.__PPTD_BOOT__` (set by an inline
script before `editor/main.js` executes). Every parameter is optional: with none of them
set, the boot path is byte-for-byte the standalone behavior (same requests, same DOM, same
`createEditor` arguments).

| Parameter | Query string | `window.__PPTD_BOOT__` | Semantics |
|---|---|---|---|
| base | `?base=%2Fpptd` | `base: "/pptd"` | Site prefix handed to `httpSource({ base })` (contract 2): save → `POST <base>/api/save`, live reload → `EventSource(<base>/events)`. Default `""` (root-absolute, the plain `open-pptd serve` behavior). |
| chrome | `?chrome=embedded` | `chrome: "embedded"` | Editor chrome preset forwarded to `createEditor` (contract 1). Only `"full"` / `"embedded"` are accepted; any other value is ignored with a `console.warn`. Default `"full"`. |
| theme | — | `theme: { tokens?, mode? }` | Host theme override (contract 3) forwarded as `createEditor`'s `options.theme`; a `mode` also switches off the built-in tri-state palette. |

Recommended embedding URL (document-relative, never root-absolute — the host document may
live on a custom scheme such as `dsh-app://app`):

```
pptd/editor/index.html?deck=<encodeURIComponent("project/" + relDeck)>&base=%2Fpptd&chrome=embedded
```

`deck` is resolved against the editor's own site root, so a host serving the engine under
the `/pptd/` prefix lands the project at `/pptd/project/...`, while `base=/pptd` routes the
write/watch channels to `/pptd/api/save` and `/pptd/events`.

### 6.1 postMessage protocol (same-origin embedding)

| Direction | Message | Semantics |
|---|---|---|
| iframe → host | `{ type: "pptd:ready" }` | Posted once to `window.parent` right after the editor is mounted, and only when actually embedded (`window.parent !== window`); the host answers with the theme payload. |
| host → iframe | `{ type: "pptd:theme", tokens: {...}, mode: "light" \| "dark" }` | Accepted only when `e.source === window.parent` and `e.origin === location.origin`; the hook restores the previous injection first, then applies `applyThemeTokens(document.documentElement, { tokens, mode })` (contract 3). |

`window.__pptdTheme = { apply(opts) → restore, reset() }` exposes the same implementation
for direct same-origin calls and tests.

A host maps its own design tokens to the engine `TOKENS` names (`editor/theme.js`), reads
them on `pptd:ready`, and re-sends on every light/dark switch; the injected theme wins over
the built-in palette until `reset()` (or a later injection) is called.
