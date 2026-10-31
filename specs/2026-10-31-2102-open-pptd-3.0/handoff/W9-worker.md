# W9 handoff · 原子保存 / 冲突 / 浏览器导出 / PNG 双后端
> 分支 `feat/3.0-w9-save`，起点 `main 6733f98`（W1–W8 已合并）；Windows 10.0.28120 + Git Bash + Node v24.21.0；零新增依赖。
> 写入范围仅工单白名单：`git diff --stat 6733f98..HEAD` 17 个文件（含本文件）；未触碰 CLI 命令面/包入口/barrel/contract/run-all/golden/projects/measure/layout/model/writer 行为。
## A. 自测真实输出
```text
# 开工基线（6733f98）
dump-formula 204/204 | run-all 34/34 | editor-minimal 21/21 | preview-shell 23/23
render 9/9 | dep-graph ✓ | contract ✓ | golden-diff 156/156 字节一致
# 完工（最终代码）
dump-formula 204/204 | run-all 34/34 | editor-minimal 21/21 | preview-shell 23/23
page-ops 17/17 | incremental 5/5 | render 9/9（timeouts=0）
dep-graph ✓（230 文件/791 import）| contract ✓ | golden-diff 156/156 字节一致，0 漂移
runtime 92/92 | tests/export 56/56
# W9 新增
save-atomic 19/19 | image-alpha 5/5 | parity-png 22/22 | browser-export 15/15
# 关键实测
save-atomic：409 code=ERR_REVISION_CONFLICT 且 currentRevision 匹配、409 不写盘；成功返回新 revision；
  批量 rename 失败 → 500、已写页/manifest 回滚、无 .tmp 残留；memory/local 冲突与成功 revision 更新。
image-alpha：输入 PNG IHDR colorType=6（70 B）；PPTX 包内 ppt/media/image1.png 与输入逐字节相等（70 B）。
parity-png：scale1/2/3 尺寸 960×540、1920×1080、2880×1620；图表区非白比 p1 0.2819/0.2752/0.2676；
  清晰度（CSS 像素归一）p1 1.917→2.084→2.154，p2 0.787→0.970→1.050。
browser-export（Chrome+真下载）：revision rev-277…→rev-8fd…；外部改盘后弹窗含覆盖/重新加载/取消，覆盖保存写回
  编辑器版本；PPTX 18227 B 且 package-integrity 通过；bundle ["deck.pptd","pages/1.page","pages/2.page"]；
  foreignObject PNG zip 2 张 1920×1080 colorType=6；capture 路径 source=capture、1920×1080（17726/12051 B）。
```
## B. 实现、删除、偏差与审计
**P1 revision + 原子保存**：新增 `packages/runtime/revision.js`（纯 JS 双通道 FNV-1a + 长度前缀，输出
`rev-<totalBytes>-<h1><h2>`；排序+字段定界，Map/普通对象同结果），runtime index 导出 `projectRevision`。HTTP/handle
revision 域 = manifest+页文本（两端一致）；memory 额外含 media。`source.read()` 返回 `revision`；
`write(files,{expectedRevision})` 不匹配抛 `RevisionConflictError`（code `ERR_REVISION_CONFLICT`，含 currentRevision）。
`/api/save`：全量路径校验 → 读盘算当前 revision → 409 JSON `{ok:false,error:{code,currentRevision,...}}` → 备份 →
逐文件同目录 tmp→rename（manifest 最后）→ 失败恢复备份/删除新建/清理 tmp → 500；成功 `{ok:true,count,revision}`。
`handle-io.writeFiles` 批量备份+失败回滚（含失败文件）；local handle 写前同一 revision 域校验。saver 传
`state.revision`，409 弹覆盖/重新加载/取消；覆盖不带 expectedRevision 重写，成功 `commitBaseline`+更新 revision/dirty。
loader/applyDeck 保存 revision。
**P2 浏览器导出**：新增 `editor/app/project/export-service.js`（浏览器 ResourceProvider：字体库→内置 registry→system；
图标预载/registry；图片 editing-session media；`createDownloadSink` downloadBlob/downloadPptx；项目快照含
dataURL→media 重写与字体表镜像，导出不改 live deck）。`saver.js` 删除 buildPptx/ZipWriter/preflight 直调，
PPTX/bundle/PNG 全走 adapter；部署模式“保存降级下载”也改走 bundle。`editor/app/export-image.js` 只保留 UI toast 与
元素审计提示。新增 e2e `tests/e2e/browser-export.mjs`（真 Chrome+真下载+package-integrity）。
**P3 PNG 双后端+alpha**：新增 `editor/app/render-backend-browser.js`：foreignObject backend（prepare 等字体、paint
离屏渲染+资源内嵌+逐元素审计、canvas 不填背景、pixelRatio=scale）与 capture backend（一次 POST
`/api/export-image` 按页返回）。`packages/export/png.js` 最小修复：页列表先归一化并把 `pages` 传给 factory
（capture 批处理需要；headless 忽略），校验 backend 页数。server `/api/export-image` 改为 ExportService(format=png)
+headless backend，保留 GET 探测、请求体、Origin/路径校验、`{ok,scale,pngs}` 与临时目录清理。透明 alpha：PPTX 媒体
写原始字节（不压平）；foreignObject PNG 为 RGBA colorType 6；新增 `image-alpha.mjs`、`parity-png.mjs`（无 Chrome
SKIP+exit 0）。
**删除/去重证据**：`grep -rn "buildPptx|new ZipWriter" editor` 仅剩 `export-service.js` PNG 打包一处；
`grep -rn "/api/export-image|/api/save" editor` 仅 source.js 保存与 render-backend-browser.js capture 各一处；
saver/export-image 无 zip/preflight/report 重复路径。
**偏差（需 lead 知悉）**：① 未做新的“统一导出对话框”：入口在 `toolbar.js`（白名单外），保留现有 PPTX 对话框
（嵌入/子集完整）+ PNG 对话框（页/scale/打包）+ 项目包直达，三者共用 adapter。② PNG（浏览器与 server）用
`check:false` 保持“可导出草稿”的旧行为；PPTX/bundle 默认完整 checkProject。③ PNG 多页 zip/逐张打包留在 browser
adapter（ExportService png 只产出 artifacts）；CLI headless PNG 无 sink，不下载。④ capture 后端把字体字节写入临时
项目（deck.fonts file + project.media），bundle/PPTX 不携带字体文件（3.0 非目标）。⑤ Chrome 单标签第 4 次自动下载
会被拦截，capture 路径 e2e 用页内 `lastImageExport` 断言字节/尺寸（打包下载由 foreignObject 步骤覆盖）。⑥ 新测未
加入 `tests/run-all.mjs`（红线禁改），需单独执行。
**探索审计（只读）**：specs 本组 6 文件；packages/runtime/{index,source,errors,parse,serialize,check,resolve,
provider}、server/{index,api,export-image,runtime-node,events,static}、export/{index,png,pptx,bundle}、
renderer/{headless/{backend,cdp,browser},index,page,background,chart}、writer/{index,pptx,font,icon,util,image,
types/image}、model/{index,theme,style-spec,icon-fa,font-registry,bytes,font}；editor/app/{state,api,toolbar,
file-menu,dialogs,toast}、project/{source,saver,loader,io,handle-io,images,font-manager,icons}、export-image、
render-backend（新）；tests/{runtime/run,export/run,regression/{handle-io,package-integrity,dep-graph},
e2e/{editor-minimal,preview-shell},lib/{unzip,run},tools/{golden-diff,dump-formula-mml}}。无全仓重读，未触碰主检出与
其他 worktree，未运行 ui-shots（CDP 9247）。

## C. 文件 / commit 指针
| commit | message |
|---|---|
| `29898b7` | feat(save): revision 冲突检测与 server/handle 原子批量保存 |
| `f0cfcd7` | feat(editor): 浏览器导出接入 ExportService（PPTX/bundle/PNG foreignObject） |
| `48de47c` | feat(server): /api/export-image 接入 ExportService，PNG 双后端与透明 alpha 回归 |
| （本文件） | docs(w9): 写 W9 交接 |

新增：`packages/runtime/revision.js`、`editor/app/project/export-service.js`、`editor/app/render-backend-browser.js`、
`tests/regression/{save-atomic,image-alpha,parity-png}.mjs`、`tests/e2e/browser-export.mjs`。
修改：`packages/runtime/index.js`、`packages/export/png.js`、`packages/server/{api,export-image}.js`、
`editor/app/project/{source,saver,loader,io,handle-io}.js`、`editor/app/export-image.js`。
未决：无 Chrome 的 SKIP 分支未在本机实测（本机有 Chrome）；字体字节参与 capture/PPTX 嵌入的浏览器路径未用真实
字体文件覆盖（本机 assets/fonts 无字节）；W10 契约回写与 CLI 5 命令面不在本波。
