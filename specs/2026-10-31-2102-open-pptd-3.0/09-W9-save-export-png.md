# W9 · 原子保存 / 冲突 / 浏览器导出 / PNG 双后端

> 分支/前置：W3、W8 已合并；写入范围 `editor/app/project/{source,saver,loader}.js`、`editor/app/export-image.js`、`packages/server/{api,export-image}.js`、browser export adapter、`tests/regression/{save-atomic,image-alpha}.mjs`、`tests/regression/parity-png.mjs`。
> 本波把保存与浏览器导出接入共享服务；不做 CLI 命令面（W10）。

## 目标

- ProjectSource.write(files,{expectedRevision})：原子批量写（temp+rename/回滚）；revision 冲突抛 `RevisionConflictError`；server `/api/save` 与 local handle 同步；不静默覆盖 AI/外部修改。
- 编辑器 saver：serialize/media/font refs → write；冲突 UI 覆盖/重新加载/取消；成功 baseline/dirty。
- 浏览器导出：PPTX/bundle 走 ExportService browser adapter；PNG capture/foreignObject 两条后端统一 RenderBackend/scale；删除重复 zip/preflight。
- 透明 PNG alpha 回归：渲染/PPTX 字节保留 alpha；格式拒绝/转换提示。
- 统一导出对话框：PPTX（嵌入/子集）、PNG（页/scale/打包）、项目包；字体管理跳 Design。

## 范围

- source/saver/server save 原子化/冲突；local handle 读取 revision（mtime/hash）；错误类型。
- export-image：capture probe base-aware；foreignObject fallback；共享 backend 接口；图表 DPR。
- server export-image 使用 ExportService；临时项目/清理/security 保留。
- 测试：原子失败回滚、冲突、PNG 尺寸/清晰度/alpha、bundle 一致。

## 非目标

- 不改 CLI 命令面（W10）。
- 不做 Office/WPS/browserless PNG。
- 不做自动保存。
- 不做项目包字体携带。

## 验收

1. 全量回归 + dep-graph/contract 绿。
2. 保存成功/失败/冲突：无半写；冲突提示；重新加载可用；baseline/dirty 正确。
3. 浏览器 PPTX/bundle 与 CLI 同序列化；无重复 zip/preflight 路径。
4. PNG capture/foreignObject/CLI headless 尺寸/图表清晰度一致；scale 1/2/3；第 1 页不糊。
5. 透明 PNG alpha 保留；格式错误明确；无引擎改动或仅最小修复。
6. 写入范围外零 diff；无新增依赖。

## 前置上下文

- 必读顺序：`ref/repo-map.md` → `ref/interfaces.md` §2/§4/§5/§6 → `ref/decisions.md` D9/D10 → `ref/testing.md` §5/§10.1 → `handoff/W3-worker.md`、`handoff/W8-worker.md` → 本工单。
- 基线命令（开工先跑，贴真实输出）：`node tests/tools/dump-formula-mml.mjs`；`node tests/run-all.mjs` → 34/34；`node tests/e2e/editor-minimal.mjs` 21/21；`node tests/e2e/preview-shell.mjs` 23/23；`node tests/e2e/render.mjs` 9/9；dep-graph；contract；`golden-diff`。
- 稳定区（勿重读/勿改）：`packages/{measure,layout,model,writer}/**`（writer/export 仅在 adapter 必要时最小修复）、`tests/golden/**`、`tests/projects/**`、`tests/run-all.mjs`、`package.json`、`contract.json`、barrels。
- 现有事实（lead 已核实）：
  - `source.write(files)` 无 revision；`httpSource` 直接 POST `/api/save`，`directoryHandleSource` 调 `handle-io.writeFiles`（逐文件 createWritable，无回滚）；server `handleSave` 逐文件 `writeFileSync`，无 revision/原子性。
  - `saver.js` 内含 PPTX 对话框/ZipWriter/buildPptx 调用；`editor/app/export-image.js` 是浏览器 foreignObject/capture 导出；server `export-image.js` 用 headless capture；W3 已有 `packages/export` + `renderer/headless/backend.js`。
  - W8 的 `createEditor` 返回 `{ready,destroy,preview,editor,io,state}`；`io.save`/`io.export*` 在 `app/project/io.js`；文件菜单位于 `app/file-menu.js`。
  - runtime 已有 `RevisionConflictError`（W2，含 code）；需补 revision 计算与 source/read/write 接线。
