# Changelog

## 3.0.0（开发中）

破坏性接口收口：契约 3.0 + CLI 5 命令 + 最小编辑器 + skill 入主仓。零 npm 依赖、零构建保持不变；
不提供 2.x 兼容层（旧命令/旧公共 API/深路径/`./internal/*` 全部删除，旧 deck 数据仍可读）。

### 契约 3.0（CONTRACT_VERSION = 3）

- `contract.json.contractVersion = 3`；`exports` 新增 `./runtime`、`./export`，删除 `./internal/*`。
- 包根 `.` 只导出双端核心（model/renderer/writer/runtime/export/paths/config/measure/layout）；
  `server`/`cli` 仅通过子入口 `open-pptd/server`、`open-pptd/cli` 进入。
- `packages/cli/index.js` 改为 `runOpen/runBuild/runCheck/runAssets/runDoctor`；
  删除 `exportDeck/exportProject/renderDeck/runFonts/runIcons/runEnsure/runGallery`。
- renderer barrel 删除 `renderPage`/`autoGrowTexts`（只用 `layout` + `paintPage`）；
  editor 内部改用 `editor/app/paint-page.js` 的 `paintModelPage`。

### 运行时与导出服务

- 新增 ProjectRuntime：`loadProject` / `parseProject` / `createProject` / `resolveProject` /
  `serializeProject`（snapshot|raw）/ `checkProject`，统一 `ResourceProvider` 与
  `ERR_REVISION_CONFLICT` / `ERR_RESOURCE_MISSING` / `ERR_UNSUPPORTED_FORMAT` 错误。
- 新增 ExportService：`exportProject(project, options, env)` 统一 `check|pptx|png|bundle`，
  校验、字体/图标/媒体资源、进度与报告一个入口；CLI 与编辑器浏览器导出共用。
- PNG 双后端：headless Chrome（CDP）与浏览器 foreignObject/capture；DPR/scale 正确重绘，
  透明背景与逐元素审计保留。

### 类型与分片

- 新增 TypeManifest（`packages/model/types/`）：text/shape/line/image/icon/table/chart/group
  各一个 descriptor（schema/layoutKey/contentEditor），validate/layout/editor 从清单派生。
- renderer/writer 每类型分片 + `loadType(id)` 显式加载；主路径仍静态汇总，按类型拆包不再复制实现。

### 度量、布局与表格（行为变更）

- `packages/measure` 纯函数度量 + `packages/layout` LayoutTree（几何事实、overflow/重叠）
  收缩为唯一排版事实源；preview/PNG/PPTX 共用。
- 表格高度唯一事实 `totalHeight`：layout frame、renderer box、writer `a:ext cy` 三者一致，
  `a:tr h = rowHeights`，writer 不再自行调用 `measureTable`；rowSpan 额外高度平均补差。
- 文本不再因框小被裁剪（转为 `check` 几何告警）；表格行高由 min 语义改为精确值。
- 黄金基线一次性 rebaseline（24 项目 / 156 页），之后零漂移；新增 table-facts /
  measure-consistency 回归。

### 最小编辑器（breaking）

- 删除旧编辑 UI：属性面板、右键菜单、组合、对齐/分布、内部剪贴板、批量页面操作、
  字体/主题侧栏、图标编辑器、形状/线条/图片/菜单类型编辑器；DOM/CSS/状态/API 同步收窄。
- 保留并重做：文字/表格/图表内容编辑器（按需动态加载）；拖动缩放、多选（Ctrl/Shift/框选）、
  对齐参考线；页面插入/删除/拖拽排序（至少保留 1 页，全部可撤销）。
- 新增 Design 面板（懒加载）：主题库应用/保存/导入/导出/删除、颜色令牌编辑、
  字体库搜索/预览/本地或 URL 导入/删除、深浅色外观。
- 单壳 `createPreview` / `createEditor`：`?deck=` 编辑器、`?blank=1` 空白、`?shot=1` headless、
  Home 画廊卡片走同一预览管线；`destroy` 幂等，无模块级 DOM/状态单例。

### 主题库与字体库

- 内置 `builtin:default` + 10 个完整主题快照；用户主题库 `~/.open-pptd/themes`（import/export/delete）。
- `applyTheme` 替换 colors/textStyles/tableStyles，并保留 deck 仍引用的旧 token；`--dry-run` 可预览。
- 用户字体库 `~/.open-pptd/assets/fonts/user`：本地/URL 导入、删除、元数据索引；内置库只读。
- CLI `assets themes|fonts` 与编辑器 Design 面板共用同一套 store/API。

