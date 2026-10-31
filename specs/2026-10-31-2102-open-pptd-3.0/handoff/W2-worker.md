# W2 handoff · ProjectRuntime + ResourceProvider

> 分支 `feat/3.0-w2-runtime`，起点 `e77cb5f`；T1–T4 各一个 commit，本文件为第 5 个。
> 环境：Windows 10.0.28120 x64 + Git Bash + Node v24.21.0；零 npm 依赖、零构建。

## A. 自测真实输出

```text
# 开工基线
$ node tests/tools/dump-formula-mml.mjs      → KaTeX MathML 生成: 204/204
$ node tests/run-all.mjs                     → 结果: 26/26 通过 ✅
$ node tests/regression/dep-graph.mjs        → ✓ 依赖方向与环境全局检查通过
$ node tests/contract/public-api.mjs         → 结果: 契约通过 ✅

# 完工验收
$ node tests/runtime/run.mjs                 → runtime: 92/92 通过 ✅（exit 0）
$ node tests/run-all.mjs                     → 结果: 26/26 通过 ✅（exit 0，无回退）
$ node tests/regression/dep-graph.mjs
dep-graph: 扫描 194 个文件，726 处 import（含包级 barrel 9 个）；登记豁免 3 处
✓ 依赖方向与环境全局检查通过（exit 0）
$ node tests/contract/public-api.mjs         → 结果: 契约通过 ✅（exit 0）

# CLI 行为比对（与 W1 基线逐字一致）
$ node bin/open-pptd.js check tests/projects/table/deck.pptd
  ⚠ [geometry] 第2页 t1 元素内容撑高后与「t2」重叠（实际高 47 vs 声明 40）
  ⚠ [geometry] 第7页 t1 元素内容撑高后与「t2」重叠（实际高 47 vs 声明 40）

0 个错误，2 个警告
CHECK_EXIT: 0
$ node bin/open-pptd.js export tests/projects/chart/deck.pptd -o <tmp>
EXPORT_EXIT: 0；837227 bytes（基线 837227 一致；run-all 的 check-chart.pptx 同为 837227）
```

PPTX 连续两次导出 sha256 不同：zip DOS 时间戳 + `docProps/core.xml` created/modified + 内嵌 xlsx 时间戳（W1 同样）；验收按字节数 837227，已满足。
## B. 实现、偏差与审计

**新增 API**：`loadProject→ProjectFiles`、`parseProject→Deck`、`createProject→Project`、
`resolveProject→ResolvedProject`（theme/imageMap/iconMap/fontStatus + `missing:{fonts,icons,images}`、
`unsupported:[...]` 诊断）、`serializeProject({mode:"snapshot"|"raw"})→{files,manifestName}`、
`checkProject→{ok,errors,warnings,perPage}`。类型 JSDoc：`ProjectSource/ProjectFiles/SourceFile/
Project/ResolvedProject/FileBundle/ResourceProvider/FontRef`；纯内存 `memorySource`/`memoryProvider`。
错误：`RevisionConflictError`(`ERR_REVISION_CONFLICT`)、`ResourceMissingError`(`ERR_RESOURCE_MISSING`)、
`UnsupportedFormatError`(`ERR_UNSUPPORTED_FORMAT`) + 守卫 `assertRevision`/`requireResource`/
`assertImageFormat`/`decodeImageDataUrl`。
Node 适配：`server/runtime-node.js` 的 `createDiskProjectSource`（read/readSync/readMedia/原子 write+revision；
read 附带被引用图片 bytes）与 `createFsResourceProvider`（fontBytes/fontStatus/iconSvg/imageBytes +
`fileExists`/`fontRegistry`/`iconRegistry` 供校验注入）。
接线：`cli/export.js#loadProjectFiles` 委托 disk source `readSync()`（返回形状不变）；
`cli/check.js#checkDeck` 走 `createProject→checkProject`；命令面/退出码/人类输出零变化。

**与 spec 的偏差**：
1. `checkProject` 同步（interfaces.md 写 async）：既有 `checkDeck` 被 `tests/regression/validate.mjs` 同步调用，且纯逻辑无 IO；W3 ExportService `await` 即可。
2. `themeLibrary` 未实现/未接受（W6 ThemeStore）。
3. `loadProject` 额外允许无 source、直接接收现成 ProjectFiles；Project 额外保留 `manifestText/revision`。
4. `normalizeProjectFiles` 统一 media 为 Map 并补 `manifestName/baseDir`；`serializeProject(raw)` 源保留原文即可用（预期生产者磁盘源）。
5. `fileExists`/`fontRegistry`/`iconRegistry`/`project.fileExists` 是契约外环境事实扩展；ResourceProvider 必需方法保持 §3 原样。
6. Node provider 不联网：`fetchable` 仅表示 registry 有 url 但本地无字节（W6 下载后置）；图片仅 PNG/JPEG/GIF，WebP/SVG 返回 null 并进 `unsupported`。
7. CLI check/export 用同步 `readSync` 而非 async `loadProject`，以保持命令面与既有测试同步契约。

**探索审计（只读）**：model/{pptd-io,validate,font,font-registry,icon-fa,walk,theme,index,bytes}.js、
layout/index.js、packages/paths.js、cli/{bin,resource-status}.js（局部）、writer/{util,pptx#magicMatches}、
editor/app/project/{source,loader}.js（了解 duck type，未迁移）、tests/{run-all,regression/{dep-graph,handle-io}}.mjs、
tests/projects/{text,table,image,chart} 的 deck/pages。无全仓重读；未触碰主检出与其他 worktree。

**未决/后移**：runtime 未进 `contract.json`/`package.json` exports 与 run-all（lead 所有，W10 contract 3）；
editor loader W8；用户字体库/ThemeStore W6；ExportService 消费 `missing/unsupported` W3；
`export-project` 仍走旧图片收集路径（W3/W10 迁移 serialize raw）。

## C. 文件 / commit 指针

| commit | message |
|---|---|
| `c75c25d` | feat(runtime): 新增 ProjectRuntime 核心（load/parse/resolve/serialize/check + 内存 source/provider） |
| `1ecbdde` | feat(server): 新增 Node 磁盘 ProjectSource 与 fs/registry ResourceProvider |
| `b8a363b` | refactor(cli): 项目读取与 check 接入 ProjectRuntime，命令面与输出不变 |
| `4051a32` | test(runtime): 新增 runtime 自测（memory source/provider、序列化、check 对齐、错误码、磁盘项目） |
| （本文件） | docs(w2): 写 W2 交接 |

新增：`packages/runtime/{index,source,provider,parse,resolve,serialize,check,errors,paths}.js`、`packages/server/runtime-node.js`、`tests/runtime/run.mjs`。修改：仅 `packages/cli/{export,check}.js`。
禁触清单零 diff：`package.json`、`contract.json`、barrels、`tests/run-all.mjs`、`tests/regression/dep-graph.mjs`、`tests/contract/**`、renderer/writer/layout/measure、editor。
