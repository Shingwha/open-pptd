# W6 · 主题库 + 全局字体库（核心/API/CLI）

> 分支/前置：W2 已合并；可与 W4/W5 按文件所有权并行（theme/font vs type/table）；若共享 barrel/package exports 冲突则串行。写入范围 `packages/model/theme*`、`packages/model/font*`、`packages/paths.js`、`packages/server/{api,themes,fonts}.js`、`packages/cli/assets.js`、`tests/regression/{theme-library,font-library}.mjs`（barrel/package 由 lead）。
> 本波只做库核心/存储/API/CLI；Design 面板 UI 在 W7。

## 目标

- ThemeStore：内置 10 套完整主题（默认 styles + palette colors）+ 用户主题 `~/.open-pptd/themes/*.json`；list/read/save/import/export/delete。
- applyTheme：替换 colors/textStyles/tableStyles；扫描 deck 引用，保留被引用但主题缺少的 token/style；未引用丢弃；报告 preserved；可撤销。
- 自定义颜色 token：任意 key；添加/编辑/删除；usage 统计/删除警告；颜色选择器读取全部 token。
- FontLibrary：内置 registry + 用户字体 home；import local/URL 复制字节+元数据；list/remove/resolve；deck.fonts 只引用 family。
- Server `/api/themes` + `/api/fonts`；CLI `assets themes/fonts`；doctor 计数；静态站内置只读。
- 删除 per-deck fontLibrary/per-font embed/subset chips 的**数据层**（UI 在 W7）；字体嵌入全局设置。

## 范围

- model/theme 结构、内置主题生成、applyTheme/refs 扫描；theme store adapter。
- model/font-library/user index；ResourceProvider font 解析接入；deck.fonts 引用。
- paths themes/user fonts；server API（loopback/路径校验/原子写）；cli assets themes/fonts。
- 测试：主题应用/导入导出/自定义 token；字体导入/删除/跨端字节；缺失/系统状态；embedding 设置。

## 非目标

- 不做 Design 面板 UI（W7）。
- 不做主题 textStyles/tableStyles 可视化编辑器（后移）。
- 不做项目包携带字体。
- 不做 IndexedDB/静态站用户库。
- 不改 CLI 5 命令面（W10）。

## 验收

1. 全量回归 + dep-graph/contract 绿。
2. ThemeStore：内置只读；用户保存/导入/导出/删除；非法 JSON/重复 id 处理。
3. applyTheme：替换 + 保留被引用 token/style；未引用丢弃；preserved 报告；undo。
4. 自定义颜色：添加/编辑/删除；被引用阻止/警告；颜色选择器可见（数据层测试）。
5. FontLibrary：本地/URL 导入、list/remove、deck refs、浏览器/CLI 字节一致；系统/缺失；全局 embed/subset。
6. server/cli 新命令有 JSON/错误；旧 fonts/icons 仍暂由 W10 删除。
7. 写入范围外零 diff；无新增依赖。

## 前置上下文

- 必读顺序：`ref/repo-map.md` → `ref/interfaces.md` §3/§8/§9 → `ref/theme-font.md`（全文，尤其 §2–§6、§8）→ `ref/decisions.md` D11–D15 → `handoff/W2-worker.md` → `handoff/W5-worker.md` → 本工单。
- 基线命令（开工先跑，贴真实输出）：`node tests/tools/dump-formula-mml.mjs`；`node tests/run-all.mjs` → 31/31；`node tests/runtime/run.mjs`；`node tests/export/run.mjs`；`node tests/regression/{table-facts,measure-consistency,type-manifest}.mjs`；dep-graph；contract；`tests/e2e/render.mjs`。
- 稳定区（勿重读/勿改）：`packages/{runtime,export,writer,layout,measure}/**`、`packages/renderer/**`、`editor/**`（Design 面板 W7）、`tests/golden/**`、`tests/projects/**`、`tests/run-all.mjs`（lead 接入）。
- 现有事实（lead 已核实）：
  - `packages/model/theme.js` 有 normalizeTheme/resolveTheme/resolveTextStyle/resolveTableStyle/cellTextStyle；`theme-presets.js` 有 DEFAULT_THEME + THEME_PALETTES（10 套颜色）；`paths.js` 有 home/assets/fonts 路径；`assets/fonts/registry.json` 是内置字体 registry（字节不入 git）。
  - `packages/server/index.js` 已有静态服务 + `/api/save` + `/events` + `/api/export-image`；路由集中在 index.js。
  - `packages/cli/assets.js` 现仅内置资产 sync；`bin.js` 负责命令分发。
  - W5 已把表格度量改为样式感知，主题改动会影响渲染；本波不得改变既有 deck 的默认渲染（不应用新主题时）。
