# Spec · 全仓代码整理（20-cleanup，R1 并行×5 + R2 tests）

> 性质：**行为保持型清理**。本次不改任何运行时行为、不改任何对外接口、不改任何渲染输出。
> 前置阅读：`00-overview.md`（红线/环境）、`99-git.md`（分支/commit/合并协议）。
> 版本不动（保持 2.0.0）；不 push 不 tag。

## 1. 全局不变量（每个 agent 都适用，违反 = 打回）

1. **行为零变化**：清理前后所有测试结论一致；C2 额外要求黄金 diff 零未登记漂移。
2. **对外接口冻结**：所有 barrel/export 导出名一个不许动（契约测试守着）；`contract.json`、`package.json` 的 exports/files 不动；`CONTRACT_VERSION` 不动。模块**内部**函数名可以整理。
3. **`./internal/*` 兼容承诺（2.x）**：被仓内任何文件、测试、docs 引用的内部文件一律保留；只允许删除"全仓零引用且明显是历史遗留"的文件，且必须在报告中逐个列出删除清单。
4. **预留接口保留**：`memorySource`/`delegatingSource`/chrome 预设/`measure/adapters/dom.js` 桩/`autoGrowTexts` 的 `@deprecated` 空符号（契约测试要求存在）等"为后续留的口子"一律不清理。
5. **中文产品文案不动**：字符串字面量里的中文（UI 文案、CLI 人类输出、toast、默认标题「未命名演示文稿」、错误提示）是产品内容，**一个字不改**。只改**注释**（`//`、`/* */`、`<!-- -->`）。
6. **vendored 第三方不动**：`packages/model/vendor/**` 的文件内容一个字符都不碰（含其内注释）。
7. **CSS 类名不改**（JS/HTML 强耦合）；CSS 清理 = 删除经验证无引用的孤儿规则、合并重复规则、注释整理。
8. **不新增依赖、不引入构建**；不新增常驻浮层/UI 元素。

## 2. 注释规范（所有 agent 统一执行）

- **全部中文注释改为英文**（含 CSS/HTML 注释；vendor 除外）。
- 合并零散注释：同一逻辑块上方 3+ 段历史碎语合并为一段；删除「修改于/此前是/对齐 XX 文档 §N」类过程叙事（那是 git log 的事）；删除复述代码的废话注释。
- 保留并译好两类注释：**约束解释**（为什么不能那样写，如"浏览器安全模型的三个硬约束"）、**契约/单位/边界说明**（参数含义、单位、陷阱）。
- 文件头保持统一的 `// ====` 分隔条风格，首行一句话说清本文件职责；格式参照 `packages/model/index.js` 现状。
- 若某模块确有值得沉淀的架构说明，可在 `docs/internals/<area>.md`（英文）写一篇短文并在报告中说明；无必要不写。

## 3. 模块划分与写入范围（R1 并行，互不重叠）

| Agent | 分支 | 范围（写入边界） | 特别门禁 |
|---|---|---|---|
| **C1 core-model** | `chore/clean-model` | `packages/model/**`（**vendor 内容除外**）；barrel `packages/model/index.js` 导出名冻结 | run-all + contract + dep-graph |
| **C2 paint-writer** | `chore/clean-paint` | `packages/renderer/**` + `packages/writer/**`（含 headless）；两个 barrel 导出名冻结 | + **黄金 diff 零未登记漂移** |
| **C3 node-layer** | `chore/clean-node` | `packages/server/**`、`packages/cli/**`、`bin/**`、`packages/paths.js`、`packages/config.js`、`packages/index.js`、`scripts/**`、`package.json`/`contract.json` 仅注释性字段校对（无注释字段则零 diff）；CLI 人类输出中文串不动 | run-all + contract + dep-graph + `doctor --json`/`serve --detach --json`/`serve --stop` 抽验 |
| **C4 editor-shell** | `chore/clean-editor-shell` | `editor/*.js`（root：coords/dialogs/dom/editor/gallery/icons/main/popover/theme/ui/index.js）、`editor/app/**`、`editor/components/**`、`editor/index.html`、根 `index.html`（仅注释）；`editor/index.js` 导出冻结 | run-all + contract + dep-graph + serve 三入口抽验 |
| **C5 editor-ux** | `chore/clean-editor-ux` | `editor/interaction/**`、`editor/types/**`、`editor/styles/**`（类名不改） | run-all + contract + dep-graph + serve 截图目检（观感零变化） |