- 已知坑：Windows 目录 rename 不能覆盖已存在目标；local handle 无事务；浏览器无 node:crypto（revision 用纯 JS hash）；PPTX/ZIP 字节非确定，验收用结构事实（`ref/testing.md` §10.1）；`tests/tools/ui-shots.mjs` 固定 CDP 9247，不要并行。

## 本波实施口径（lead 已拍板）

1. **revision**：新增纯函数 `packages/runtime/revision.js`（`projectRevision(files)`，纯 JS hash，覆盖 manifest + page 文本 + media 名/字节摘要，输出稳定字符串），从 runtime index 导出。`source.read()` 返回 `revision`（http 由客户端按读到的文本计算，directoryHandle/memory 同）；`source.write(files,{expectedRevision})`：先取当前 revision，不同则抛 `RevisionConflictError`（含 `currentRevision`），相同才写。
2. **server /api/save**：支持 `{files, expectedRevision}`；先算当前 revision（manifest+页文件），不匹配返回 409 `{ok:false,error:{code:"ERR_REVISION_CONFLICT",currentRevision}}`；路径校验全部通过后再写。原子批量：备份目标旧内容 → 逐文件 `tmp → rename`（同目录）→ manifest 最后写；任一失败恢复备份/删除新建文件并返回 500。成功返回 `{ok:true,count,revision}`。
3. **local handle 保存**：`writeFiles` 改为批量备份 + 逐文件写 + 失败回滚；写前 revision 校验（同一 `projectRevision`）。`saver.save` 传入 `state.revision`；冲突 UI：覆盖（不带 expectedRevision 重写）/ 重新加载 / 取消；成功 `commitBaseline` + 更新 revision/dirty。HTTP 409 解析为 `RevisionConflictError`。
4. **浏览器导出走 ExportService**：新增 `editor/app/project/export-service.js` 浏览器 adapter：
   - `ResourceProvider`：fontManager/fonts、icons（preload map）、images（mediaMap/dataURL）；
   - `sink`：downloadBlob/downloadPptx；PPTX/bundle 用 `packages/export`；PNG 用 ExportService + 浏览器 backend。
   - `saver.js` 的 PPTX 对话框/zip/preflight 改为调用 adapter；`editor/app/export-image.js` 的 foreignObject 实现包成 RenderBackend（`editor/app/render-backend-browser.js`），capture 仍走 server。
5. **PNG 双后端**：foreignObject 与 headless 共用 ExportService 的页选择/scale/命名/zip/report；`pixelRatio=scale` 首帧前确定；scale 1/2/3；图表第 1 页不糊。server `/api/export-image` 改为内部用 ExportService + capture/headless backend（保留端点/请求体/安全校验/返回形状）；浏览器 PNG 不进 server。
6. **透明 PNG**：foreignObject canvas 清空背景保留 alpha；PPTX 图片条目写入原始 PNG 字节不压平；新增 `tests/regression/image-alpha.mjs`（Node：PNG IHDR color type 6 + PPTX zip 媒体字节等于输入）。
7. **统一导出对话框**：PPTX（嵌入开/关、子集/完整）、PNG（页/scale/打包）、项目包；字体管理跳 Design（已有事件）。
8. **测试**：新增 `tests/regression/save-atomic.mjs`（server 原子失败回滚、revision 冲突 409、memory/local source 冲突、成功 revision 更新）、`image-alpha.mjs`、`parity-png.mjs`（scale 1/2/3、尺寸、图表区域指标；无 Chrome SKIP+exit 0）。浏览器导出 e2e 可并到 editor-minimal 或新增；Chrome 缺失 SKIP。
9. **不改 CLI 命令面**（W10）；`packages/export` 允许最小修复（adapter 需要公开 sink/factory 时），不得改导出行为；golden 零漂移。
