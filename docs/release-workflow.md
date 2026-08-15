# 发布流程（Release）

单仓库发布：push 版本 tag → CI 自动「回归测试 → 打包 → 创建 GitHub Release」。完整流水线定义在 [`.github/workflows/release.yml`](../.github/workflows/release.yml)。

> 历史：2026-08-15 前采用双仓库模式（白名单快照同步到 open-pptd-publish 仓库供用户 clone），现已退役归档，安装方式统一为「下载 Release zip（推荐）或 clone 本仓库」。

## 发一个新版本

```bash
# 1. bump 版本：改 package.json 的 "version" 字段（如 1.0.0 → 1.1.0）
# 2. 提交
git commit -am "chore(release): v1.1.0"
# 3. 打 tag 并推送（tag 必须以 v 开头，且去掉 v 后与 package.json 版本一致，否则 CI 第一步即失败）
git tag v1.1.0
git push origin main v1.1.0
```

push tag 后 CI 自动执行：

| 步骤 | 内容 |
|---|---|
| 校验版本 | tag 与 package.json 的 version 必须一致 |
| 回归测试 | `npm run test:fixtures` + `npm test`（与 Deploy Pages 同款守门，任何一步失败都不会发布） |
| 打包 | `npm run pack` → `dist/open-pptd-v<版本>.zip` |
| 发布 | 创建 GitHub Release 并附上 zip，release notes 从 commits 自动生成（可在 Release 页面手动编辑补充） |

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
