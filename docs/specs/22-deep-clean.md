# Spec · 补丁式代码根治（22-deep-clean，S1–S5 串行波次）

> 性质：**架构级整理**——允许跨模块修改，专治"不是从根源解决"的代码：同一事实双写、绕过统一入口的旁路、散落多处的能力判断、装配分叉。**可见行为零变化**（一个像素、一条文案都不许变）；允许消失的是"内部双路径"本身。
> 执行方式：**串行**。一次只派一个 agent，其分支合并过全部门禁后，才从最新 main 派下一个。
> 通用前提：`00-overview.md` 红线、`20-cleanup.md` §1 不变量与 §2 注释规范继续有效；版本不动、不 push 不 tag。

## 0. 反补丁四条军规（每个波次都适用，做设计决策时用它裁决）

1. **一个事实只有一个来源**：同一份色值/清单/表/规则出现第二处 = 双写，必须收敛（或由单一来源派生）。
2. **一条路径只有一个闸门**：能力判断（有没有 source、可不可写、有没有浏览器）只允许在一处问，其余地方信任它的结论。
3. **旁路上收**：模块不得自带与统一入口等价的私有实现（私查 DOM、私读文件、私判状态）；统一入口缺能力就给入口加能力，而不是绕过去。
4. **不留新补丁**：修复不得引入新的兼容 shim/特殊分支；发现旧 shim 已无消费者时一并拆除。

## S1 · 设计令牌单一真相（分支 `refactor/token-source`）

**需求（现状的病）**：同一套色值/圆角/字号存在两个词表（旧语义名 `--radius/--text-*/--shadow-*` 与 U1 新名 `--r-*/--f-*/--sh-*/--n-*` 互为别名并存），且 `editor/theme.js` 的 LIGHT/DARK 把整块色板**再抄一份进 JS**。改一个颜色要动 tokens.css、theme.js 两处，两套词表让新代码随机选名。
**怎么做**：
1. 先核实双写事实（theme.js 镜像 vs tokens.css 静态值逐条 diff，报告列出）。
2. **值单一来源**：`tokens.css` 为唯一事实；`theme.js#defaultTokens(mode)` 不再抄值，改为运行时从探针元素 `getComputedStyle` 读取（dark 用 `data-pptd-theme` 属性探针），`applyThemeTokens` 注入路径与宿主覆盖语义不变；contract 测试的 TOKENS/defaultTokens 断言保持通过。
3. **词表单一来源**：选定**旧语义名**为正名（用户已拍板原版观感），新名降级为兼容别名段（集中放在 tokens.css 尾部一个标注 `/* legacy aliases */` 的区块）；`editor/components/**` 与 `styles/*.css` 全部迁到正名；`--n-*` 若仍被使用则保留别名，否则并入 legacy 段。
4. 验收：全仓（除 legacy 别名段）CSS+JS 无第二词表；浅/深/跟随系统三态 + 宿主注入 `applyThemeTokens` 截图与改动前逐字节一致；`node tests/run-all.mjs` 23/23 + contract + dep-graph + 黄金 diff 零未登记漂移。

## S2 · 选择与状态变更单一入口（分支 `refactor/selection-surface`）

**需求（现状的病）**：U1 后元素选择的事实来源是 `state.selection: Set`，但旧标量 `selectedId` 以 getter/setter 兼容 shim 存活，消费点一半走 `api/ops`、一半直接读写 `state.selectedId` / 直接改 `state.deck`；等价操作有两种写法（`ops.clearSelection()` ≡ `state.selectedId = null`）——改选择语义要追多个入口。
**怎么做**：
1. 盘点：全仓列出 `selectedId`、`selection`、直接改 `state.deck/pages/elements` 的每一处消费点（报告成清单）。
2. 收口：**写操作**全部走 `ops/api`（clear/select/selectOnly/addToSelection/toggle…按现状归纳，不自造新概念）；**读操作**统一走 `api.getSelected()/getSelection()` 或 state 只读字段，二选一定死并注释。
3. 消灭 shim：迁移完成后删除 `selectedId` 访问器（若无消费者）；`state.js` 内部字段不再被外部模块直接赋值（loader/saver 等经既有 ops）。
4. 行为零变化红线：多选/框选/Shift 加选/Ctrl 切换/Ctrl+A/Esc 分层/Ctrl+拖动复制/对齐/分布/组合/缩略条页面多选——手动用例逐条复跑；撤销重做语义不变。
5. 验收：grep 证明外部模块零直接写 `state.selectedId`/`selection`；run-all 23/23 + contract + dep-graph + serve 全用例截图走查（观感零变化）。