- 已知坑：字体字节约 155MB 不入 git，home 字体可能不存在；测试必须在无用户库/无字体字节环境下可跑（用临时 home 目录注入）；server API 只允许 loopback + 路径校验 + 原子写；零新增依赖。

## 本波实施口径（lead 已拍板）

1. **分层**：
   - 纯核心放 `packages/model/theme-library.js` 与 `packages/model/font-library.js`：内置主题快照生成、主题 JSON 校验、`applyTheme`、引用扫描/usage、`createThemeStore(adapter)`/`createFontLibrary(adapter)` 工厂（adapter 注入读写，纯逻辑无 node:/DOM）。
   - Node 存储适配器放 `packages/server/{theme-store.js,font-library.js}`（home 路径、原子写、索引）；`packages/paths.js` 增加 `themes`、`userFonts`、`userFontIndex`。
   - server API 放 `packages/server/{themes,fonts}.js` 并由 `packages/server/index.js` 挂载；CLI `assets themes/fonts` 在 `packages/cli/assets.js` + `bin.js` 分发。
2. **内置主题**：默认主题 + 10 个 palette 展开为**完整快照**（colors 用 palette，textStyles/tableStyles 用 DEFAULT_THEME）；id 稳定（如 `builtin:default`、`builtin:<paletteKey>`），`builtin:true` 只读。用户主题 `~/.open-pptd/themes/<id>.json`，`version:1`。
3. **applyTheme**：`applyTheme(currentTheme, themeFile, { deck } = {}) → { theme, preserved:{colors,textStyles,tableStyles} }`；替换三块；扫描 deck 的 `$token`、`style`/`textStyle`/table `style` 引用；新主题缺失但被引用的项从旧主题保留；未引用旧项丢弃；无 deck 时只做纯替换。另提供 `colorTokenUsage(deck, token)`/`listColorTokens(theme)` 纯函数；自定义 token 任意 key。
4. **FontLibrary**：`list/read/importFile/importUrl/remove/resolve`；用户字体 `~/.open-pptd/assets/fonts/user/` + `index.json`（family/key/file/source/license/size/subset）；`deck.fonts` 只引用 family；resolve 顺序 user → builtin registry → system → missing（system 只声明不嵌入）。Node provider `createFsResourceProvider` 的 `fontBytes/fontStatus` 接入用户库（全局可复用）。
5. **嵌入设置**：保持全局 `embedFonts/fullFonts`；不做 per-font chip；ExportService 已消费 provider，本波只验证用户库字节能进 PPTX。
6. **server API**（仅 loopback，路径 traversal 校验，body 上限，原子写）：
   - `GET /api/themes`（list）、`POST /api/themes`（save/import）、`DELETE /api/themes?id=`；
   - `GET /api/fonts`（list）、`POST /api/fonts`（base64 或 url 导入）、`DELETE /api/fonts?key=`；
   - 错误 JSON `{ok:false,error:{code,message}}`；code 用 `ERR_*`。
7. **CLI assets**：`assets themes list|import|export|delete|apply`、`assets fonts list|import|remove`；保留旧 `assets sync` 行为；JSON 单行。命令面最终由 W10 收敛。
8. **barrel/分支例外**：为让 W7 通过包级入口消费，允许最小改动 `packages/model/index.js`（导出 theme/font library 公共名）与 `packages/server/index.js`（挂载路由、导出 store）；`packages/cli/bin.js`（分发）。这三处只加导出/挂载，不改既有行为；diff 必须在报告中单列。`contract.json`/`package.json`/`tests/run-all.mjs` 仍由 lead 改。
9. **测试**：`tests/regression/theme-library.mjs`、`font-library.mjs`（自跑，临时 home，不依赖真实字体字节）；覆盖 builtin 只读/用户 CRUD/非法 JSON/重复 id、apply preserved/丢弃/undo 数据层、usage、字体导入删除/resolve/跨端 bytes/deck refs、缺失/系统状态、全局 embed 设置。不得改变默认 deck 渲染（golden 不得变化）。
10. **预检与导出验收（2026-11-01 修正）**：
    - `packages/cli/ensure.js` 的字体预检必须使用“用户库 + 内置 registry”的合并视图，与 `packages/server/runtime-node.js` 的 fontRegistry 同源；用户库字体不得被报 missing。CLI `check` 同样接受用户库字体。
    - 导出验收**不要求 PPTX 字节一致/字节数固定**（zip 时间戳非确定）；改为 exit 0 + package-integrity + 包内引用完整 + 用户字体场景断言 `ppt/fonts/*.fntdata` 与 `embeddedFontLst` 存在 + 无缺失警告。详见 `ref/testing.md` §10.1。
