# 发布流程（Release）

单仓库发布：push 版本 tag → CI 自动「回归测试 → 打包 → 创建 GitHub Release」。完整流水线定义在 [`.github/workflows/release.yml`](../.github/workflows/release.yml)。

3.0 的 CLI 只有 5 个命令：`open` / `build` / `check` / `assets` / `doctor`（无别名、无旧命令兼容）；发布前用 `node bin/open-pptd.js --help` 复核。

> 历史：2026-08-15 前采用双仓库模式（白名单快照同步到 open-pptd-publish 仓库供用户 clone），现已退役归档，安装方式统一为「下载 Release zip（推荐）或 clone 本仓库」。原独立 `open-pptd-skill` 技能仓也已归档，技能内容以本仓 `skill/` 为唯一来源，发布时产出 skill zip。

## 发一个新版本

```bash
# 1. bump 版本：改 package.json 的 "version"（如 3.0.0 → 3.1.0），
#    README.md / README.zh-CN.md 头部版本串、CHANGELOG.md 同步
# 2. 本地守门（与 CI 同款；test:docs / test:skill 已包含在 npm test 内，可单独先跑）
npm run test:docs
npm run test:skill
npm run test:fixtures
npm test
npm run pack                    # 干跑打包，检查 dist/ 资产清单
# 3. 提交
# 4. 写更新说明到临时文件（格式见下方「更新说明」），打带注释的 tag 并推送
#    tag 必须以 v 开头，且去掉 v 后与 package.json 版本一致，否则 CI 第一步即失败
#    ⚠️ 必须加 --cleanup=verbatim，否则 # 开头的 Markdown 标题行会被 git 当注释剔除（见踩坑记录②）
git tag -a v3.0.0 -F notes.md --cleanup=verbatim
git push origin main v3.0.0
# 5.（推荐）push 后本地自检一遍注释完整：
git tag -l --format='%(contents)' v3.0.0
```

push tag 后 CI 自动执行：

| 步骤 | 内容 |
|---|---|
| 校验版本 | tag 与 package.json 的 version 必须一致 |
| 生成公式产物 | `npm run test:fixtures`（`tests/fixtures/formula/mml/` 不入库，KaTeX 本地生成） |
| 回归测试 | `npm test`（含 `test:docs` 文档门禁与 `test:skill` 技能包回归；与 Deploy Pages 同款守门，任何一步失败都不会发布） |
| 打包 | `npm run pack` → `dist/`：`open-pptd-v<版本>.zip`（CLI 运行时白名单包，含 `skill/` 知识包）+ `open-pptd-skill-v<版本>.zip` 与稳定别名 `open-pptd-skill.zip`（技能知识包，两者同字节；顶层 `open-pptd/`，含 `SKILL.md`/`README.md`/`references/`/`kits/`，不含测试与媒体）+ `open-pptd-icons-v<版本>.zip` + `open-pptd-fonts-v<版本>.zip`（图标/字体本体仅取本地工作树实际存在的，CI 无本体时自动跳过）+ `install.ps1`/`install.sh`（同步自仓库根）+ `SHA256SUMS`（覆盖全部 zip；skill 版本名与稳定名各一行） |
| 发布 | 创建 GitHub Release 并上传 `dist/*` 全部资产；notes 优先取 tag 注释，未写则 commit 列表自动生成。用户侧安装走仓库根 install 脚本（raw URL 一键安装），Release zip 是离线/手动安装渠道 |

## 更新说明（Release Notes）

**写在 tag 注释里**：用 `git tag -a` 打带注释的 tag，注释内容原样成为 Release 正文（支持 Markdown）。推荐用文件方式写多行说明：

```bash
# 写好 notes.md（格式示例见下），再打 tag：
git tag -a v3.0.0 -F notes.md --cleanup=verbatim
```

**Release 正文格式**（标题行必须存在，否则 Release 列表显示难看）：

