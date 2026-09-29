# Spec · Git 管理规则（99-git）

## 分支与 worktree

- 分支一律从**合并时刻的最新 main** 创建；agent 在自己的 worktree 内工作：
  - worktree 根：`C:\Users\法法\.pi\worktrees\open-pptd\<分支名>`（由 lead 创建，agent 直接进入干活）。
  - agent **绝不**在主检出 `C:\Users\法法\.pi\agent\skills\open-pptd` 内操作 git 或文件。
  - agent **绝不**执行 `git merge`、`git push`、`git tag`、`git checkout main`。
- worktree 缺 `assets/fonts|icons` 本体（gitignore）——涉及资源本体的测试跳过/降级属预期，不算回归。

## commit 纪律

- 格式：conventional + 中文主题，沿用仓库风格（`feat(editor): xxx`、`fix(cli): xxx`、`chore(release): xxx`、`docs(specs): xxx`）。
- 粒度：每个 spec 工单项（T1、T2…）至少一个 commit；相关小步可合并，但**每个 commit 必须独立通过该阶段门禁**（run-all 相关子集 + 本 spec 验收里的静态检查），不留"改了一半"的中间态。
- commit body 里写清取舍（如 group 的进组编辑方式、assets zip 缺失降级路径）。
- 禁止：`git commit --amend` 已推送历史（本流程无推送，随意）；`git add -A` 盲加（先 `git status` 核对，防带入 worktree 外文件）。

## 合并协议（lead 专属）

1. `git merge --no-ff feat/xxx -m "merge: A_x <名称>（spec 0x）"`。
2. 合并后立即跑当波门禁（见 07-regression.md）；红了 → 打回该 agent 在原分支修复后重合并。
3. 波内多分支合并顺序按 spec 依赖（W1：先 A1 后 A2；W2：先 A3 后 A4）。
4. 全程不 push、不打 tag；版本 bump 仅 W5 由 lead 执行。