## S3 · DOM 访问统一与骨架挂载（分支 `refactor/dom-access`）

**需求（现状的病）**：`dom.js` 是"静态 id 单一入口"，但 `loader.js` 自带 `$()`、部分模块仍直接 `document.getElementById`；且骨架不在 `#pptd-root` 内，`createEditor` 的 dom 作用域是"子树优先、回退 document"的双模式补丁。
**怎么做**：
1. 盘点全部 `getElementById/querySelector` 直查点，除 `dom.js` 自身与确属动态内容的查询外全部迁到 `dom` 注册表；`dom.js` 的 id 契约注释保持权威。
2. 评估把静态骨架挪进 `#pptd-root`（index.html 结构调整）或挂载时搬运（createEditor 把骨架 append 进 rootEl），让"子树优先"变成"只查子树"；若评估后风险过高（CSS 选择器/画廊依赖），允许维持双模式但把回退逻辑收敛进 dom.js 单点，并在报告给出量化理由。
3. 验收：grep 证明 `dom.js` 之外零 `getElementById`（动态查询白名单除外，逐条列出）；serve 三入口 + 编辑器全功能抽验；run-all/contract/dep-graph 绿；截图观感零变化。

## S4 · 媒体 IO 单一接缝（分支 `refactor/media-seam`）

**需求（现状的病）**：`ProjectSource` 有 `readMedia`/`capabilities.binary`，但 `editor/app/project/images.js` 仍按"URL 模式自己 fetch、句柄模式自己读"两条旁路预读图片——传输接缝收了读写，没收媒体。
**怎么做**：
1. `images.js` 的媒体获取改为：`source.capabilities.binary && source.readMedia` 存在 → 走 source；否则回退 URL fetch。**闸门只此一处**。
2. 三个 source 实现核对 readMedia 语义（httpSource 仍拼相对 URL、directoryHandleSource 走句柄、delegatingSource 透传当前来源）；`deploy`（GitHub Pages 无 source）路径必须保持现状可用。
3. 删除因此失去消费者的旁路代码。
4. 验收：`tests/e2e/incremental-load.mjs` 绿、`handle-io.mjs` 绿、run-all 23/23 + contract + dep-graph + 黄金 diff；serve 模式与本地句柄模式各开一次编辑器确认图片显示正常。

## S5 · headless 装配单源（分支 `refactor/shot-assembly`）

**需求（现状的病）**：`editor/app/shot.js` 用"空桩 view + 只读 io"另起一套装配（RP-B 只做了一半：paint 通道已单源，装配仍分叉）。任何编辑器装配层的改动都要记得同步 shot 旁路——典型改一处动两处。
**怎么做**：
1. 给 `createEditor` 增加非交互装配能力（如 `interactive: false` 或由 `chrome:"shot"` 派生）：不绑定 canvas/keyboard/contextmenu/present 等 interaction 分片，DOM 只装配 paint 所需。
2. `shot.js` 改为走该标准装配，删除空桩 view/io 分叉；`window.__pptdShot` 协议、`?shot=1` 语义、ui-shots 输出不变。
3. 若评估后发现该改造会牵连过深（例如 interaction 分片与 paint 强耦合无法干净解绑），**允许降级**：保留现分叉但把"装配差异清单"写进 shot.js 头注释并在报告说明——不许无声半做。
4. 验收：黄金 diff 零未登记漂移（截图管线是黄金基线的生产者，必须逐字节稳）+ `node tests/e2e/render.mjs` 9/9 + run-all 23/23 + contract + dep-graph + `tests/tools/ui-shots.mjs` 输出与基线一致。

## 串行与合并协议

- 顺序固定 S1 → S2 → S3 → S4 → S5；每个 agent 的分支从**当时最新 main** 创建；lead 合并（--no-ff）并跑全部门禁后才派下一个。
- 任何波次发现前置波次遗留问题：小修随本波次 commit；大问题停下来报告，不越权扩波。
- 全部完成后 lead 做终验（全门禁 + 三入口 + 浅深双主题 + 黄金 diff）并汇总。