## 4. 每个模块的工作项（按序 commit）

1. **死代码清除**：未被引用的函数/文件/规则；候选删除逐个 grep 全仓（含 tests、docs、字符串拼接）确认零引用；删除清单进报告。
2. **重复逻辑合并**：同模块内复制粘贴的逻辑收敛为单一实现；跨模块发现的重复**只记录不动作**（报告给 lead）。
3. **结构优化**：过深嵌套、超长函数拆分（不改变行为与导出面）；明显错位的文件归位（同模块内 mv 需全量校验 import——dep-graph 守着）。
4. **注释整理**：按 §2 规范翻译+合并+统一格式。
5. **README/自述核对**（C3/C4/C5 各自范围内）：无悬空文件引用。

## 5. R2：C6 tests 整合（`chore/clean-tests`，R1 全部合并后）

`tests/**` 全权整理（`tests/golden/manifest.json`、`tests/fixtures/**` 生成物、`tests/projects/**`、`examples/**` 不动；`tests/tools/{ui-shots,golden-*,isolate,dump-formula-mml}.mjs` 是工具链，只在必要时小改）：

1. **盘点分类**：对 23 个 run-all 套件 + 2 个 e2e 逐个给出定性：核心验证（保留）/ 重复覆盖（合并）/ 脆弱断言（重写为行为断言或删除）/ 无操作套件（删除）。分类表进报告。
2. **删除脆弱测试**：对字符串字面量做比较、改个提示文案就会挂的断言——能改成行为断言的改写（断言"跳过了嵌入且导出成功"而非断言具体中文句子），改不了的删除。
3. **合并重复**：同一能力多处重复覆盖的收敛为一处强断言；`theme-presets.mjs` 这类因 references 迁出而空转的套件，能落到真实事实（读 `packages/model/theme-presets.js` 的预设数据本身做断言）就落地，落不了就删。
4. **保留的核心面**（一条都不能少）：parse/serialize 往返、导出 OOXML 关键部件断言、validate/schema、layout/measure 数值断言、契约测试、dep-graph、resource-paths、handle-io、incremental-load、公式 204、图标、颜色/主题一致性。
5. 套件注释同步 §2 规范（英文、去叙事）；`run-all.mjs` 注册表同步；报告中给出**前后套件数与断言数对比**。
6. 门禁：重构后的 run-all 全绿 + contract + dep-graph + 黄金 diff 零未登记漂移（在主检出跑，有字体本体）。

## 6. 门禁与验收（每个 R1 agent 完成前自测）

1. `node tests/tools/dump-formula-mml.mjs` 先跑（worktree 无产物），然后 `node tests/run-all.mjs` 23/23 全绿（独立确认退出码）。
2. `node tests/contract/public-api.mjs` + `node tests/regression/dep-graph.mjs` 绿（证明导出面与依赖方向零变化）。
3. C2：`node tests/tools/golden-diff.mjs --whitelist tests/golden/whitelist.json` 零未登记漂移。
4. C4/C5：`node bin/open-pptd.js serve --project tests/projects/chart --detach --json` 起服 → 三入口 + 右键菜单/缩略条/深浅色抽验 → `serve --stop`；C5 另做改动前后截图比对（观感零变化）。
5. `grep -rn "[\u4e00-\u9fff]" <自己范围内> --include="*.js" --include="*.css" --include="*.html"` 的命中**仅剩字符串字面量**（注释里零中文）——报告中给出核对方式与结果。
6. `git diff main -- <他人范围>` 为空。
