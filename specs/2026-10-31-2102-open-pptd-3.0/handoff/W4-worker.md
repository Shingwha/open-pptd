# W4 handoff · TypeManifest + 懒加载分片
> 分支 `feat/3.0-w4-types`，起点 `060d2f2`（main，W1–W3 已合并）；Windows 10.0.28120 + Git Bash + Node v24.21.0；零 npm 依赖。

## A. 自测真实输出

```text
# 开工基线（HEAD 060d2f2）
$ node tests/tools/dump-formula-mml.mjs → KaTeX MathML 生成: 204/204
$ node tests/run-all.mjs                  → 结果: 28/28 通过 ✅
$ node tests/runtime/run.mjs              → runtime: 92/92 通过 ✅
$ node tests/export/run.mjs               → export: 56/56 通过 ✅
$ node tests/regression/dep-graph.mjs     → 扫描 201 文件 / 756 import（barrel 10）✓
$ node tests/contract/public-api.mjs      → 结果: 契约通过 ✅

# 完工（真实输出）
$ node tests/regression/type-manifest.mjs → 42 项 ✓ / 0 项 ✗；TypeManifest 契约通过 ✅（exit 0）
$ node tests/run-all.mjs                  → 结果: 28/28 通过 ✅（无回退；未接入新测试，按工单由 lead 接线）
$ node tests/runtime/run.mjs              → runtime: 92/92 通过 ✅
$ node tests/export/run.mjs               → export: 56/56 通过 ✅
$ node tests/regression/dep-graph.mjs     → 扫描 226 文件 / 794 import（barrel 10）✓
$ node tests/contract/public-api.mjs      → 结果: 契约通过 ✅
$ node tests/e2e/render.mjs               → render 冒烟测试 9/9 通过 ✅（timeouts=0）

# CLI check 逐字对比（HEAD 与 W4 各自运行，diff 无输出）
tests/projects/* 9 个项目 + examples/* 15 个项目：ALL-...-CHECK-OUTPUTS-IDENTICAL
# 导出字节数（HEAD → W4，两侧完全一致）
chart 837227 → 837227；table 250837 → 250837；text 141748 → 141748
# 解压后 XML/rels 逐文件对比（仅归一化 W3CDTF 时间与随机 uniqueId）：ALL-XML-PARTS-IDENTICAL
# golden（24 项目 / 156 页）
HEAD：感知一致 151 页；未登记漂移 5 处（examples/shanmingji#7、tide-festival#5、text#3/#7/#8）
W4：同一 5 处、同一 Δ 值；其余 151 页一致 → 零新增漂移（5 处为 main 既有基线，非本波引入）
```

## B. 实现、偏差与审计

