# W3a-A handoff · 生产代码去重 / 删除死代码

> 分支 `feat/3.1-w3a-prod`，起点 `main 7393b31`；Windows 10.0.28120 + Git Bash + Node v24.21.0；零新增依赖。
> 写入范围：`git diff --name-only 7393b31..HEAD` 22 文件（含新增 `packages/server/http-util.js` 与本文件），全部命中 A 组白名单；tests/golden/projects/contract.json/package.json/run-all/skill 零 diff。

## A. 自测真实输出
```text
基线（7393b31）与完工最终代码各跑一遍，结果一致：
dump-formula 204/204 | run-all 39/39 ✅ | dep-graph ✓ | contract ✓ | golden 156/156 字节一致、0 漂移
editor-minimal 21/21 | page-ops 17/17 | editor-ops 22/22 | preview-shell 23/23 | incremental-load 5/5
save-atomic 19/19 | theme-library 66/66 | font-library 63/63 | browser-export 15/15 | skill/zip 10/10
# 行为对照
browser-export：PPTX 18227 B（W9 基线同值）；bundle ["deck.pptd","pages/1.page","pages/2.page"]；PNG zip 105931 B/2 张；
  foreignObject 1920×1080 colorType 6；capture 17726/12051 B（与 W9 记录逐项一致）
save-atomic：409 ERR_REVISION_CONFLICT+currentRevision、409 不写盘、成功返回新 revision、批量失败回滚无 .tmp
runtime-node 写盘冒烟：text/bytes 逐字节一致；stale revision → ERR_REVISION_CONFLICT；无 .tmp/.part；冲突后文件未变
CLI：check --json stdout=1 行 exit 0；build chart --format pptx → 837227 B（W10 基线同值）
server API（mock req/res + 隔离 OPEN_PPTD_HOME）：themes GET 200/{builtin:11}、POST{} 400 ERR_THEME_INVALID、
  PATCH 405+Allow、non-loopback 403、超大 body 413 ERR_BODY_TOO_LARGE（消息逐字不变）；fonts GET 200/{builtin:27}、
  POST{} 400 ERR_FONT_INVALID、DELETE 缺失 404 ERR_FONT_NOT_FOUND、non-loopback 403
pack-release --only skill：82 文件、SKILL.md/7 refs/17 fragments、SHA256SUMS 匹配（skill/zip 10/10）
```

## B. 删除 / 合并 / 跳过
**A 零引用删除（每项删前全仓 `git grep` 含 tests/e2e/skill/字符串均 0 命中，删后复 grep 仍 0）**
- `paths.cleanTempParts`、`writer/font.skipReasonText`、`font-manager.registerRegistryFontFace`
- `icons.getIconRegistrySync`（连带只写变量 registrySync）、`icons.queryIconEntries`
- `components/button.{iconButton,buttonRow}`、`types/index.contentEditorTypeIds`
- `fields.{fieldHandlers,renderGroup}` 及删除后零消费者的私有链 `renderFields/renderFullField`、`ui` import
- 未用 import：`cli/project.js readFileSync`、`design-panel.js colorTokenUsage`；复扫 23 个白名单文件无其它未用 import
- 证据（HEAD 复 grep 计数）：上述 13 个符号 + registrySync 全部 0；design-panel colorTokenUsage 0、cli/project readFileSync 0
**B 安全合并（语义/错误码/输出不变）**
- `revisionOfSourceFiles`：source.js 加 `export` 作唯一实现，saver 删除逐字副本并 import（函数体逐字未动）。
- 字节格式化：export-image.js 新增 `formatBytes(n,{kbDigits})`；saver/design-panel 默认 0（原 `Math.round`），
  export-image 传 1（原 `toFixed(1)` KB），三处文案逐字不变。saver 四处 chip 构造抽 `makeChip`（DOM/单击行为一一对应）。
