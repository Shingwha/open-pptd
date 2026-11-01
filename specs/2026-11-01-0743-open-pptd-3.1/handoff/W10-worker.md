# W10 handoff · Skill 分发（CLI install）+ README 精简
> 分支 `feat/3.1-w10-dist`，起点 `main d972540`；Windows 10.0.28120 + Git Bash + Node v24.21.0；零新增依赖。
> 写入范围：`package.json`（files）、`scripts/pack-release.mjs`、`.github/workflows/release.yml`、`packages/cli/{assets,bin}.js`、`README*.md`、`skill/README.md`、`docs/release-workflow.md`、`tests/docs/run.mjs`、`docs/images/**`（删除非 editor）、本文件。

## A. 自测真实输出
```text
# 开工基线（d972540）
$ node tests/run-all.mjs → 38/39（缺 tests/fixtures/formula/mml/）
$ node tests/tools/dump-formula-mml.mjs → KaTeX MathML 204/204；再跑 run-all → 39/39 ✅
# 完工门禁（最终代码）
$ node tests/run-all.mjs                    → 39/39 通过 ✅
$ node tests/cli/surface.mjs                → 72/72 通过 ✅
$ node tests/skill/run.mjs                  → 101/101 通过 ✅（warnings 0）
$ node tests/skill/zip.mjs                  → 10/10 通过 ✅（未改断言）
$ node tests/docs/run.mjs                   → 35/35 通过 ✅
$ node tests/tools/golden-diff.mjs          → 23 项目 / 144 页，字节一致 144，无未登记漂移 ✅
$ node bin/open-pptd.js --help              → 5 命令；assets 段含 skill install 一行
# CLI 手工抽验（临时目录，非仓库）
$ assets skill install                      → ✗ 需要 --dir…（Claude Code ~/.claude/skills / pi ~/.pi/agent/skills）；exit 1
$ … --json                                  → {"ok":false,"error":{"code":"ERR_USAGE",…}}；exit 1
$ … --dir <tmp>/skills                      → ✓ 已安装 skill → …\skills\open-pptd（82 个文件）；exit 0
$ ls <tmp>/skills/open-pptd                 → README.md SKILL.md kits/ references/
$ … --dir <tmp>/skills                      → ✗ 目标已存在且非空…；exit 1；--json → ERR_SKILL_EXISTS
$ … --dir <tmp>/skills --force --json       → {"ok":true,"source":…,"target":…,"files":82}
$ USERPROFILE=<tmp>/home … --dir '~/agentskills' → 目标 <tmp>/home/agentskills/open-pptd（~ 展开 ✅）
$ mkdir -p <tmp>/skills/open-pptd; …        → 空目标允许安装 ✅
# pack 干跑（package.json 3.0.0）
$ npm run pack
  ✓ open-pptd-v3.0.0.zip：336 文件 3.88MB → 1.23MB（含 skill 82；基线 254 → +82）
  ✓ open-pptd-skill-v3.0.0.zip：82 文件 0.25MB → 0.12MB
  ✓ open-pptd-skill.zip（与版本 zip 同字节副本）
  ✓ install.ps1 / install.sh；SHA256SUMS（3 项，skill 两名两行）
  ! 图标/字体本体缺失跳过（本 worktree 无本体，CI 合法产物）
  runtime SHA256 73779807854e601e3716b1e630b17328f45068cbfabcd68be45719d223fead2e
  skill   SHA256 69bd8b35c9d62cd421f23ce0c0c882bd73d10c627ec503e2b2818ff051d5fc84（v 名与稳定名相同）
$ npm run pack -- --only skill → 两 zip + SHA256SUMS（2 项）；sha256sum -c 全 OK
# zip 内容抽验
runtime：336 条；open-pptd/skill/** 82；tests/docs/examples/scripts/.github = 0
stable skill zip：82 条；顶层唯一 open-pptd/；无 tests/demo/media/scripts
```
## B. 实现、结构、偏差与审计
**T1 runtime 携带 skill**：`package.json.files` 与 `pack-release` `WHITELIST` 各加 `skill`（WHITELIST 10→11 项）；运行时 zip 含 `open-pptd/skill/{SKILL.md,README.md,references,kits}`，仍不含 tests/docs/examples/scripts/.github。contract/CLI 5 命令不变。
**T2 CLI `assets skill install`**：源 `PACKAGE_ROOT/skill`，目标 `<dir>/open-pptd`（`--dir` 必填，`~`/`~/`/`~\` 展开，自动建父目录）；递归复制并统计文件数；目标非空默认 `ERR_SKILL_EXISTS`，`--force` 先 `rm -rf` 再装；空目标允许。人类文本走 stderr，`--json` stdout 单行 `{ok,source,target,files}`；失败 `{ok:false,error:{code,message}}`，exit 1。错误码：`ERR_USAGE`（缺 --dir/未知子命令）、`ERR_SKILL_EXISTS`、`ERR_SKILL_NOT_FOUND`（源缺失）、其余回落 `ERR_SKILL`。不联网、不读 home 资源、不改 skill 内容；bin.js 只加 help 一行 + 分发。
**T3 稳定 release 资产**：`packSkill()` 写版本 zip 后 `copyFileSync` 到 `dist/open-pptd-skill.zip`（同字节，默认与 `--only skill` 都产），两者都进 `produced` → SHA256SUMS 两行同哈希。release.yml 更新资产说明，并在打包步骤加 `test -f dist/open-pptd-skill.zip` 守卫（未改上传逻辑）。
**T4 README 精简（中英一致）**：标题+一句话+badges → 唯一主图 `docs/images/editor.png` → 30 秒安装（install.ps1/sh）+ CLI 5 条（open/build/check/assets/doctor）→ 和 AI 用（A. `assets skill install --dir`；B. `open-pptd-skill.zip` 稳定名/固定版本 zip；C. `cp -r skill`；外部仓已归档）→ 6 条能力 → 3 行迁移（旧名→新名，映射链 CHANGELOG）→ License。删除：第二张 gallery 图、example 图片网格与 5 个线上画廊链接、长功能表（改为 6 条 bullet）、How it works 原理段、独立 CLI 表与 8 行迁移表。`skill/README.md` 安装段改为 CLI 优先 + 稳定 zip + 主仓 copy。删除 `docs/images/` 8 张：gallery、brand-mori、business-review、poster-artdeco、poster-bailu、poster-echo、poster-six-tea、xiaohongshu（editor.png 保留）。
**T5 docs/tests**：`docs/release-workflow.md` 资产表补稳定 `open-pptd-skill.zip`、WHITELIST 11 项与 runtime 含 skill、三种技能安装渠道（CLI/稳定 zip/主仓）、`--only skill` 两行 SHA、用户更新命令。`tests/docs/run.mjs` 三处断言：docs/images 仅 `editor.png`；README 仅引用该图；`package.json.files` 由“不含 skill”改为“含 skill”。断言数保持 35；未新增测试套件。`tests/skill/zip.mjs` 未改：稳定别名不影响既有断言（SHA 行按版本名精确匹配），cleanup 会回收新增文件；已手工验证两 zip 同字节。
**偏差（需 lead 知悉）**
1. release.yml 除注释外加了稳定别名 `test -f` 守卫（非上传逻辑改动）；若要求纯注释可删该行。
2. 基线 run-all 38/39 因缺公式 fixtures，按 W12/W13 先 `npm run test:fixtures` 得 39/39，未提交生成物。
3. 本机无 icons/fonts 本体 → 默认 pack 为 3 项 SHA（runtime + skill 两名），与 W13 同因。
4. `--only skill` 的 SHA256SUMS 只含 skill 两行（覆盖式干跑，dist 已清理）；CI 用默认 pack。
5. README 同时保留稳定名与固定版本 zip 字样（docs 门禁要求版本 zip + unzip 口径），稳定名用于 latest 固定链接。
**探索审计（只读）**：工单、`ref/repo-map.md`、W12/W13 handoff；`skill/README.md`、`scripts/pack-release.mjs`、`packages/cli/{assets,bin,errors}.js`、`packages/paths.js`（PACKAGE_ROOT）、`tests/skill/zip.mjs`、`tests/docs/run.mjs`、`tests/cli/surface.mjs`（help/JSON 断言）、`tests/run-all.mjs`、README 中英、`docs/release-workflow.md`、release.yml、package.json、`docs/images/` 清单。无全仓重读；未触碰主检出/其他 worktree/55173；未 merge/push/tag。
## C. 文件 / commit 指针
| commit | message |
|---|---|
| `a95bd44` | feat(release): runtime 包携带 skill 并新增稳定 skill zip 别名 |
| `1f866f7` | feat(cli): 新增 assets skill install --dir 安装技能包 |
| `e48c9ef` | docs(readme): 精简中英 README 并统一 skill 安装入口 |
| `dda3e98` | test(docs): 图片规则收紧为仅 editor.png，files 允许 skill |
| （本文件） | docs(w10): 写 W10 交接 |
`git diff --stat d972540..HEAD`：18 文件，+185/−215（8 删除图片）。零 diff：`editor/**`、`examples/**`、`tests/projects/**`、`tests/contract/**`、`tests/golden/**`、`contract.json`、`packages/**`（仅 cli assets/bin）、`skill/**`（仅 README）。
**未决**：版本 bump/tag 与 CI 实测（lead/W14，需 icons/fonts 本体产六件套）；外部 `open-pptd-skill` 仓实际归档动作（lead）；CLI install 无自动化测试套件（按要求只做手工抽验，后续可并入 tests/cli/surface）。
