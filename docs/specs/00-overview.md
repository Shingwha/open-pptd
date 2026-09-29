# open-pptd 2.0 重构 · 总纲（00-overview）

> 本目录 `docs/specs/` 是本次重构的唯一执行依据。每份 spec 是一个 agent 的完整工单。
> 权威参考（只读，勿修改）：`docs/specs/ref/integration-plan.md`（深度集成方案，含全部接口签名与证据）、`docs/specs/ref/editor-design-reference.html`(编辑器设计参考稿，含令牌全表与选择态视觉规范)。

## 1. 背景与范围

open-pptd 当前 v1.5.0（本仓库）。本次重构目标：

| 做 | 不做 |
|---|---|
| 引擎接口化：包级 barrel + `exports` map + `contract.json` + 契约测试 | ❌ dsh-plugin-pptd 适配仓（Host/Client 半边、`pptd_*` 工具、preset、`--dsw-*` 主题桥）全部不做 |
| 传输接缝 `ProjectSource` + 主题注入（含 dark）+ `createEditor`/`destroy` + `dialogs` | ❌ 本机 `.dsh/skills`、`.zcode/skills` 的技能切换（用户自行迁移） |
| 资源外置 `~/.open-pptd`（`paths`/`config`、静态多根、原子下载） | ❌ npm 发包 |
| CLI 打磨：`doctor`/`paths`/`assets`/`ensure`/`serve --detach\|--json\|--stop` + 导出前置体检 | ❌ push / tag / release（等用户指令） |
| 技能拆分：`SKILL.md` + `references/` 迁出为独立纯文本技能仓 | |
| 发布基础设施：仓库根 `install.ps1`/`install.sh`（raw URL 一键安装）+ 资产包 + SHA256SUMS | |
| UI 重构两刀 U1（地基）/ U2（信息架构），按设计参考稿落地 | |

版本目标：**2.0.0**（W5 由 lead 统一 bump，agent 不得改 version）。

## 2. 权威设计决策（已定，不再讨论）

- 三仓架构中的仓 1（引擎+CLI）与仓 2（技能）本次落地；`OPEN_PPTD_HOME` 环境变量；读三级（`$OPEN_PPTD_HOME` → `~/.open-pptd` → 包内）写一级（永远 home）；`registry.json` 永远只读包内。
- `CONTRACT_VERSION = 2`；深路径 2.x 期间经 `./internal/*` 仍可达，3.0 移除。
- UI 七条决策：B2 减法信息架构 / 锐利 2-4-6px / 深浅色两层 / 原生 DOM 原语不引 React / 两刀切法 / 键位重映射（Shift→多选、Alt→微调/等比/复制拖动）/ 按设计参考稿执行。
- install 脚本放**仓库根**（`install.ps1`、`install.sh`），用户经 `irm https://raw.githubusercontent.com/Shingwha/open-pptd/main/install.ps1 | iex` 安装；脚本从 GitHub Releases 下载 runtime zip 并校验 SHA256。

## 3. 波次与写入范围矩阵

| 波次 | Agent | spec | 写入范围（其余一律禁触） |
|---|---|---|---|
| W1 ∥ | A1 engine-api | `01-engine-api.md` | `packages/{model,renderer,writer,cli}/index.js`、`packages/index.js`、`package.json`、`contract.json`、`tests/contract/*`、`tests/regression/dep-graph.mjs`、`docs/embedding.md` |
| W1 ∥ | A2 editor-core | `02-editor-core.md` | `editor/**`（除 `editor/styles` 中 A2 明确要改的 6 个文件外，U 波次文件不动）、`tests/regression/handle-io.mjs`（仅必要时） |
| W1.5 | lead | — | editor 深路径→barrel 迁移、dep-graph 编辑器侧新规则、契约测试扩展 |
| W2 ∥ | A3 resources-cli | `03-resources-cli.md` | `packages/paths.js`、`packages/config.js`、`packages/server/*`、`packages/cli/*`、`packages/model/{font-registry,icon-fa}.js`（仅 Node 分支）、`packages/writer/font.js`、`packages/index.js`（仅追加 paths/config 再导出）、`tests/regression/resource-paths.mjs` |
| W2 ∥ | A4 skill-release | `04-skill-release.md` | 仓 1：`SKILL.md`、`references/`（删除）、`scripts/pack-release.mjs`、`scripts/install/**`、`install.ps1`、`install.sh`、`.github/workflows/*`、`tests/regression/package-integrity.mjs`（如需）；仓 2：`../open-pptd-skill` 全仓（新建） |
| W3 | A5 ui-u1 | `05-ui-u1.md` | `editor/**`、`tests/tools/ui-shots.mjs`（如需）；**红线：`packages/` 零 diff** |
| W4 | A6 ui-u2 | `06-ui-u2.md` | 同 A5 |
| W5 | lead | — | 版本 2.0.0、CHANGELOG、全量回归、汇总 |

跨波次文件移交（已授权，不属于冲突）：
- `package.json` 的 `exports` map 由 A1 在 W1 一次写全（含 `./editor`、`./paths`、`./config` 条目，目标文件随后续波次落地）。
- `packages/index.js`：A1 建骨架（model/renderer/writer/server/cli + `CONTRACT_VERSION`），A3 在 W2 **追加** paths/config 再导出。
- 契约测试：A1 建（断言已存在的入口），A3 追加 paths/config 断言，lead 在 W1.5 追加 editor 断言。

## 4. 回归红线（任何一条破坏 = 该 commit 打回）

1. `node tests/run-all.mjs` 全绿（基线 20/20），独立确认退出码，勿用管道吞掉。
2. `tests/regression/dep-graph.mjs` 全绿（含新增规则）。
3. CLI 既有八命令（serve/export/export-project/check/render/gallery/fonts/icons）行为与输出不变；新增命令只增不改。
4. 浏览器三入口正常：`?deck=<项目>` / 无 `?deck` 进画廊 / `?shot=1` 截图模式；`tests/tools/ui-shots.mjs` 可用。
5. `tests/regression/handle-io.mjs`、`tests/e2e/incremental-load.mjs`、`tests/regression/package-integrity.mjs` 持续生效。
6. U1/U2 全程 `packages/` 零 diff；`git diff main -- packages/` 必须为空。
7. 分层纪律（dep-graph 既有四条）：`packages/{model,writer}` 无 `window.`/`document.`/`require(`/`fs`/`node:`；`editor/` 不导入 `packages/server`、`packages/cli`；`packages/` 不导入 `editor/`。

## 5. Git 管理规则（详见 99-git.md）

- 每个 agent 在**自己的 worktree** 里工作于自己的分支，**绝不**在主检出目录操作，**绝不** merge/push。
- commit 风格：conventional + 中文主题（`feat(editor): ...`），每个 spec 工单项一个 commit，**每个 commit 必须独立通过相关回归**（勿留中间态）。
- 合并由 lead 执行：逐条 `merge --no-ff`，合并前后各跑一次门禁。

## 6. 环境事实

- 仓库：`C:\Users\法法\.pi\agent\skills\open-pptd`（路径含非 ASCII 字符，shell 命令注意引号）。Windows + Git Bash；Node v24.18.0。
- 零依赖、无构建步骤：**不需要 npm install**，原始 ESM + 原始 CSS。
- `assets/fonts/*.ttf` 与 `assets/icons/{solid,regular,brands}/` 本体**不入库**（.gitignore），本机已装 16/27 字体、图标全量；worktree 里**没有**这些本体（只有 registry.json）——涉及资源本体的测试在 worktree 中可能跳过/降级，属预期。
- `dist/` 不入库。
