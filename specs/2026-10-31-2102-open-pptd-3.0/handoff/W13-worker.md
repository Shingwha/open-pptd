# W13 handoff · Docs 清理终态 + 发布流程
> 分支 `feat/3.0-w13-docs`，起点 `main b04a139`（W1–W12 已合并）；Windows 10.0.28120 + Git Bash + Node v24.21.0；零新增依赖。
> 写入范围：`docs/**`、README*.md、CHANGELOG.md、`tests/docs/**`、`tests/run-all.mjs`（1 行）、`package.json`（version/scripts）、`editor/app/project/source.js`（仅注释）、`.github/workflows/release.yml`（1 行注释）、本文件。pack-release 无需改（W12 已产 skill zip）。

## A. 自测真实输出
```text
# 开工基线（b04a139）
$ node tests/tools/dump-formula-mml.mjs → KaTeX MathML 生成: 204/204
$ node tests/run-all.mjs → 结果: 38/38 通过 ✅
$ node tests/skill/run.mjs → 结果: 101/101 通过 ✅（warnings recorded: 0）
$ node tests/cli/surface.mjs → 结果: 72/72 通过 ✅
$ node bin/open-pptd.js --help → “open-pptd 3.0 · 5 个命令”（open/build/check/assets/doctor）
$ node tests/tools/golden-diff.mjs → 24 项目/156 页；字节一致 156；无未登记漂移
$ dep-graph ✓ 依赖方向与环境全局检查通过；contract ✓ 契约通过
# 完工（最终代码，全部真实输出）
$ node tests/run-all.mjs → 结果: 39/39 通过 ✅（新增 docs 门禁）
$ node tests/docs/run.mjs → 结果: 35/35 通过 ✅
$ node tests/skill/run.mjs → 101/101 通过 ✅（warnings: 0）；CLI surface 72/72 ✅
$ node tests/tools/golden-diff.mjs → 156 页字节一致；0 未登记漂移 ✅
$ dep-graph ✓；contract ✓；open-pptd --help 仍只列 5 命令
# pack 干跑（package.json 3.0.0）
$ node scripts/pack-release.mjs
  ✓ open-pptd-v3.0.0.zip：249 文件，3.75MB → 1.14MB
  ✓ open-pptd-skill-v3.0.0.zip：82 文件，0.25MB → 0.12MB
  ✓ install.ps1 / install.sh；SHA256SUMS（2 项）
  ! 图标/字体资产包跳过：本 worktree 无本体（CI 合法产物）
  runtime SHA256 653524d9f6fd3d2d9d21613a48b83e1fb69f99ba13149b0c09267e21620aa292
  skill   SHA256 cb9ce659642cc2efc798f628d2058c4073fecbf12c8eb5a40c7ea6891595bcd5
$ node scripts/pack-release.mjs --only skill → 82 文件；SHA256SUMS（1 项）
  zip 抽验：顶层唯一 open-pptd/；含 SKILL/README/7 refs/kits；无 tests/媒体/脚本；
  运行时 zip 无 skill/docs/tests/examples/scripts。
```
## B. 实现、终态、偏差与审计
**docs 终态**：`docs/` 仅 `release-workflow.md` + `images/**`（9 个 PNG，README 用其中 7 张）。删除 `docs/embedding.md`、`docs/image-generation.md`（内容已在 W11 迁 `skill/references/images.md`）；`source.js` 的 dshSource 注释删除。全仓扫描已无 `docs/embedding|docs/image-generation|docs/archive|docs/specs|dsh-theme|dshSource` 引用（CHANGELOG 历史与 specs/ 豁免）。
**README（中英同步）**：`v3.0.0` + `contract 3.0` + Node ≥18 + 零依赖零构建；5 命令表与 2.x 迁移表保留；编辑器能力改为 W7 最小集（文字/表格/图表内容编辑、拖动缩放/多选/参考线、页面插入删除排序、Design 面板主题/颜色/字体/外观），删除属性面板/右键/组合/对齐分布/剪贴板描述；skill 安装改为 Release `open-pptd-skill-v<ver>.zip` 或主仓 `skill/`，删除 external clone 并注明外部仓已归档；“预览=导出像素级”改为“预览与 PNG 同管线、PPTX 原生可编辑、不承诺像素级”；docs 仅链 `release-workflow.md`；7 张展示图仍走 `docs/images/`。
**CHANGELOG 3.0.0**：保留原有契约/CLI 段落，新增运行时与导出服务、类型分片、度量/表格 totalHeight/黄金 rebaseline、最小编辑器、主题/字体库、保存与导出接线、Skill 入主仓、文档与发布；历史 2.0.0 原样保留。
**docs/release-workflow.md**：3.0 CLI 5 复核、版本 bump（package/README/CHANGELOG）+ 本地守门 + tag 步骤、CI 五步、六类资产表（runtime/skill/icons/fonts/install/SHA256SUMS）、skill 安装渠道与外部仓归档、`test:docs`/`test:skill`/pack/`--only skill`；不写 npm 自动发布。
**tests/docs/run.mjs（35 项）**：docs 白名单；全仓文本扫描（git ls-files + untracked，排除 specs/、CHANGELOG、自身）；README 版本/5 命令/skill zip+主仓安装/无 external clone/无旧命令用法/仅链 release-workflow/图片存在/无像素级承诺；release-workflow 含 skill zip、资产清单、test:docs/test:skill、相对链接可解析；package.json version=3.0.0、有 test:docs、files 无 skill、零依赖；run-all 已注册。`tests/run-all.mjs` 仅 +1 行。
**package.json**：version 2.0.2 → 3.0.0；`test:docs`；files 未含 skill；无 dependencies/devDependencies。release.yml 仅把回归步骤注释改为“含 test:docs/test:skill”。
**产物**：runtime 249 文件/1.14MB；skill 82 文件/0.12MB；SHA256SUMS 默认 2 项、`--only skill` 1 项。
**语言与结构**：README 双语同步；`docs/release-workflow.md` 中文；未在 docs 新增任何功能文档。验证顺序为“先删 docs → 写 gate → 扫描自检 → 接入 run-all → bump 后 pack 干跑”。
**偏差（需 lead 知悉）**
1. `dist/` 干跑缺少 icons/fonts 两个 zip：本 worktree 的 `assets/{icons,fonts}` 无本体（find 为 0），与 lead 环境说明不一致；按红线未从主检出/其他 worktree 拷贝。本机补全本体后 `npm run pack` 即产六件套。
2. CHANGELOG 3.0.0 仍标“（开发中）”，未写发布日期（不 push/tag/发版，日期归 W14）。
3. pack-release/`package.json.files` 未改（W12 行为已符合）；release.yml 资产清单 W12 已含 skill zip，本波只改 1 行注释。
4. `tests/docs` 额外扫描 `dshSource`（工单 P1 要求），并额外断言 README 不再承诺“像素级一致”、release-workflow 含 CLI 5 复核行。
5. README 英文版 skill 安装同时给了 `unzip` 与 PowerShell `Expand-Archive` 说明；中文版给 `unzip`/`cp -r skill`。
**探索审计（只读）**：按序读 `ref/docs.md`、handoff W10/W11/W12、`ref/cli.md`、13 工单；另只读 W5/W7 handoff（totalHeight、最小编辑器能力）、README/README.zh-CN/CHANGELOG/docs/release-workflow、package.json、tests/run-all.mjs、tests/skill/run.mjs、pack-release.mjs、release.yml、source.js、editor/theme.js 第 18 行（确认 `--dsw-*` 为宿主 CSS 变量映射，非 DSH 文档引用，未改）。无全仓重读；未触碰主检出/其他 worktree；未 push/tag/merge；未改 packages/editor 功能、skill 内容、golden/projects/contract、CLI 代码。
**未决**：icons/fonts 本体缺失下的六件套最终干跑（W14/本机补本体后）；3.0.0 发布日期与 tag（lead/W14）；README 中 `open-pptd-skill` 归档后外部仓实际归档动作（lead）。

## C. 文件 / commit 指针
| commit | message |
|---|---|
| `35590bb` | docs!: 删除 embedding/image-generation 文档并清理 DSH 注释 |
| `636d053` | docs(readme): 重写 3.0 安装、CLI 迁移与最小编辑器能力 |
| `0c6806d` | docs(release): 3.0.0 CHANGELOG 与发布流程（skill zip/资产/SHA） |
| `1bf152e` | chore(release): 版本升至 3.0.0 并新增 test:docs 脚本 |
| `4bd5aed` | test(docs): 新增 docs/README 文档门禁并接入 run-all |
| （本文件） | docs(w13): 写 W13 交接 |
`git diff --stat b04a139..HEAD`：README/README.zh-CN/CHANGELOG/release-workflow/package.json/run-all/source.js/release.yml + 新增 tests/docs/run.mjs；删除 2 个 docs。零 diff：`packages/**`、`editor/**`（source.js 仅注释）、`skill/**`、`scripts/**`、`tests/{golden,projects,contract}/**`、`contract.json`、`bin/**`。