**Manifest（packages/model/types/）**：每类型一个 descriptor 模块 + index.js；字段 `{id,label,composite?,layoutKey?,schema?(el)->[{message,rule?}],contentEditor}`。`TYPE_DEFS`/`TYPE_IDS`/`defineType`（纯校验+冻结）由 index 导出，顺序 text/shape/line/image/icon/table/chart/group；descriptor 零 import（尤其不 import style-spec，测试做源码断言）。group 仅 `composite:true`、无 schema；text/table 有 `layoutKey`；text/table/chart `contentEditor:true`。
**registry**：manifest 在模块加载时 seed，`allTypes()` 改按 manifest 顺序（再追加运行时扩展），新增 `typeIds()`/`isKnownType()`/`defineType()`（注册元数据并纳入 known）；`registerType` 合并语义与未知类型 warning 文本保留。registry 不再 import style-spec，校验/布局/编辑器均经 registry。
**validate**：删除 `KNOWN_TYPES` 常量与按类型 switch；每次校验用 `typeIds()` 判未知，类型特例遍历 `getType(el.type).schema(el)`。issue 的 `level/rule(schema-type)/page/elementId/message` 字段与顺序不变；24 个项目 CLI check 与 HEAD 逐字一致。
**layout**：`getType(...).composite` 跳过 group 壳；`layoutKey` 经包内 `LAYOUT_HOOKS` 映射 `layoutText`/`layoutTable`，无 key 走尺寸透传。映射留在 layout 包，model 不反向依赖 layout；几何字节零变化（layout 回归 + examples 90 页元素数 + golden 均通过）。
**renderer/writer 分片**：每类型新增 `types/<id>.js` 自注册 shard；`types/index.js` 静态 import 全部 shard（预览/导出同步路径不变）。新增 `types/load.js`：`loadType(id, importer?)` 按 `./<id>.js` 约定动态 import，composite 直接返回、未定义类型/非法 id/分片未注册均报错。测试在导入任何 writer 模块前断言 `getType("text").render/toXml` 均 undefined，再动态加载真实 `./text.js`；静态闭包源码扫描证明 renderer ⊅ writer/editor、writer/export ⊅ editor、model 无兄弟包。
**editor**：仅改 `editor/types/index.js` 与 `menu.js`；新增 `contentEditorTypeIds()`（allTypes 中 contentEditor:true → text/table/chart），`buildAddItems` 继续从 manifest 初始化的 registry 收集 shard 菜单。未删除任何 UI 文件；各 shard label 与 descriptor 完全一致（无重复注册告警）。
**偏差/口径说明**：① `defineType`/`typeIds`/`isKnownType` 为深路径 API，未改 model barrel/contract.json/contract tests（红线）；lead 若需公开面需统一加。② 测试类型用 `loadType(id, importer)` 注入动态分片（测试进程内注册），避免向生产 types 目录放 demo 文件；默认 importer 已用真实 text shard 验证。③ group 无 schema（可选字段），测试按 composite 放宽。④ 菜单项仍由 editor shard 提供（W7 删 UI）；本波只建立 contentEditor 派生边界。⑤ 未改 pptd-io 的表特例（该文件不在本波写入范围）。
**探索审计（只读）**：specs 本组 ref/repo-map、interfaces §7/§1.1、decisions D3、handoff/W3、工单；packages/{model/{registry,style-spec,validate,pptd-io,index},layout,renderer/{index,page,types,text,chart,icon,shell},writer/{index,slide,types,icon,image,pptx},export/index}；editor/{types/*,interaction/{add-menu,properties},app/api}；tests/{run-all,contract/public-api,regression/{validate,layout,dep-graph,package-integrity},tools/golden-*}。未全仓重读，未触碰主检出/其他 worktree。

## C. 文件 / commit 指针

| commit | message |
|---|---|
| `879f5c4` | feat(model): 新增 TypeManifest 类型描述符并派生 ELEMENT_TYPES |
| `6be55ed` | refactor(model): validate 改为 manifest ids + schema hook（输出逐字不变） |
| `a3413ba` | refactor(layout): 用 composite/layoutKey 派生类型布局（几何零变化） |
| `c8b061c` | feat(renderer): 拆分 render 分片并提供按 id 懒加载入口 |
| `d36ea81` | feat(writer): 拆分 toXml 分片并提供按 id 懒加载入口 |
| `819f079` | refactor(editor): 类型菜单与 contentEditor 从 manifest 派生 |
| `800fc94` | test(types): 新增 TypeManifest 与懒加载分片回归自测 |
| （本文件） | docs(w4): 写 W4 交接 |

新增：`packages/model/types/*`（8 descriptor + index）、`packages/renderer/types/{text,shape,line,image,icon,table,chart,load}.js`、`packages/writer/types/{text,shape,line,image,icon,table,chart,load}.js`、`tests/regression/type-manifest.mjs`。
修改：`packages/model/{registry,style-spec,validate}.js`、`packages/layout/index.js`、`packages/renderer/types/index.js`、`packages/writer/types/index.js`、`editor/types/{index,menu}.js`。
未决：lead 合并时把 `node tests/regression/type-manifest.mjs` 接入 run-all（一行）；barrel/contract 3.0 是否公开 `defineType/typeIds/isKnownType` 由 lead 统一拍板。
