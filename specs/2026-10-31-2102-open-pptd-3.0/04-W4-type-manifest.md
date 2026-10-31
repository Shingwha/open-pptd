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

- 必读顺序：`ref/repo-map.md` → `ref/interfaces.md` §7（TypeManifest/TableFacts）与 §1.1 边表 → `ref/decisions.md` D3 → `handoff/W3-worker.md` → 本工单。
- 基线命令（开工先跑，贴真实输出）：`node tests/tools/dump-formula-mml.mjs`；`node tests/run-all.mjs` → 28/28；`node tests/runtime/run.mjs` → 92/92；`node tests/export/run.mjs` → 56/56；`node tests/regression/dep-graph.mjs`；`node tests/contract/public-api.mjs`。
- 稳定区（勿重读/勿改）：`packages/runtime/**`、`packages/export/**`、`packages/renderer/headless/**`、`packages/server/**`、`packages/cli/**`、`editor/app/**`、`editor/interaction/**`、`tests/golden/**`、`tests/projects/**`。
- 已知现状：
  - `ELEMENT_TYPES` 在 `packages/model/style-spec.js`（含 group）；validate 有独立 `KNOWN_TYPES` + 按类型 switch；layout 用 `if elementType==="group"/"text"/"table"` 特例；renderer/writer 用 `registerType` 分片静态注册。
  - `packages/renderer` 静态闭包当前不含 writer；`packages/export` 不含 editor。W4 只加断言，不重构编辑器装配（W7/W8）。
  - 导出字节与 golden 必须零变化（本波不改几何/表格/度量）。
- 已知坑：`style-spec.js` 被大量模块 import；`types/*` descriptor 若 import style-spec 会形成循环（只允许 style-spec → types 方向；descriptor 的 schema 只用纯字符串/数组判断）。零依赖/零构建。

## 本波实施口径（lead 已拍板）

1. **descriptor 目录**：新增 `packages/model/types/`，每类型一个模块 + `index.js`：
   - `{ id, label, composite?, layoutKey?, schema?: (el) => Issue[], contentEditor?: boolean }`；group `composite:true`；text/table `layoutKey`；text/table/chart `contentEditor:true`。
   - `types/index.js` 导出 `TYPE_DEFS`/`TYPE_IDS`/`defineType` 元数据；**不得 import `style-spec.js`**。
   - `style-spec.js` 的 `ELEMENT_TYPES` 改为派生自 `TYPE_IDS`（顺序保持不变：text/shape/line/image/icon/table/chart/group）。
2. **validate**：`KNOWN_TYPES` 改为 manifest id 集合；按类型 switch 改为遍历 `def.schema?.(el)` 产出 issue；issue 的 `rule`（`schema-type`）、`message`、顺序保持逐字不变（现有测试/CLI 输出是基线）。
3. **layout**：`layout/index.js` 用 `getType(el.elementType)?.composite` 跳过 group shell；`layoutKey` 映射到现有 `layoutText`/`layoutTable`（映射留在 layout 包内，避免 model→layout 反向依赖）；无 layoutKey 走默认 part。几何零变化。
4. **registry**：`registerType` 合并语义保留；新增 `defineType`（注册元数据）与 `typeIds()`/`allTypes()` 由 manifest 初始化。renderer/writer 分片可继续静态注册，但新增 `packages/renderer/types/load.js` 与 `packages/writer/types/load.js` 的动态 `import()` 按 id 加载分片的入口（新类型只需 descriptor + 分片即可接入；测试证明）。
5. **editor 边界**：只改 `editor/types/index.js`/`menu.js`（若需要）让新增菜单项从 manifest 的 `contentEditor:true` 派生；不删除任何 UI 文件（W7 做）。现有各类型 shard 的 label 与 descriptor 保持一致，避免重复注册告警。
6. **测试**：`tests/regression/type-manifest.mjs`（自跑，lead 接入 run-all）：
   - ELEMENT_TYPES == manifest ids；每类型 descriptor 字段完整；group composite；
   - 8 个内置类型逐一 validate/render/toXml 冒烟（用现有项目元素或构造最小元素）；
   - 注册一个测试类型（descriptor+schema+动态 render/toXml 分片）→ 可校验/渲染/导出；
   - 静态 import 闭包断言：renderer 包不 import writer；writer/export 包不 import editor（源码扫描）。
   不要改 `tests/run-all.mjs`、`package.json`、`contract.json`、barrels、dep-graph。
