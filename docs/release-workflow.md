# 发布流程（Release）

单仓库发布：push 版本 tag → CI 自动「回归测试 → 打包 → 创建 GitHub Release」。完整流水线定义在 [`.github/workflows/release.yml`](../.github/workflows/release.yml)。

> 历史：2026-08-15 前采用双仓库模式（白名单快照同步到 open-pptd-publish 仓库供用户 clone），现已退役归档，安装方式统一为「下载 Release zip（推荐）或 clone 本仓库」。

## 发一个新版本

```bash
# 1. bump 版本：改 package.json 的 "version" 字段（如 1.0.0 → 1.1.0）
# 2. 提交
# 3. 写更新说明到临时文件（格式见下方「更新说明」），打带注释的 tag 并推送
#    tag 必须以 v 开头，且去掉 v 后与 package.json 版本一致，否则 CI 第一步即失败
#    ⚠️ 必须加 --cleanup=verbatim，否则 # 开头的 Markdown 标题行会被 git 当注释剔除（见踩坑记录②）
git tag -a v1.1.0 -F notes.md --cleanup=verbatim
git push origin main v1.1.0
# 4.（推荐）push 后本地自检一遍注释完整：
git tag -l --format='%(contents)' v1.1.0
```

push tag 后 CI 自动执行：

| 步骤 | 内容 |
|---|---|
| 校验版本 | tag 与 package.json 的 version 必须一致 |
| 回归测试 | `npm run test:fixtures` + `npm test`（与 Deploy Pages 同款守门，任何一步失败都不会发布） |
| 打包 | `npm run pack` → `dist/open-pptd-v<版本>.zip` |
| 发布 | 创建 GitHub Release 并附上 zip；notes 优先取 tag 注释，未写则 commit 列表自动生成 |

## 更新说明（Release Notes）

**写在 tag 注释里**：用 `git tag -a` 打带注释的 tag，注释内容原样成为 Release 正文（支持 Markdown）。推荐用文件方式写多行说明：

```bash
# 写好 notes.md（格式示例见下），再打 tag：
git tag -a v1.1.0 -F notes.md --cleanup=verbatim
```

**Release 正文格式**（与 v1.1.0 对齐，标题行必须存在否则 Release 列表显示难看）：

```markdown
## v1.1.0 更新内容

（一段概述，说明本版定位）

### 新增
- **粗体关键词**：描述

### 改进
- **粗体关键词**：描述

### 修复
- **粗体关键词**：描述

**Full Changelog**: https://github.com/Shingwha/open-pptd/commits/v1.1.0
```

⚠️ **Markdown 标题会被吃**：`git tag -a` 默认 `--cleanup=strip`，注释里 `#` 开头的行（如 `## v1.1.0 更新内容`、`### 新增`）会被当注释剔除，`-m`/编辑器方式同样如此。**务必加 `--cleanup=verbatim`**（见踩坑记录②）。

验证注释完整：`git tag -l --format='%(contents)' v1.1.0`（应能看到 `## ` 标题行）

- 忘了写注释（轻量 tag）不阻塞发布：CI 自动退回 commits 自动生成（此时 Release 标题 = tag 名，正文为自动 changelog）
- 发布后想补充修改：Release 页面右上角 Edit，或 `gh release edit v1.1.0 --notes "..." --title v1.1.0`（**改 notes 时 title 也要显式带上**，否则 gh 会用 notes 第一行覆盖标题）

## 踩坑记录（2026-08-15 v1.1.1 发版实战）

1. **actions/checkout@v4 会把 annotated tag 降级为轻量 tag**：检出 tag ref 时，checkout 用 `rev-parse`（tag 对象 SHA）比对事件 commit SHA，annotated tag 永不相等 → 二次 fetch `+<commit>:refs/tags/<tag>` 覆盖 → 本地 tag 变轻量，`%(objecttype)` 返回 `commit`，手写注释读不到。
   **已在 release.yml 修复**：发版前 `git fetch --force origin "+refs/tags/${GITHUB_REF_NAME}:refs/tags/${GITHUB_REF_NAME}"` 重新拉回 annotated tag。
2. **git tag 默认 `--cleanup=strip` 剔除 `#` 行**：`-m`/`-F`/编辑器写注释时，`## 标题`、`### 分类` 等 Markdown 标题行被当注释删除，Release 正文缺标题和分类。
   **预防**：打 tag 一律 `--cleanup=verbatim`；本地验证 `git tag -l --format='%(contents)'`。
3. **`gh release create --notes-file` 会把 notes 第一行当 Release 标题**：手写 notes 时列表页标题变成 `## v1.1.1 更新内容`；`--generate-notes` 分支则默认用 tag 名，行为不一致。
   **已在 release.yml 修复**：两条分支都显式 `--title "$GITHUB_REF_NAME"`。
4. **推送 workflow 文件需要 `workflow` scope 的 token**：普通 PAT 推 `.github/workflows/` 会被 GitHub 拒绝（`refusing to allow a Personal Access Token...`）。发版若改 workflow，先确认 token 带 `workflow` 权限。

## 发布包里有什么

白名单的单一事实来源是 [`scripts/pack-release.mjs`](../scripts/pack-release.mjs) 顶部的 `WHITELIST` 数组（10 项）：

```
README.md / README.en.md / SKILL.md / index.html / package.json
bin/ / lib/ / editor/ / references/ / assets/fonts/registry.json
```

- **不含**：tests、docs、examples、.github、scripts、.gitignore、图标源（assets/icons）——发布包只装 skill 运行时
- zip 顶层目录为 `open-pptd/`，解压到 skills 文件夹即完成安装
- 字体文件本体（约 155MB）不入包，装好后 `node bin/open-pptd.js fonts download` 按需下载
- 文件清单取自 `git ls-files`，只收 git 跟踪文件；打包时若工作树有未提交改动，脚本会打警示

要调整发布内容 = 改 `WHITELIST`，然后本地验证：

```bash
npm run pack    # 产物 dist/open-pptd-v<版本>.zip（dist/ 不入 git），解压比对即可
```

## 用户如何更新

- **zip 用户**：到 [Releases](https://github.com/Shingwha/open-pptd/releases) 下载新版本 zip，解压覆盖旧目录
- **clone 用户**：`git pull`（版本 tag 打在 main 上，随源码一起拉到）
