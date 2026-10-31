# W4 · TypeManifest v2 + 懒加载分片

> 分支/前置：W3 已合并；写入范围 `packages/model/{registry,style-spec,types/**,validate}.js`、`packages/renderer/types/**`、`packages/writer/types/**`、`packages/layout` 的布局 hook 接入、`tests/regression/type-manifest.mjs`、必要契约/barrel（lead 所有）。
> 本波只做类型契约；不改表格算法（W5）。

## 目标

- TypeManifest 成为唯一类型清单：`ELEMENT_TYPES`、validate、layout、add menu/content editor 派生自 manifest。
- `render`/`toXml` 分片按需加载：预览不加载 writer；导出不加载编辑器 UI；新增类型只改 manifest + 对应分片。
- schema/layout hooks；只有 text/table/chart 有 contentEditor；group 为 composite（无 render/toXml，layout 跳过 shell，成员独立）。
- 消除 ELEMENT_TYPES/validate/layout/pptd-io/canvas 的硬编码 switch 与 group 注释漂移。

## 范围

- `packages/model/types/` 每类型 descriptor（id/label/schema/layout/renderKey/toXmlKey/contentEditorKey/composite）。
- registry 合并分片；`ELEMENT_TYPES` 派生；validate 走 schema hook；pptd-io 特例归类型 shard。
- renderer/writer 分片注册；动态 import；懒加载边界测试。
- editor types：只保留 text/table/chart contentEditor；删除 shape/line/image/icon/group 的 menu/create/props/quickbar（W7 执行 UI 删除，本波先定义/注册边界）。
- 测试：每类型注册/校验/渲染/导出；未知类型；懒加载不把 writer/UI 拉进预览；group 行为。

## 非目标

- 不改表格 height/measure（W5）。
- 不改编辑器视觉/交互（W7）。
- 不做主题/字体库（W6）。
- 不保留 menu/create/props/quickbar 字段。
- 不从 model 再拆新包。

## 验收

1. 全量回归 + dep-graph/contract 绿；所有类型能创建/校验/渲染/导出。
2. 预览入口静态闭包不含 writer；导出入口不含 editor content editor（可用 import graph/大小断言）。
3. group：layout 跳过壳、renderer/writer 跳过、成员独立；validate 不报未知类型。
4. 新增一个测试类型只改 manifest+分片即可注册（测试用例证明）。
5. 写入范围外零 diff；无新增依赖。

## 前置上下文

待 W3 合并后补：ExportService/checkProject、runtime、W3 handoff、稳定区、已知坑。
