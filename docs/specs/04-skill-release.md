# Spec A4 · skill-release：技能仓拆分 + 一键安装 + 发布资产（W2）

> agent 代号 A4，分支 `feat/p0-skill-release`。深读：`docs/specs/ref/integration-plan.md` §3.1/§3.6/§3.8、§5.7、附录 D.9。
> 前置阅读：`docs/specs/00-overview.md`。**前置：W1 已合并**（`contract.json` 已存在于仓 1 包根）。

## 目标

1. 新建独立技能仓 **`C:\Users\法法\.pi\agent\skills\open-pptd-skill`**（仓 2）：纯 markdown 知识包，零可执行文件。
2. 仓 1 删除 `SKILL.md` + `references/`，白名单同步收口。
3. 仓 1 根目录新增 `install.ps1` / `install.sh`（用户可经 `irm https://raw.githubusercontent.com/Shingwha/open-pptd/main/install.ps1 | iex` 直接安装 CLI）；pack-release 产出五类发布资产。

**边界**：不做本机 `.dsh/skills`、`.zcode/skills` 的任何切换或写入；不 push 不打 tag；发版 release notes 由 lead/用户后续处理（但 install 脚本幂等、可重复执行）。

## 工单 A：技能仓（仓 2，全新 git 仓库）

位置 `C:\Users\法法\.pi\agent\skills\open-pptd-skill`，`git init`（main 分支）：

```
open-pptd-skill/
├── SKILL.md          # 重写（见下）
├── references/       # 从仓 1 原样平迁（11 个文件一个字节不改：design.md、pptd.md、shapes.md、slides_categories/×8）
├── README.md         # 仓库说明：这是什么、怎么安装 CLI、怎么安装技能（复制到各 agent 的 skills 目录）
├── LICENSE           # MIT（与仓 1 一致）
└── .github/workflows/drift-guard.yml
```

**SKILL.md 重写要求**（结构参照仓 1 现有 SKILL.md 的方法论部分，执行面替换为命令面）：
1. 保留全部**内容方法论**（场景判断、版式、验证基线等现有正文）——这是技能的灵魂，只删"怎么跑运行时"的旧说明。
2. 开头新增**「前置：确认 CLI 可用」**段：先 `open-pptd doctor`；command not found → **先告知用户**，再按系统给安装命令：
   - Windows：`irm https://raw.githubusercontent.com/Shingwha/open-pptd/main/install.ps1 | iex`
   - Linux/macOS：`curl -fsSL https://raw.githubusercontent.com/Shingwha/open-pptd/main/install.sh | sh`
   - 装不上（无网络/无 Node）→ 明确报告，绝不假装能继续。
3. **预览段**：`open-pptd serve --project <dir> --detach --json` → 把返回 url 给用户（`/editor/?deck=…` 是编辑器、根路径是画廊、SSE 自动热更新）；看完 `open-pptd serve --stop`。**只写这一条路径**；加一句占位："嵌入式宿主（如 DeepSeek Harness）经 pptd_* 工具预览——尚未实施，届时本节更新"。
4. **导出段**：直接 `open-pptd export <manifest>`（导出前自动体检并按需补齐字体）；**不要**先跑全量字体下载；结果 `embedded/skipped` 清单要如实转述；有 `skipped` 必须明确告知。
5. 示例里所有 `node bin/open-pptd.js …` 改为 `open-pptd …`。
6. 不写 `requires-cli`、不校验版本区间（R7：版本治理归运维）。
7. `references/` 内部相对链接与 SKILL.md 对 references 的引用路径保持同目录结构，平迁后全部仍应可达（抽查 5 处链接）。

**drift-guard.yml**（仓 2 CI）：拉仓 1 最新 release 的 runtime zip（或 main tarball）解到临时目录，做四项只读比对：① `pptd.md §5` 类型必填字段 vs 引擎 `validate.js` schema 键名集合；② `pptd.md §3` Theme 结构 vs `theme.js`/`theme-presets.js` 键名；③ `shapes.md` 形状/连接线计数 vs `scripts/gen-preset-geometry.mjs` 数据计数；④ `design.md §4` 字体注册名 vs `registry.json` family/alias 集合。任一不符即 fail 并提示"references 需随引擎更新"。无法静态解析的比对项可退化为存在性/计数抽查，但四项都要有。

## 工单 B：仓 1 侧改动

### T1 删除内容面 + 白名单收口

- 删 `SKILL.md`、`references/`（整目录）。
- `scripts/pack-release.mjs`：WHITELIST 删除 `"SKILL.md"` 与 `"references"`，加入 `"contract.json"`；注释更新（内容面已迁 open-pptd-skill 仓）。
- 全仓 `grep -rn "references/"` 应只剩代码注释（style-spec.js/svg-gradient.js 等的注释引用**可以保留**，它们描述对齐目标，不构成读取；若某注释造成误导可顺手改指 open-pptd-skill 仓）。`packages/writer/font.js:144` 的文案归 A3 改，你不用动。

