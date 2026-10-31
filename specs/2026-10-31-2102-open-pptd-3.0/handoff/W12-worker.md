# W12 handoff · Skill 第二批 kits + skill 测试/发布
> 分支 `feat/3.0-w12-skill2`，起点 `main 46197b9`（W1–W11 已合并）；Windows 10.0.28120 + Git Bash + Node v24.21.0；零新增依赖。
> 写入范围：`skill/kits/{lecture,poster}/**`、`skill/kits/README.md`、`skill/SKILL.md`（+2 行）、`skill/README.md`、`tests/skill/**`、`scripts/pack-release.mjs`、`.github/workflows/release.yml`、`package.json`（仅 scripts）、`docs/release-workflow.md`（最小）、本文件。

## A. 自测真实输出
```text
# 开工基线（46197b9）
$ node tests/skill/run.mjs → 结果: 67/67 通过 ✅（warnings recorded: 0）
$ node tests/run-all.mjs → 37/38，唯一失败「公式转换 — 缺少 tests/fixtures/formula/mml/」
$ node tests/tools/dump-formula-mml.mjs → KaTeX MathML 生成: 204/204；再跑 run-all → 38/38 ✅（fixtures 为生成物，未入库）
$ node bin/open-pptd.js --help → “open-pptd 3.0 · 5 个命令”（open/build/check/assets/doctor）
$ node scripts/pack-release.mjs → open-pptd-v2.0.2.zip（249 文件，3.75MB → 1.13MB）+ install.ps1/sh + SHA256SUMS（1 项）；icons/fonts 本机无本体，跳过
$ node tests/regression/dep-graph.mjs → ✓ 依赖方向与环境全局检查通过；node tests/contract/public-api.mjs → 契约通过 ✅
# 完工（最终代码）
$ node tests/skill/run.mjs → 结果: 101/101 通过 ✅（warnings recorded: 0）；exit 0
$ npm run test:skill → 结果: 101/101 通过 ✅（warnings recorded: 0）；exit 0
$ node tests/skill/zip.mjs（独立运行）→ 结果: 10/10 通过 ✅
$ node tests/run-all.mjs → 结果: 38/38 通过 ✅
$ node scripts/pack-release.mjs --only skill → open-pptd-skill-v2.0.2.zip：82 文件，0.25MB → 0.12MB；SHA256SUMS（1 项）
$ node scripts/pack-release.mjs（默认）→ 运行时 249 文件/1.13MB + skill 82 文件/0.12MB + install.ps1/sh + SHA256SUMS（2 项）
$ node bin/open-pptd.js check tests/projects/text/deck.pptd → 0 个错误，14 个警告；exit 0
$ node bin/open-pptd.js build tests/projects/text/deck.pptd --format pptx -o <tmp> --json → ok=true，pages=8，141748 B
$ node tests/regression/dep-graph.mjs → ✓；node tests/contract/public-api.mjs → 契约通过 ✅
$ tests/skill 每 kit 组装：academic 4 页 / business-review 3 / consulting-report 3 / brand-proposal 3 / lecture 3 / poster 1；check 0 error、build pptx ok，合计 warnings=0
# skill zip 证据
总 82 条；顶层唯一 open-pptd/；SKILL.md+README.md 2；references/*.md 7；kits/*.md 56（README + 6×kit/theme + 43 pages）；fragments 17
分布：academic 15 / business-review 12 / consulting-report 12 / brand-proposal 12 / lecture 12 / poster 9
SHA256: e13890cb200f11dd2670319b2a364ff7d4883f1f4da90232744d87255b228169  open-pptd-skill-v2.0.2.zip
```
## B. 实现、结构、偏差与审计
**lecture kit（instructional）**：`kit.md` 4.4KB（受众/叙事/必选 7 页/密度/证据/do-don't/反同质化/页序示例）；`theme.md` 3.1KB（Chalk & Ink / Blueprint Classroom / Studio Amber 三方向 seed + 3 字体搭配 + 大字号表）；`pages/` 7 篇（cover/objective/concept/example/walkthrough/practice/summary，均含 Slots/Variants/Selection/字号密度/证据/Do-Don't）；`fragments/` 3 个真实单页 YAML（objective-steps / worked-example / practice-check，960×540、无媒体、无 notes）。
**poster kit（editorial 单页）**：`kit.md` 6.0KB（阅读顺序、A 系列 1:√2 画布、安全区 ≥6%/72px、字号与密度、证据/QR 规则、do-don't、反同质化、分区示例图）；`theme.md` 3.1KB（Conference Ivory / Poster Blue / Night Gallery 三方向 + 字体搭配 + A2 字号表）；`pages/` 6 篇（title/abstract/method-data/results/conclusion/references-qr，按单页分区与视觉层级写，各 2–3 个变体）；`fragments/poster-a2-portrait.page` 单页 1191×1684（1:1.414，明确非 16:9），含标题带、摘要、方法/数据三块、主图占位、关键数字栏、结论、参考文献与 QR 占位，check/build 0 warning。
**选择表与入口**：`kits/README.md` 增 lecture/poster 两行并标注 poster 为 editorial 单页；`SKILL.md` 仅补两行（9921 B，仍在 8–12KB），未改流程/refs。

**6 kit 全量**
| kit | 体系 | pages | fragments |
|---|---|---|---|
| academic | academic | 9 | 4 |
| business-review | executive | 7 | 3 |
| consulting-report | executive | 7 | 3 |
| brand-proposal | editorial | 7 | 3 |
| lecture | instructional | 7 | 3 |
| poster | editorial（单页） | 6 | 1 |

