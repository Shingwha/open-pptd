# W11 handoff · Skill 合并 + 第一批 kits
> 分支 `feat/3.0-w11-skill`，起点 `main 608753c`（W1–W10 已合并）；Windows 10.0.28120 + Git Bash + Node v24.21.0；零新增依赖。
> 写入范围：`skill/**`、`tests/skill/**`、`tests/run-all.mjs`（仅 1 行）、本文件；未触碰 packages/editor/contract/docs/README/外部仓。

## A. 自测真实输出
```text
# 开工基线（608753c）
$ node tests/run-all.mjs → 36/37，唯一失败「公式转换 — 缺少 tests/fixtures/formula/mml/」
$ node tests/tools/dump-formula-mml.mjs → KaTeX MathML 生成: 204/204
$ node tests/run-all.mjs → 结果: 37/37 通过 ✅（与 lead 基线一致；fixtures 为生成物，未入库）
$ node bin/open-pptd.js --help → “open-pptd 3.0 · 5 个命令”，只列 open/build/check/assets/doctor
$ node bin/open-pptd.js check tests/projects/text/deck.pptd → 0 个错误，14 个警告；exit 0
$ node bin/open-pptd.js build tests/projects/text/deck.pptd --format pptx -o <tmp> --json → ok=true；141748 B
$ node tests/regression/dep-graph.mjs → ✓ 依赖方向与环境全局检查通过
$ node tests/contract/public-api.mjs → 结果: 契约通过 ✅
# 完工（最终代码）
$ node tests/run-all.mjs → 结果: 38/38 通过 ✅（新增 skill 套件）
$ node tests/skill/run.mjs → 结果: 67/67 通过 ✅（warnings recorded: 0）；exit 0
$ node bin/open-pptd.js check tests/projects/text/deck.pptd → 0 errors / 14 warnings；exit 0
$ node bin/open-pptd.js build tests/projects/text/deck.pptd --format pptx -o <tmp> --json → ok=true，pages=8，141748 B
$ node tests/regression/dep-graph.mjs → ✓；node tests/contract/public-api.mjs → 契约通过 ✅
# 4 kit fragment 组装实测（tests/skill 每个 kit：复制全部 fragments + 补 manifest/theme，逐 kit check+build）
academic          pages=4  check 0 error  build pptx ok  warnings=0
business-review   pages=3  check 0 error  build pptx ok  warnings=0
consulting-report pages=3  check 0 error  build pptx ok  warnings=0
brand-proposal    pages=3  check 0 error  build pptx ok  warnings=0
```
## B. 实现、结构、偏差与审计
**结构**（`git diff --stat 608753c..HEAD`：63 文件，+5564 行）：
```text
skill/
  SKILL.md                 9537 B（8–12KB 内）：6 步流程 / 硬规则 / 参考索引 / kit 选择 / 条件 Image plan
  README.md                安装（release zip 或主仓 skill/）、维护、外部仓归档说明
  references/              format/elements/charts/design/quality/shapes/images（7 篇，约 56.5KB）
  kits/README.md           kit 选择表与契约
  kits/academic/           academic 体系；9 recipes / 4 fragments
  kits/business-review/    executive 体系；7 recipes / 3 fragments
  kits/consulting-report/  executive 体系；7 recipes / 3 fragments
  kits/brand-proposal/     editorial 体系；7 recipes / 3 fragments
```
**SKILL 流程**：CLI 自检 → 分类+选 kit → 一轮访谈（kit/页数/扩展/来源/notes/条件 Image plan）→ 页面 map+manifest+`open --detach --json` 预览 → 填页+`check`（必要时 PNG）→ `build --format pptx` 交付。命令只用 3.0 五命令，无旧命令/手动 unzip。
**refs 拆分**：format 6505 B（manifest/page/theme/字体/路径/校验）、elements 5885 B（text/富文本/公式/shape/line/image/icon/table）、charts 6741 B（13 类型/encode/颜色/轴/导出路由/设计纪律）、design 12750 B（4 体系+网格/字号/密度/图表表格/防同质化，不列全字体色表）、quality 5957 B（证据/来源/单位/caption/placeholder/学术商业清单/交付）、shapes 8847 B（参数约定+基础/箭头/标注/括号/流程查找表+custom path）、images 9775 B（分类/来源优先级/论文提取/条件生图/搜图授权/透明四路线/provenance/PPT 接线/QA/kit 策略）。
**图片规则唯一源**：`images.md` 吸收 `docs/image-generation.md` 与 `ref/image-assets.md`；原图优先、证据永不生成、生图/搜图工具存在+用户 opt-in、透明 PNG alpha 四路线、来源/prompt 台账、PPTD 接线、QA 清单；不链主仓 docs。
**kits**：每个 kit 含 kit.md（受众/叙事/必选可选页/密度/证据/do-don't/反同质化）、theme.md（体系+3 个主题方向 seed+字体搭配+字号+motif，不写死 deck）、pages/*.md（目的/槽位/2–3 变体/选型/字号密度/图表纪律/caption/source/do-don't）、fragments/*.page（真实单页 YAML）。13 个 fragments 均无 media、无 notes、无未注册字体，bounds 在 960×540 内；kit.md 明确禁止整 deck 复制/连续重复配方。
**测试**：`tests/skill/run.mjs` 检查 SKILL frontmatter/大小/内部链接/旧命令/主仓 docs 链接；refs 7 篇；kits 文件/体系/反同质化/3 主题方向/配方变体/fragments；fragment YAML、elementId 唯一、bounds、媒体、字体（registry+systemFonts）、notes；每 kit 组装临时项目跑 `check --json` 与 `build --format pptx --json`，error 必须 0，warning 只记录（本轮 0）；skill 内无完整 deck/calibration/可执行脚本。`tests/run-all.mjs` 仅加 `["skill 知识包（SKILL/refs/kits）", "node tests/skill/run.mjs"]` 一行。
**与源内容/spec 偏差（需 lead 知悉）**：
1. 源前 36/37 因本地缺 `tests/fixtures/formula/mml/`（生成物），先跑 `dump-formula-mml.mjs` 得 204/204 后 37/37；未改测试、未提交 fixtures。
2. 源 `pptd.md` 83KB 未整篇搬运，按工单拆成 format/elements/charts；删去 12 风格菜单、27 字体全表、10×17 色表、slides_categories、手动 unzip/旧命令。
3. `lecture`/`poster` kits、`pack-release` skill zip、release workflow、`docs/image-generation.md` 删除、主 README 安装入口均按工单留给 W12/W13。
4. 测试按每个 kit 的 theme.md 方向 A 生成临时 theme（完整 16 色 token + textStyles/tableStyles）；fragments 字体（Source Han Serif CN/MiSans/Smiley Sans/Microsoft YaHei）均在校验表内；未声明 `deck.fonts`，不触发真实字体嵌入。
5. 修复过一处路线图 fragment 标题两行导致的 geometry warning（改为单行标题），最终 4 kit warnings=0。
6. `skill/README.md` 只写安装/维护/外部仓归档，不复制主 README；未复制外部 `.git`/README；外部仓未改。
**探索审计（只读）**：specs 的 ref/skill、image-assets、interfaces §11、cli、W10/W6/W9 handoff、W11 工单；外部 skill 源 `SKILL.md`、`references/{pptd,design,shapes}.md`、`slides_categories/{academic-research,analysis-decision,brand-creative,business-plan,management-report}.md`；主仓 `docs/image-generation.md`、`tests/projects/text`、`tests/projects/font-embed`、`packages/model/{theme,theme-library,validate}`、`assets/fonts/registry.json`、`tests/run-all.mjs`、`tests/lib/run.js`、`tests/cli/surface.mjs`。无全仓重读；未触碰主检出与其他 worktree；未跑 PNG/Chrome；未 merge/push/tag。
**未决**：pack-release 的 skill zip 与 release workflow（W12/W13）；主 README/README.zh-CN 安装入口指外部仓（lead/W13）；外部 `open-pptd-skill` 仓库归档动作（lead）；`docs/image-generation.md` 删除（W13）；`package.json.version` 仍 2.0.2（发版 W13/W14）；Chrome/PNG 视觉抽验未执行（本波不需要）。

## C. 文件 / commit 指针
| commit | message |
|---|---|
| `9c06726` | feat(skill): 新增 3.0 SKILL 入口、安装说明与 kit 选择表 |
| `2b14a45` | feat(skill): 拆分 format/elements/charts/design/quality/shapes/images 参考 |
| `d16bcbe` | feat(skill): 新增 academic/business-review/consulting-report/brand-proposal 四个 kit |
| `91aac70` | test(skill): 新增 SKILL/refs/kits lint 与 fragment check/build 回归 |
| （本文件） | docs(w11): 写 W11 交接 |
新增：`skill/**`（61 个文件）、`tests/skill/run.mjs`。修改：`tests/run-all.mjs`（+1 行）。零 diff：packages/**、editor/**、contract.json、package.json、docs/**、tests/projects/**、tests/contract/**、README/README.zh-CN。