```markdown
## v3.0.0 更新内容

（一段概述，说明本版定位）

### 新增
- **粗体关键词**：描述

### 改进
- **粗体关键词**：描述

### 修复
- **粗体关键词**：描述

**Full Changelog**: https://github.com/Shingwha/open-pptd/commits/v3.0.0
```

⚠️ **Markdown 标题会被吃**：`git tag -a` 默认 `--cleanup=strip`，注释里 `#` 开头的行（如 `## v3.0.0 更新内容`、`### 新增`）会被当注释剔除，`-m`/编辑器方式同样如此。**务必加 `--cleanup=verbatim`**（见踩坑记录②）。

验证注释完整：`git tag -l --format='%(contents)' v3.0.0`（应能看到 `## ` 标题行）

- 忘了写注释（轻量 tag）不阻塞发布：CI 自动退回 commits 自动生成（此时 Release 标题 = tag 名，正文为自动 changelog）
- 发布后想补充修改：Release 页面右上角 Edit，或 `gh release edit v3.0.0 --notes "..." --title v3.0.0`（**改 notes 时 title 也要显式带上**，否则 gh 会用 notes 第一行覆盖标题）

## 踩坑记录（2026-08-15 v1.1.1 发版实战）

1. **actions/checkout@v4 会把 annotated tag 降级为轻量 tag**：检出 tag ref 时，checkout 用 `rev-parse`（tag 对象 SHA）比对事件 commit SHA，annotated tag 永不相等 → 二次 fetch `+<commit>:refs/tags/<tag>` 覆盖 → 本地 tag 变轻量，`%(objecttype)` 返回 `commit`，手写注释读不到。
   **已在 release.yml 修复**：发版前 `git fetch --force origin "+refs/tags/${GITHUB_REF_NAME}:refs/tags/${GITHUB_REF_NAME}"` 重新拉回 annotated tag。
2. **git tag 默认 `--cleanup=strip` 剔除 `#` 行**：`-m`/`-F`/编辑器写注释时，`## 标题`、`### 分类` 等 Markdown 标题行被当注释删除，Release 正文缺标题和分类。
   **预防**：打 tag 一律 `--cleanup=verbatim`；本地验证 `git tag -l --format='%(contents)'`。
3. **`gh release create --notes-file` 会把 notes 第一行当 Release 标题**：手写 notes 时列表页标题变成 `## v3.0.0 更新内容`；`--generate-notes` 分支则默认用 tag 名，行为不一致。
   **已在 release.yml 修复**：两条分支都显式 `--title "$GITHUB_REF_NAME"`。
4. **推送 workflow 文件需要 `workflow` scope 的 token**：普通 PAT 推 `.github/workflows/` 会被 GitHub 拒绝（`refusing to allow a Personal Access Token...`）。发版若改 workflow，先确认 token 带 `workflow` 权限。

## 发布包里有什么

`npm run pack` 产出以下资产（`dist/` 不入 git；图标/字体本体缺失时对应 zip 自动跳过，不视为失败）：

| 资产 | 内容 |
|---|---|
| `open-pptd-v<版本>.zip` | CLI 运行时。白名单单一事实来源是 [`scripts/pack-release.mjs`](../scripts/pack-release.mjs) 顶部的 `WHITELIST`（11 项）：`README.md` / `README.zh-CN.md` / `index.html` / `package.json` / `contract.json` / `bin/` / `packages/` / `editor/` / `skill/` / `assets/fonts/registry.json` / `assets/icons/registry.json` |
| `open-pptd-skill-v<版本>.zip` | 技能知识包（固定版本）：顶层目录 `open-pptd/`，内容仅 `SKILL.md` / `README.md` / `references/**` / `kits/**`；不含测试、demo、媒体与可执行脚本。可跑 `npm run pack -- --only skill` 单独复验 |
| `open-pptd-skill.zip` | 技能知识包稳定别名：与同版本 `open-pptd-skill-v<版本>.zip` 同字节副本，默认与 `--only skill` 都产出；用于 `releases/latest/download/open-pptd-skill.zip` 固定链接 |
| `open-pptd-icons-v<版本>.zip` | 图标本体（`solid/regular/brands/**/*.svg`，不含 registry.json），本机工作树有本体时才产出 |
| `open-pptd-fonts-v<版本>.zip` | 字体本体（`*.ttf`，不含 registry.json），本机工作树有本体时才产出 |
| `install.ps1` / `install.sh` | 仓库根安装脚本副本，可直接从 Release 页面下载 |
| `SHA256SUMS` | 覆盖本次全部 zip 的 SHA256 清单 |