### 保存与导出接线

- Revision 冲突检测 + 原子批量保存（同目录 tmp→rename、manifest 最后、失败回滚）；
  `/api/save` 409 返回当前 revision；HTTP/handle/memory 三通道同一 revision 域。
- 编辑器 PPTX/bundle/PNG 全部改走 ExportService（浏览器 ResourceProvider），不再直调 writer。
- `build` 前统一 full `checkProject`；`check` 只读；字体下载只走 `build --fetch` / `assets sync`。

### CLI（5 命令，无别名/shim）

`open / build / check / assets / doctor`。人类文本走 stderr；`--json` 时 stdout 只有一行；
退出码 1 = 错误或严格失败；`config.autoFetch` 不再被读取（下载只走 `build --fetch` / `assets sync`）。

- `open`：Home/`<dir>` 自动识别唯一 `.pptd`（缺失/多个 fail-fast）、`--blank`、`--detach`、
  `--json`、`--stop`（`--all`）；实例表 `~/.open-pptd/state/instances.json`，`--stop` 先
  `/api/ping` + pid 存活校验，不误杀。
- `build`：`--format pptx|png|bundle`（默认 pptx）；全部先跑 full `checkProject`
  （error 阻断 / warning 软 / `--strict` 阻断）；`--fetch|--offline` 互斥且默认不下载；
  `pptx --theme <id>`（ThemeStore 快照，不改项目）、`--no-embed-fonts`、`--full-fonts`；
  `png --page/--scale/--browser/--timeout`（无浏览器 `ERR_RENDER_BACKEND`）；
  `bundle [--raw]`（默认模型快照）。
- `check`：只读；`--json`（errors/warnings/perPage/resources/summary）；`--strict` warning 也失败；
  吸收旧 `fonts check` 的资源摘要，不下载。
- `assets`：保留 `list/sync/clean` 并补 JSON/错误；`themes apply <id> <deck.pptd> [--dry-run]`
  原子写 deck.theme（替换 + 保留引用项）；`fonts import/remove` 支持本地/URL。
- `doctor`：吸收 `paths`（全部路径/配置/库计数），加 Chrome/Edge PNG 能力；关键失败 exit 1。

### Skill 入主仓

- 内容面回到主仓 `skill/`：`SKILL.md` + `references/`（7 篇）+ `kits/`（academic、business-review、
  consulting-report、brand-proposal、lecture、poster 共 6 套，含真实 `.page` fragments）。
- 原独立 `open-pptd-skill` 仓库归档；`npm run test:skill` 对 SKILL/refs/kits 做 lint 与逐 kit
  `check` + `build` 回归，并校验 release skill zip 的条目与 SHA256。
- 发布产物新增 `open-pptd-skill-v<版本>.zip`（顶层 `open-pptd/`，不含测试/媒体/脚本）；
  `package.json.files` 不包含 `skill/`，CLI 运行时包保持干净。

### 文档与发布

- `docs/` 收敛为 `release-workflow.md` + `images/`：删除 `embedding.md`、`image-generation.md`
  （内容已迁 `skill/references/images.md`）及全部引用；README/README.zh-CN 重写为 3.0。
- 新增 `npm run test:docs`：docs 目录白名单、全仓无已删文档/DSH 引用、README 5 命令与 skill
  安装口径、release-workflow 资产清单、版本一致性。
- `package.json.version` 升到 `3.0.0`；`npm run pack` 产 runtime + skill + icons/fonts（本机有本体时）
  + install 脚本 + `SHA256SUMS`。

### 迁移（2.x → 3.0）

| 2.x | 3.0 |
|---|---|
| `serve` | `open` |
| `export` | `build --format pptx` |
| `export-project` | `build --format bundle`（`--raw` 原样文件） |
| `render` | `build --format png` |
| `ensure` | `check`（只读）/ `build --fetch`（显式下载字体） |
| `paths` | `doctor` |
| `gallery scan` | `open`（Home）/ `node scripts/gen-gallery-manifest.mjs`（发布） |
| `fonts …` / `icons …` | `assets fonts …` / `assets sync` |

旧命令执行时退出 1 并打印迁移提示；旧 deck 数据仍可读（不做自动升级）。

## 2.0.0（2026-09-29）

引擎接口化 + 渲染管线三段式重构 + 技能拆分。零 npm 依赖、零构建的纪律保持不变。