**tests/skill**：`KITS` 扩为 6、`SYSTEM` 增 lecture=instructional/poster=editorial；新增 `CANVAS`（默认 960×540，poster 1191×1684），fragment bounds 按 kit 画布校验（不再硬编码 960×540）；新增 poster 断言（画布非 16:9 且纵向、kit.md 明确 16:9 拉伸禁忌）。新增 `tests/skill/zip.mjs`：运行 `node scripts/pack-release.mjs --only skill`，自研中央目录解析读取 zip，断言顶层 `open-pptd/`、SKILL/README/7 refs/kits/README、6 kit 的 kit.md+theme.md、每 kit ≥1 `.page`、无 tests/demo/media/示例目录、无脚本/字体/图片/zip 等二进制、无空文件/重复条目、SHA256SUMS 含该 zip 且哈希匹配；结束后只删除本次新建的 dist 文件并还原原有 SHA256SUMS。`run.mjs` 末尾调用 `skillZipTests(ok)`，故 `npm run test:skill`/run-all 单行即可覆盖。
**pack-release**：重构为 `packRuntime/packSkill/packAssetZips/packInstallScripts/writeSums`；新增 `--only skill`（只产 skill zip + SHA；未知目标报错退出 1）；skill zip 内容严格 `skill/{SKILL.md,README.md,references/**,kits/**}`，条目名 `open-pptd/...`，来源 `git ls-files --cached --others --exclude-standard -- skill`（工作树新建文件也能进包）；默认（无 flag）产出运行时 + 资产 + install + **skill zip**，SHA256SUMS 覆盖全部 zip；日志/头注释同步为 skill zip 口径。
**release workflow**：头注释资产清单加入 skill zip（顶层 open-pptd/、含 SKILL/README/references/kits）；打包步骤在 `npm run pack` 后校验运行时 zip 与 skill zip 均存在，否则失败；上传仍 `dist/*`。
**package/docs**：`package.json` 仅加 `"test:skill": "node tests/skill/run.mjs"`；`skill/README.md` 安装段补 SHA256SUMS 校验一句；`docs/release-workflow.md` 打包行改为六类资产、新增 skill zip 说明并替换过时的独立技能仓说法（W13 可再润色）。
**与工单/spec 偏差（需 lead 知悉）**：
1. 工单 P5 括号“默认行为不变”与「默认仍产全部」并存：本波取“默认产出原有全部资产 + 新增 skill zip”。理由：ref/skill.md §1/§8 要求 release 产出 skill zip，release.yml 单次 `npm run pack` 后上传 `dist/*` 且 SHA 只有一次写入；若默认不产 skill，CI 需二次打包并会覆盖 SHA。`--only skill` 仍可单独复验。若 lead 要求默认不产 skill，只需把 `packSkill()` 移入非 ONLY 分支的取舍处。
2. 基线 run-all 37/38 因本地缺 `tests/fixtures/formula/mml/`（生成物）；按 W11 同法生成 204/204 后 38/38，未提交 fixtures、未改测试。
3. poster fragment 的图与 QR 使用 shape 框 + 文本占位（fragment 禁用本地媒体，测试与 kit 规则一致）；真实海报需替换为 `media/fig-1.png` 与真实二维码。
4. 测试画布按 kit 参数化（poster 1191×1684），4 个既有 kit 仍 960×540，行为不变；新增断言使“不把 16:9 拉成海报”成为回归项。
5. golden 未运行（需 Chrome/头less PNG）：`tests/golden/**` 零 diff，run-all 全绿；视觉基线由 W14/发版前执行。
**探索审计（只读）**：specs 的 ref/skill、ref/cli、12-W12 工单、handoff/W11；既有 4 kit 的 kit/theme/page/fragment 样例、kits/README、SKILL.md、skill/README；tests/skill/run.mjs、tests/run-all.mjs 列表、tests/projects/text、tests/golden 目录；scripts/pack-release.mjs、release.yml、docs/release-workflow.md、package.json、assets/fonts/registry.json；为定位 geometry 警告读了 packages/model/validate.js、packages/model/model.js（deckSize）、packages/layout/index.js 与 packages/measure 的导出签名（只读，未改）。无全仓重读；未触碰主检出与其他 worktree；未跑 PNG/Chrome；未 merge/push/tag。

## C. 文件 / commit 指针
| commit | message |
|---|---|
| `187c613` | feat(skill): 新增 lecture/poster kit，补齐 6 kit 与选择表 |
| `3780e87` | test(skill): KITS 扩为 6，新增 skill zip 条目与 SHA 回归 |
| `129814d` | feat(release): pack-release 产出 skill zip（--only skill）并在 release 校验 |
| `1a72d0e` | docs(skill): 安装与发布说明对齐 skill zip 与 SHA256SUMS |
| （本文件） | docs(w12): 写 W12 交接 |
`git diff --stat 46197b9..HEAD`：30 文件，+2196/−68（22 新增、8 修改）。新增：lecture 12 文件、poster 9 文件、`tests/skill/zip.mjs`。修改：SKILL.md(+2 行)/kits/README(+2 行)/skill/README/tests/skill/run.mjs/pack-release/release.yml/package.json/docs/release-workflow.md。
零 diff：`packages/**`、`editor/**`、4 个既有 kit、`skill/references/**`、`tests/run-all.mjs`、`tests/golden/**`、`tests/projects/**`、`contract.json`、README/README.zh-CN。
**未决**：`package.json.version` 仍 2.0.2（发版 W13/W14 bump）；主 README/README.zh-CN 安装入口的 skill zip 表述（W13）；`docs/release-workflow.md` 终稿（W13）；外部 `open-pptd-skill` 仓库归档动作（lead）；PNG 视觉抽验与 golden 基线（W14/发版前）；skill zip 的 CI 实测（本机已用 --only/默认两种路径验证）。
