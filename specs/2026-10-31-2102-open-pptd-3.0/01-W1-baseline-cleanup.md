# W1 · 基线 + 清理

> 分支由 lead 派工时创建；起点为主仓最新 main；写入范围见 T1–T5。
> 最高约束：**对编辑器/引擎行为零变化**（除删除明确死代码/旧 docs）。本波不重构功能，只建立可信基线并清掉会干扰后续的垃圾。

## 目标

1. 跑通并记录 2.x 当前全量基线（测试、golden、CLI 输出、项目导出）。
2. 删除明确无消费者的死代码/桩/重复脚本，降低后续 W2+ 噪音。
3. 删除旧 docs 归档/已完成 specs/DSH 文档（docs 清理第一阶段），更新仍保留文件里的断链。
4. 记录后续 parity 所需的基线（图表页 PNG、表格总高、文字度量），但不改行为。
5. 不碰核心导出/编辑器功能；W2 之后才迁移。

## 前置上下文

- 无前置 handoff。
- 必读：`ref/repo-map.md` → `ref/interfaces.md` → `ref/decisions.md` → 本工单。
- 基线命令（开工先跑，贴真实输出）：

```bash
node tests/run-all.mjs
node tests/regression/dep-graph.mjs
node tests/contract/public-api.mjs
npm run test:render        # 有 Chrome/Edge；无则记录 SKIP
```

- 稳定区（已验收，勿重读）：无；这是第一波。
- 已知约束：
  - 当前 test suite 可能依赖字体/浏览器；`test:render`/`incremental` 不强制，无法跑记录 SKIP。
  - 不删除 `docs/release-workflow.md`、`docs/images/`、`docs/embedding.md`（W10 才删）、`docs/image-generation.md`（W11 才删）。
  - 不删除当前 3.0 spec 组。

## 工单（按序执行，每项一个 commit）

### T1 建立基线记录

- 跑上面基线命令；记录：
  - `node tests/run-all.mjs` 通过数/失败项/耗时；
  - `dep-graph`/`contract` 结果；
  - `test:render` 结果或 SKIP 原因；
  - `node tests/run-all.mjs` 生成的 `tests/projects/*/out/check-*.pptx` 是否存在/数量。
- 捕获当前 CLI 帮助与关键输出：
  - `node bin/open-pptd.js --help > specs/.../ref/baseline-cli.txt`（放 spec 组或 tests/tools/，不要进代码包）；
  - `node bin/open-pptd.js export` 现状输出（用一个测试项目；不提交生成物）。
- 用 chart 项目（`tests/projects/chart`）生成 scale=1/2 的 page1/page2 PNG baseline，保存到 `tests/fixtures/parity/chart/` 或 spec 组 `ref/baseline-png/`（不要提交大图；可只留 hash/尺寸/图表区域采样指标）。
- 记录表格关键值：`examples/business-review-7p` 的表页 rowHeights/totalHeight/colWidths（当前实现），作为 W5 对照。
- 只允许写：`specs/2026-10-31-2102-open-pptd-3.0/ref/baseline*.md|txt`（或 `tests/fixtures/parity/` 小文件）；不改代码。
- 验证：记录文件存在；不改变 git 工作区之外的文件。

### T2 删除死代码/桩/重复入口

只删除**确认无消费者**的内部死代码，不改功能：

- 删除 `editor/components/` 中未接线模块（若 `button.js`/`menu.js` 仍有消费者则保留）：
  - `datagrid.js`、`dialog.js`、`field.js`、`panel.js`、`popover.js`、`section.js`、`toolbar.js`、`tooltip.js`、`index.js`（先 grep 确认；`file-menu.js`/`ui.js`/`contextmenu.js` 只用 button/menu）。
- 删除 `packages/measure/adapters/dom.js`（抛错桩；实际 adapter 在 editor/app/view/dom-measure.js）。
- 删除根 `index.html` 中重复的 `gallery.js` script 引入（保留实际执行的一份）。
- 删除/修正 stale 注释：
  - `editor/types/group.js` 关于 ELEMENT_TYPES 省略 group 的过期说明（当前 style-spec 已含 group，但本轮只改注释不改行为）；
  - 明显指向已不存在文档的注释（`packages/model/font.js:4`、`theme-presets.js:10`、`model/index.js:5`、`cli/bin.js:4`）先删除引用，不改逻辑。
- 不删除：editor 编辑功能文件、core renderer/writer/model、`packages/cli/ensure.js`（W10 才删）、契约入口。
- 验证：`node tests/run-all.mjs` 全绿；`grep` 确认无 import 指向删除文件。

### T3 docs 清理第一阶段