### 引擎接口化（契约 4，CONTRACT_VERSION = 2）

- 新增包级 barrel：`open-pptd/{model,renderer,writer,server,cli,editor,paths,config}` 与包根 `.`；`exports` map 与机器可读 `contract.json` 双口径，由契约测试（`tests/contract/public-api.mjs`）断言一致。
- editor 对 `packages/` 的 89 处深路径全部迁移到包级入口；dep-graph 新增规则：editor 禁止深路径、barrel 禁止 import editor。
- 旧深路径经 `./internal/*` 仍可达（2.x 兼容，3.0 移除）。

### 可挂载编辑器与传输接缝

- `createEditor(rootEl, options) → { ready, destroy, api, io, state, view }`：可挂载、可销毁（幂等）、`chrome` 三档（full/minimal/shot）、dialogs 可注入（12 处宿主敌意调用清零）。
- `ProjectSource` 传输契约 + `httpSource`/`directoryHandleSource`/`memorySource`/`delegatingSource` 四实现；`saver`/`live-reload` 不再硬编码 `/api/save`、`/events`。
- 主题注入：`applyThemeTokens`/`defaultTokens(light|dark)`，内置 dark 板 + 8 处硬编码色清零。

### 资源外置与 CLI 产品化

- `~/.open-pptd`（`OPEN_PPTD_HOME` 可覆盖）：读三级（env → home → 包内）、写一级；`registry.json` 永远只读包内；下载原子落地（tmp → rename）。
- 新命令：`doctor` / `paths` / `assets list|sync|clean` / `ensure`；`serve --detach --json --stop --open`（stdout 单行 JSON）；`export` 前置资源体检（`--offline`/`--strict`/`--json`，缺字体软降级不阻断）。
- 仓库根新增 `install.ps1` / `install.sh`（raw URL 一键安装，SHA256 校验、幂等、干跑模式）；pack-release 产五类发布资产 + SHA256SUMS。

### 技能拆分（breaking）

- `SKILL.md` + `references/` 迁出为独立纯文本技能仓 **open-pptd-skill**；本仓不再含内容面。
- 技能自检引导：`open-pptd doctor` → 缺则给一键安装命令；预览统一 `serve --detach --json`。

### 编辑器 UI（布局保持原版观感，能力增强）

- 选择模型集合化：多选 / 框选 / Shift 加选 / Ctrl 切换 / Ctrl+A / Esc 分层 / Ctrl+拖动复制；键位重映射（Shift→多选，Alt→微调/等比/复制拖动）。
- 对齐二义化（单选对页面、多选对选区）+ 分布 + 组合（group 类型）。
- 右键上下文菜单（三态）、缩略条升级（拖排序可撤销 / 页面多选 / 右键菜单）、内部剪贴板 Ctrl+C/V、`]`/`[` 置顶置底、层序方向修正。
- 深浅色三态（浅 / 深 / 跟随系统，入口在配色面板）；多选属性「混合」占位。
- 组件原语层（`editor/components/`）+ CSS 18→8 收敛（无加载顺序依赖）；令牌体系重建，**值保持原版观感**（圆角 6/8/12px、轻投影）。

### 渲染管线三段式（resolve → layout → paint）

- 新增 `packages/measure`（字体度量表驱动的纯函数排版度量，DOM 对拍 P95 误差 6%）与 `packages/layout`（LayoutTree：几何事实 + overflow/重叠检测）。
- `paintPage(layoutPage)` 消费 LayoutTree；测量写回删除（autoGrowTexts 双拷贝清零）；`validate` 越界检查改读 overflow 事实（启发式删除）。
- writer 表格行高/行距与 measure 单源对齐；**行为变更**：文本不再因框小被裁剪（配 `check` 几何告警）、表格行高从 min 语义变精确值。
- headless 就绪协议改 `Runtime.addBinding`（删除 title 轮询）；图片导出统一：capture 优先 + foreignObject 逐元素体检回退（消灭静默白图）。
- 编辑器几何单源：选中框/框选命中读 LayoutTree（文本取 declared、表格取 frame），domMeasure 精修接线，dirty 判定不再被测量污染。
- 黄金基线（24 项目 / 156 页）+ 白名单机制守门。

### 兼容与升级

- 深路径消费者请迁移到包级入口；内容面请改用 open-pptd-skill 仓。
- 旧仓库布局零迁移可用（包内资源只读回退）；`fonts download` / `icons download` 保留为兼容别名。