- 新增 `server/http-util.js`（isLoopback/sendJson/sendError/readJsonBody/readBody）：themes/fonts 删除逐字副本；
  api/export-image 复用 sendJson（api 的 extraHeaders 保留），readBody 参数化：api `{64MB,status:413}`、
  export-image `{256MB}`（保持原 catch→500）；超限消息公式与上限不变。
- `runtime-node.writeAtomic` → `paths.atomicWriteFile(...,{tmpDir:dirname(abs)})`：仍同目录 tmp+rename（成功路径字节/位置不变），
  增加随机后缀与 5 次重试。`cli/project.loadProjectFiles` 改用 `readSync().manifestObj`（additive 字段），删除二次 `yaml.load`。
- `pack-release` 复用 `writer/zip.js` 导出的 `dosDateTime`（1980 钳制合并进唯一实现；`new Date()` 输出不变）。
- `dialogs/base.button` 复用 components/button（`btn btn-sm`、`preventDefault:false`、清默认 title，DOM 与旧实现等价）；
  `design-panel.download` 复用 `writer.downloadBlob`（同 MIME，revoke 5000→1000ms 仅内部时序），`formatSize` 复用 `formatBytes`；
  `export-service.iconSvg` 复用 `icons.ensureIcon`（normalize 结果一致；browser-export PPTX 18227 B 同基线）。
- **跳过**：`cli/check.checkDeck` 复用 `prepareProject`——checkDeck 是同步入口（tests/runtime、regression/validate 同步调用），
  prepareProject 为 async 且多读 media，形状不允许；保持原实现。
- 非合同导出变化（contract 仍通过）：删 `paths.cleanTempParts`；`writer/zip.js` 新增 `dosDateTime`（writer barrel 未再导出）。

## C. 文件 / commit 指针
| commit | message |
|---|---|
| `0711e27` | refactor(cleanup): 删除零引用导出与未用 import |
| `cfa3770` | refactor(editor): 合并 revision/字节格式化/chip/按钮/下载与图标解析重复逻辑 |
| `5c9ee35` | refactor(server): 抽出 http-util 并复用路径层原子写 |
| `f4cc559` | refactor(cli): 复用 runtime 已解析的 manifest，去掉二次 yaml.load |
| `2901bf4` | refactor(scripts): pack-release 复用 writer/zip 的 dosDateTime |
| （本文件） | docs(w3a): 写 W3a-A 交接 |

新增：`packages/server/http-util.js`；修改：`packages/{paths.js,writer/{font,zip}.js,server/{api,export-image,fonts,themes,runtime-node}.js,cli/project.js}`、
`scripts/pack-release.mjs`、`editor/app/project/{source,saver,export-service,icons,font-manager}.js`、`editor/app/export-image.js`、
`editor/interaction/{design-panel,dialogs/base}.js`、`editor/components/button.js`、`editor/interaction/fields.js`、`editor/types/index.js`。

**探索审计（只读）**：spec 03 工单、ref/repo-map、handoff/W1/W2、3.0 handoff/W9/W10；packages 的 paths/writer{font,zip,index,icon}、
server{api,export-image,fonts,themes,runtime-node,index}、cli{project,check,build,resources}、model{icon-fa,theme-library,font-library}；
editor/app/project/*、interaction{design-panel,dialogs/base,fields}、components/button、types/index、ui；scripts/pack-release.mjs；
tests（contract/save-atomic/theme/font/browser-export/skill/runtime 相关）。未全仓重读；未触碰主检出与其他 worktree。

**未决/偏差**：① sendJson 对 api/export-image 多了 `writableEnded` 早退（themes/fonts 原有；仅重复发送边界）；
② readSync() 返回新增 manifestObj（内部 Node 适配器 additive，loadProjectFiles 对外仍 4 键）；
③ 删除比工单多两处私有死函数（renderFields/renderFullField）；④ tests/lib/unzip 仍不支持 deflate（B 组范围）。
