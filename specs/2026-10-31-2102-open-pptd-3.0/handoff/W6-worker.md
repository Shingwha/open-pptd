# W6 handoff · 主题库 + 全局字体库（核心/API/CLI）
> 分支 `feat/3.0-w6-theme`，起点 `main c32e6da`；7 个实现/测试 commit + 本文件。Windows 10.0.28120 + Git Bash + Node v24.21.0；零依赖。
## A. 自测真实输出
```text
# 开工基线（main c32e6da）
$ node tests/tools/dump-formula-mml.mjs → 204/204
$ node tests/run-all.mjs → 31/31 ✅；runtime 92/92 ✅；export 56/56 ✅
$ table-facts/measure-consistency/type-manifest → 全部通过 ✅；dep-graph → ✓；contract → 契约通过 ✅
$ node tests/e2e/render.mjs → 9/9 ✅；golden-diff → 156/156 字节一致，0 未登记漂移 ✅
# 完工（真实输出）
$ node tests/regression/theme-library.mjs → 66/66 ✅；font-library.mjs → 56/56 ✅
$ node tests/run-all.mjs → 31/31 ✅；runtime → 92/92 ✅；export → 56/56 ✅
$ table-facts / measure-consistency / type-manifest → 全部通过 ✅；dep-graph → ✓；contract → 契约通过 ✅
$ node tests/e2e/render.mjs → 9/9 ✅（timeouts=0）
$ node tests/tools/golden-diff.mjs → 156/156 字节一致，0 未登记漂移 ✅
$ CLI export 字节：chart 837227 / text 141748 / table 250833（与 W5 基线一致，默认 deck 零变化）
# server API 冒烟（默认 store + 临时 OPEN_PPTD_HOME，loopback）
GET /api/themes {"builtin":11,"user":0}；POST/GET/DELETE theme 200；GET ?id=../../evil 404；
POST font 200；GET fonts {"builtin":27,"user":1,"system":0}；DELETE builtin:default 403；
body>1MB → 413 ERR_BODY_TOO_LARGE；坏 JSON → 400 ERR_INVALID_JSON。
# CLI assets 冒烟（临时 home）：themes import/export/list/delete、fonts import/list/remove 全 exit 0，JSON 单行。
# 用户字体导出 PPTX：MiSans 8073152B 导入临时用户库 → 子集化 10268B → ppt/fonts/font1.fntdata 存在，含 embeddedFontLst。
```

## B. 实现、API、偏差与审计
**纯核心（双端，无 node:/DOM）**
- `model/theme-library.js`：`BUILTIN_THEMES`（`builtin:default` + 10 palette 完整快照，深冻结）、`listBuiltinThemes`、
  `normalizeThemeFile`（version=1；坏颜色丢弃；缺样式块回退默认；空 colors/未知版本 `ERR_THEME_INVALID`）、
  `createThemeStore`（list/read/save/remove/import/export）、`applyTheme`、`collectThemeReferences`、`colorTokenUsage`、
  `listColorTokens`、`setColorToken`/`removeColorToken`。
- `applyTheme(current, themeFile, {deck})`：替换三块；扫描页面 `$token`（color/fill）与 `style`/`textStyle`；新主题缺失但
  deck 仍引用者从旧主题保留，未引用丢弃，样式内部 `$color` 也补保留；返回 `{theme, preserved:{colors,textStyles,tableStyles}}`
  （撤销=调用方保存旧快照）。
- `model/font-library.js`：`createFontLibrary`（list/read/importFile/importUrl/remove/resolve）、`safeFontFileName`、
  `FontLibraryError`；resolve 顺序 user → builtin → system → null；deck 只引用 family；系统字体只声明不嵌入。
- `paths.js`：新增 `themes/userFonts/userFontIndex`；`ensureHome` 纳入两目录；`atomicWriteFile(...,{tmpDir})` 支持注入 home。
**Node 适配 / API**
- `server/theme-store.js`：`~/.open-pptd/themes/<id>.json`，id 路径校验 + 原子写；损坏文件 list 跳过、read 抛 `ERR_THEME_STORE`。
- `server/font-library.js`：`~/.open-pptd/assets/fonts/user/*` + `index.json`（v1）；basename/唯一文件名；同 key 覆盖、
  同名文件自动改名；内置只读；URL 下载 60s/64MB 上限。