### T2 安装脚本（**仓库根**：`install.ps1` + `install.sh`，raw URL 稳定可达）

两脚本同构，10 步（详见 ref §3.6），要点：
1. 幂等探测：已装且版本满足 → 打印版本路径后退出。
2. 前置检查：node 存在、目标目录可写。
3. 下载：`https://github.com/Shingwha/open-pptd/releases/latest/download/open-pptd-v<ver>.zip`（先拉 `latest/download/SHA256SUMS` 解析最新版本号，或从 GitHub API `releases/latest` 取 tag——选更稳的实现并注释）；`-Version <ver>` 参数锁定。
4. 校验：SHA256 比对，不符即中止并清理。
5. 解压到 `~/.open-pptd/cli/versions/<ver>`（先解 tmp 再 rename，避免半截安装）。
6. 切 `current` 指针（Windows 用 junction：`New-Item -ItemType Junction`；Unix 用 symlink）。
7. 写启动器 `~/.open-pptd/cli/bin/open-pptd{,.cmd}`（内容见 ref §3.6，启动器在调用时解析 node，缺 node 明确报错）。
8. PATH：Windows 读 `HKCU:\Environment` 的 Path，不含则用 `[Environment]::SetEnvironmentVariable(...,"User")` 写回 + 广播 WM_SETTINGCHANGE + 当前会话 `$env:Path` 追加；**禁用 setx**。Unix 优先 `~/.local/bin`（已在 PATH 时），否则 `~/.profile`/`~/.zshrc` 写带标记幂等块（`# >>> open-pptd >>>`）。
9. 默认尝试 `assets sync icons`（等价逻辑：下载 icons 资产 zip 解到 home/assets/icons；失败仅警告不阻断），字体询问或跳过。
10. 收尾打印：版本、路径、"新开终端生效"、下一步（`open-pptd doctor`）。

**注意**：本机测试时**不要真的写用户 `~/.open-pptd`**——用 `OPEN_PPTD_HOME`/参数化目标目录或干跑模式自测语法与流程分支；安装脚本必须支持 `-WhatIf`/`--dry-run`（打印将执行的步骤）便于无副作用验证。

### T3 发布资产（`scripts/pack-release.mjs` + `.github/workflows/release.yml`）

pack-release 新增产出（`dist/`）：
- `open-pptd-v<ver>.zip`（现有白名单流程，口径 = WHITELIST ∪ contract.json）。
- `open-pptd-icons-v<ver>.zip`：`assets/icons/{solid,regular,brands}/**/*.svg`（**不含 registry.json**；保持目录结构）。
- `open-pptd-fonts-v<ver>.zip`：`assets/fonts/*.ttf`（不含 registry.json）。
- `SHA256SUMS`：覆盖以上全部 zip。
- **重要**：字体/图标本体不入 git（.gitignore），打包时以**本地工作树实际存在的文件**为准；本体缺失时**跳过对应 zip 并打印明确警告**（CI 上无本体，产 runtime zip + SHA256SUMS 即为合法产物），绝不能因此失败。
- `install.ps1`/`install.sh` 同时复制进 `dist/`（便于 release 页直接下载，raw URL 之外多一条路）。
- `release.yml`：`gh release create "$TAG" dist/*` 上传全部资产（保持既有 tag 与 package.json 版本一致性校验、test:fixtures、npm test 前置步骤不变）。

## 验收（完成前自测）

1. 仓 2：`find open-pptd-skill -type f` 无任何可执行脚本（.md/.yml/LICENSE/.github 工作流除外）；`git -C open-pptd-skill status` 干净且已做首次 commit；抽查 SKILL.md 内 5 处 references 链接相对可达。
2. 仓 1：`grep -rn "SKILL.md\|references" scripts/pack-release.mjs` 不再出现；`node scripts/pack-release.mjs` 产 runtime zip（本机含字体图标则五件套齐）且 zip 清单不含 `SKILL.md`/`references/`、含 `contract.json`。
3. `powershell -NoProfile -Command "[System.Management.Automation.Language.Parser]::ParseFile('<仓库根>\install.ps1', [ref]$null, [ref]$null) | Out-Null; 'OK'"` 语法通过；`sh -n install.sh` 通过；`--dry-run` 两个平台各跑一次无副作用。
4. `node tests/run-all.mjs` 全绿（package-integrity 对白名单改动敏感，必须过）。
5. 仓 1 `git grep -l "references/design.md" -- '*.js'` 逐条确认为纯注释。

## 禁触清单

仓 1 的 `editor/**`、`packages/**`、`package.json`、`tests/contract/`、`tests/regression/`（package-integrity.mjs 仅在白名单改动确需时同步）；**绝不**写入 `C:\Users\法法\.dsh\`、`C:\Users\法法\.zcode\`、`C:\Users\法法\.open-pptd\`；仓 2 的 `references/` 必须与仓 1 删除前**逐字节一致**（用 `git diff --no-index` 或 hash 比对验证）。
