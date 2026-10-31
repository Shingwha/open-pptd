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

待 W8 合并后补：ExportService/RenderBackend、createEditor io/save、W3/W8 handoff、PNG baseline、稳定区、已知坑。