- `server/{themes,fonts}.js`：仅 loopback；body 上限 1MB/96MB；错误 JSON `{ok:false,error:{code,message}}`。错误码：
  `ERR_THEME_INVALID/ID/NOT_FOUND/BUILTIN_READONLY/STORE`、`ERR_FONT_INVALID/NOT_FOUND/BUILTIN_READONLY/FETCH/INDEX/STORE`、
  `ERR_BODY_TOO_LARGE/ERR_INVALID_JSON/ERR_METHOD/ERR_FORBIDDEN`。
- `server/index.js` 挂载 `GET/POST/PUT/DELETE /api/themes`、`GET/POST/DELETE /api/fonts`，纯增再导出 store/handler。
- `server/runtime-node.js`：provider `fontBytes/fontStatus` 用户库优先；`fontRegistry` getter 同步合并用户 index，使
  ExportService/checkProject 识别只写 family 的用户字体；仍不联网。
- `cli/assets.js`：`assets themes list|import|export|delete|apply`、`assets fonts list|import|remove`（JSON 单行）；
  `assets list` 增加主题/用户字体计数；旧 `assets sync/list/clean` 保留；`bin.js` 仅 usage 增两行。
**偏差/需 lead 知悉**
1. `cli/ensure.js` 预检仍只读内置 registry，用户字体导出显示“1 项缺失”软警告（实际已嵌入）；文件在红线外，W10 迁移。
2. `doctor` 计数未加（`cli/doctor.js` 不在写范围）；计数由 `assets list` + `assets themes/fonts list` + API 提供。
3. `assets themes apply` 为只读预览/报告（`-o` 输出结果主题 JSON），不重写 deck.pptd；写入由编辑器/W10 `build --theme`。
4. `normalizeThemeFile` 做“非法字段规范化”：缺省样式块回退 DEFAULT_THEME、坏颜色项丢弃；空 colors 非法。
5. `fontRegistry` getter 返回含用户条目的新合并对象（非原引用）；`builtin:default` 与 `builtin:consult` 颜色相同（按工单保留两条 id）。
6. 新测试未接入 `tests/run-all.mjs`（lead 所有）。
**探索审计（只读）**：specs 本组 repo-map/interfaces §3/§8/§9/theme-font/decisions D11–D15/W2/W5/工单；model/{theme,
theme-presets,font,font-registry,style-spec,walk,validate,index}、paths.js、server/{index,api,static,runtime-node}、
cli/{bin,assets,fonts,doctor,resource-status,ensure/export 局部}、export/pptx.js#preloadFonts、writer/font.js#loadFontBytes、
editor/interaction/theme-panel.js（语义参考）、tests/{run-all,contract,regression/{dep-graph,theme-presets,resource-paths},runtime,e2e}。
未全仓重读；未触碰主检出/其他 worktree。
**未决/后移**：W7 Design 面板（主题/字体/外观 + 浏览器 FontFace 读用户字节）；W10 删除旧 fonts/icons CLI、contract 3、
`build --theme`、ensure 预检接用户库；静态站用户库只读提示；主题样式可视化编辑器后移。
## C. 文件 / commit 指针

| commit | message |
|---|---|
| `4882fb9` | feat(model): 新增主题/字体库纯核心（ThemeStore、FontLibrary、applyTheme） |
| `ed16fba` | feat(paths): 增加主题与用户字体目录，原子写支持注入 tmpDir |
| `dab5b6a` | feat(server): 新增主题与全局字体库 Node 存储适配器 |
| `0d164db` | feat(server): 新增 /api/themes 与 /api/fonts，provider 优先解析用户字体 |
| `8ad5d02` | feat(cli): assets 增加 themes/fonts 子命令（保留 sync/clean） |
| `7bcee2a` | test(theme): 新增主题库与 applyTheme 回归（临时 home） |
| `325d4c9` | test(font): 新增全局字体库与 provider 回归（无真实字体字节） |
| （本文件） | docs(w6): 写 W6 交接 |

新增：`packages/model/{theme-library,font-library}.js`、`packages/server/{theme-store,font-library,themes,fonts}.js`、
`tests/regression/{theme-library,font-library}.mjs`。修改：`packages/model/index.js`（纯增）、`packages/paths.js`、
`packages/server/{index,runtime-node}.js`、`packages/cli/{assets,bin}.js`（bin 仅 usage）。禁触零 diff：
`editor/**`、`packages/{runtime,export,writer,layout,measure,renderer}/**`、`package.json`、`contract.json`、
`tests/run-all.mjs`、`tests/golden/**`、`tests/projects/**`、dep-graph。