- 删除：
  - `docs/archive/**`（整目录，含 README、integration-plan、editor-design-reference.html、旧 specs）；
  - `specs/2026-09-30-ui-redesign-line/**`；
  - `specs/ref/dsh-theme-mapping.md`；
  - `specs/2026-09-30-ui-redesign-line/ref/dsh-theme-requirements.md`（随目录删除）；
  - 所有 DSH 文档/引用。
- 保留：
  - `docs/release-workflow.md`；
  - `docs/images/**`；
  - `docs/embedding.md`（W10 才删）；
  - `docs/image-generation.md`（W11 才删）。
- 更新仍保留文件里的断链：
  - `docs/embedding.md` 开头指向 `docs/specs/ref/integration-plan.md` 的引用删除/改为“历史设计见 git 历史”；
  - `tests/contract/README.md` 指向旧 spec 的引用改为 `docs/embedding.md` + contract tests（embedding 后删，届时再改）；
  - 代码/测试注释指向归档文档的引用（见 T2）。
- 删除后跑 `grep -R "docs/archive\|docs/specs\|dsh-theme"`，确认没有活跃引用（历史 CHANGELOG 可保留）。
- 允许写：上述 docs/specs 路径、`tests/contract/README.md`、相关注释文件；不要动当前 3.0 spec 组。
- 验证：`git status` 只含预期删除/注释；测试全绿。

### T4 parity 基线 harness（只记录，不失败）

- 新增 `tests/tools/parity-baseline.mjs`（或 `tests/fixtures/parity/README.md` + 脚本）：
  - 用 `renderDeck` 对 `tests/projects/chart` 的 page 1/2、scale 1/2 生成 PNG 到临时目录；
  - 记录尺寸/文件大小/图表区域采样（不必做图像识别；可用 PNG 像素采样/哈希）；
  - 用 `measureTable` 记录 table 项目/示例表的总高、行高；
  - 用 `layout` 记录 text-heavy 项目的 frame/height；
  - 输出 JSON 到 `tests/fixtures/parity/baseline.json`（小文件；不提交 PNG）。
- 该脚本**不设断言**，只生成 baseline；W3/W5 再把它变成 gate（图表第 1 页清晰度、measure/table 对照）。
- 不改 render/export 行为；如脚本需要内部 API，只调用现有公开函数。
- 验证：脚本可跑（有 Chrome）；无 Chrome 输出 SKIP 并以 0 退出；`node tests/run-all.mjs` 仍绿。

### T5 记录与交接

- 在 `handoff/W1-<agent>.md` 写：
  - 基线命令/真实结果；
  - 删除清单/消费者证据；
  - 仍保留的 docs 与下一波会删的文件；
  - parity baseline 文件位置/字段；
  - 已知坑（字体/浏览器/路径）。
- 更新本 spec 状态行（可选；由 lead 合并时统一）。

## 验收

1. `node tests/run-all.mjs` 全绿（贴真实通过数/失败项）。
2. `dep-graph`/`contract` 绿。
3. `npm run test:render` 通过或有 Chrome 缺失的 SKIP 证据。
4. golden 无 diff（本波不改渲染/度量）。
5. 删除文件无消费者；`grep` 无 import/链接指向已删文件；docs 断链检查通过。
6. parity baseline JSON 生成（有 Chrome）或明确 SKIP。
7. 写入范围外零 diff（handoff/当前 spec 状态例外）。

## 禁触清单

- `packages/model/**`、`packages/renderer/**`、`packages/writer/**`、`packages/layout/**`、`packages/measure/**` 的行为/导出（T2 仅删 adapter 桩/注释）。
- `editor/app/**`、`editor/interaction/**`、`editor/types/**` 的功能/UI（T2 仅死组件/注释）。
- `package.json`、`package.json files`、`contract.json`、`packages/index.js`、`packages/*/index.js`。
- `docs/release-workflow.md`、`docs/images/**`、`docs/embedding.md`、`docs/image-generation.md`。
- `tests/golden/**`、`tests/projects/**` 的基线数据。
- 当前 3.0 spec 组（除 lead 允许的状态行）。

## 交接包

完成后在分支最后一个 commit 写 `handoff/W1-<agent>.md`，按 skill 协议 A/B/C 节；A 节贴命令真实输出，B 节写删除消费者证据/坑，C 节写文件/commit。

## 最终报告

- 工单状态表 / commit 清单（hash + message）
- 自测真实结论（用例数/失败项/SKIP）
- 删除清单与消费者证据
- parity baseline 位置/字段
- 偏差与取舍（摘要，详情进 handoff B）
- 探索审计（handoff 之外读了哪些文件、为什么）
- 未决问题（如浏览器/字体环境）