- **运行时 zip 不含**：tests、docs、examples、.github、scripts、字体与图标本体（registry.json 元数据入包，本体经 `open-pptd assets sync` 或导出前置体检按需获取）；**含 `skill/`**，因此安装后的 CLI 可直接执行 `assets skill install`
- **skill zip 单独产出**：技能内容来自主仓 `skill/`（原独立技能仓已归档）；`package.json.files` 与 runtime WHITELIST 均包含 `skill`，CLI 运行时 zip 与 npm 包都自带技能源
- **技能安装三种渠道（按优先级）**：
  1. CLI：`open-pptd assets skill install --dir ~/.claude/skills`（pi 用 `~/.pi/agent/skills`；目标为 `<dir>/open-pptd`，非空默认拒绝，`--force` 覆盖，`--json` 输出 `{ok,source,target,files}`）
  2. Release zip：`releases/latest/download/open-pptd-skill.zip`（稳定名）或 `open-pptd-skill-v<版本>.zip`（固定版本），解压到 agent 的 skills 目录（zip 顶层即 `open-pptd/`）
  3. 源码回退：从主仓 `cp -r skill <skills-dir>/open-pptd`
- **运行时 zip 不是技能安装入口**：它是 **CLI 运行时**，由仓库根的 `install.ps1` / `install.sh` 下载安装（校验 SHA256 → 解压到 `~/.open-pptd/cli/versions/<ver>` → current 指针 → 用户级 PATH）；装好后用上面的 CLI 命令安装技能
- 文件清单取自 `git ls-files`，只收 git 跟踪文件；打包时若工作树有未提交改动，脚本会打警示

要调整发布内容 = 改 `WHITELIST`，然后本地验证：

```bash
npm run pack                          # 产物 dist/open-pptd-v<版本>.zip 等（dist/ 不入 git），解压比对即可
npm run pack -- --only skill          # 只产 skill 版本 zip + 稳定别名 + SHA256SUMS（2 行），用于单独复验
```

## 本地守门命令

| 命令 | 作用 |
|---|---|
| `node bin/open-pptd.js --help` | 复核 CLI 只有 5 个命令（open/build/check/assets/doctor） |
| `npm run test:docs` | docs 目录白名单、已删文档/DSH 引用扫描、README 口径、版本一致性 |
| `npm run test:skill` | SKILL/refs/kits lint + 6 个 kit 的 check/build 回归 + skill zip 条目与 SHA |
| `npm test` | 全量回归（含上述两项、contract、CLI surface、golden 等） |
| `npm run pack` | 按白名单产出全部发布资产与 `SHA256SUMS` |

## 用户如何更新

- **zip 用户**：到 [Releases](https://github.com/Shingwha/open-pptd/releases) 下载新版本 zip，解压覆盖旧目录
- **clone 用户**：`git pull`（版本 tag 打在 main 上，随源码一起拉到）
- **技能用户**：`open-pptd assets skill install --dir <skills-dir> --force`（CLI 升级后重装即可），或重新解压 `open-pptd-skill.zip` / `open-pptd-skill-v<版本>.zip` 覆盖 skills 目录中的 `open-pptd/`（或重新 `cp -r skill`）
