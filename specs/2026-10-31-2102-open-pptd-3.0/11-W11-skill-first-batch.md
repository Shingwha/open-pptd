# W11 · Skill 合并 + 第一批 kits

> 分支/前置：W10、W6 已合并；写入范围 `skill/**`（除 shared SKILL/README 由 lead 整合）、`tests/skill/**`、`docs/image-generation.md` 迁移（删除在 W13）、`scripts/pack-release.mjs` 的 skill zip 最小接入（lead）。
> 本波把技能源迁入主仓，完成 references 拆分、images.md、4 个核心 kit；不做第二批 lecture/poster。

## 目标

- 外部 `open-pptd-skill` 源迁入 `skill/`；外部仓归档；release skill zip 目标。
- `SKILL.md` 精简为 8–12KB：定位、交付、CLI 自检、6 步流程、kit 选择、硬规则、参考索引、条件 Image plan。
- references 拆为 `format/elements/charts/design/quality/shapes/images`；删除 8 篇 slides_categories、12 风格菜单、完整字体/色表、手动 unzip 检查。
- `images.md`：吸收 docs/image-generation.md + 证据提取/授权/格式/provenance/透明/QA；作为唯一图片规则。
- kits：academic / business-review / consulting-report / brand-proposal；kit.md/theme.md/pages/fragments/README；无完整 deck/calibration demo。
- 4 套视觉体系；academic/business 克制；editorial 只品牌/poster。
- 测试：SKILL/refs 链接、旧命令 lint；kit fragments 组装 check/build；skill 包内容。

## 范围

- `skill/` 目录、kits、refs；`tests/skill/`；`docs/image-generation.md` 内容迁移后删除（主仓文件删除在 W13）。
- SKILL.md 3.0 命令：open/build/check/assets/doctor；删除旧命令；条件 Image plan。
- `pack-release` skill zip（lead）；release workflow 在 W13。
- 不改 engine/editor/CLI（已 W10）。

## 非目标

- 不做 lecture/poster kits（W12）。
- 不做完整 demo/calibration 在 skill。
- 不做外部仓镜像（归档）。
- 不保留旧 slides_categories/12 风格/全表。

## 验收

1. 全量回归 + CLI/contract 绿；skill lint 绿。
2. references 拆分完整、互链可达；SKILL.md 无旧命令/旧路径。
3. 4 kits 的 kit.md/pages/fragments 存在；fragments 组装 check/build 通过（占位/示例内容有说明）。
4. 无完整 starter deck/无 calibration demo 在 skill；kit.md 有反同质化规则。
5. images.md 覆盖原图优先/条件生图/搜图/透明/provenance/PPT 接线；无主仓 docs 链接。
6. skill zip 内容清单正确（可 W12/W13 最终产出；本波至少 pack 干跑）。

## 前置上下文

- 必读顺序：`ref/skill.md`（全文）→ `ref/image-assets.md` → `ref/interfaces.md` §11（CLI 5）→ `ref/cli.md` → `handoff/W10-worker.md`、`W6-worker.md`、`W9-worker.md` → 本工单。
- 基线命令（开工先跑，贴真实输出）：`node tests/run-all.mjs` → 37/37；`node bin/open-pptd.js --help`；`node bin/open-pptd.js check tests/projects/text/deck.pptd`；`node bin/open-pptd.js build tests/projects/text/deck.pptd --format pptx -o <tmp>`；dep-graph/contract。
- 外部源（只读，不复制 .git/旧命令）：`C:/Users/shifu/.agents/skills/open-pptd-skill/`：SKILL.md（27KB）、references/pptd.md（83KB）、design.md（42KB）、shapes.md（15KB）、slides_categories/8 篇（约 116KB）。源内命令是 2.x（serve/export/render/fonts list），一律改写为 3.0。
- 现有事实（lead 已核实）：主仓无 `skill/`；`docs/image-generation.md`（7.8KB）仍存在（W13 删，本波迁移内容）；`tests/skill/` 不存在；`scripts/pack-release.mjs` 未含 skill zip（W12/W13 接）；CLI 5 已落地，`check/build` 可对临时项目运行。
- 稳定区（勿重读/勿改）：`packages/**`、`editor/**`、`tests/golden/**`、`tests/projects/**`、`tests/contract/**`、`contract.json`、`package.json`（除本波必要）。
- 已知坑：skill 里不能放可执行脚本/完整 deck/calibration demo；fragments 必须是可解析 `.page` YAML 且不引用不存在媒体；`check/build` 对占位内容可能产生 geometry warning（软失败，测试需容忍并记录）；零新增依赖；外部仓不修改。

## 本波实施口径（lead 已拍板）

1. **结构**：新建 `skill/{SKILL.md,README.md,references/**,kits/**,kits/README.md}`；不复制外部 `.git`/README；外部仓保持原样（归档说明写在 skill/README）。
2. **SKILL.md 8–12KB**：定位、交付物、6 步流程（CLI 自检→分类选 kit→一轮访谈/条件 Image plan→页面 map+manifest+预览→填页+check→build 导出）、硬规则、参考索引；命令只用 `open/build/check/assets/doctor`；按需读 refs，不复述格式细节；删除旧 unzip/transition 检查。
3. **references**（拆分，不整篇搬运）：
   - `format.md`（manifest/page/element 基础，来自 pptd.md 核心）、`elements.md`（各类型字段，按需）、`charts.md`（类型/data/encode/导出路由）；
   - `design.md`（10–15KB：4 套体系 academic/executive/editorial/instructional + 网格/字号/密度/图表表格纪律；不列全字体/色表）；
   - `quality.md`（证据/引用/数据来源/单位/caption/placeholder/无伪造/学术商业检查清单）；
   - `shapes.md`（按需查找表）；
   - `images.md`（吸收 `docs/image-generation.md` + ref/image-assets.md 的原图优先/证据提取/条件生图/搜图授权/透明四路线/provenance/PPT 接线/QA；作为唯一图片规则，不链主仓 docs）。
4. **4 kits**（首批）：`kits/{academic,business-review,consulting-report,brand-proposal}/`，每个含 `kit.md`（受众/叙事/必选可选页/密度/证据/do-don't/反同质化）、`theme.md`（体系 + 2–3 主题方向/字体搭配，不写死完整 deck）、`pages/*.md`（每页配方：目的/槽位/2–3 变体/选型规则/字号密度/图表纪律/caption）、`fragments/*.page`（关键页真实 YAML 片段，单页可复制，不引用缺失媒体/字体）。
   - 体系：academic→academic；business-review/consulting-report→executive；brand-proposal→editorial；克制、无 AI 渐变/卡片堆/装饰 motif。
   - 不提供完整 deck starter；不连续重复同一配方；kit 只给 2–3 主题方向。
5. **tests/skill**（自跑，lead 合并时接入 run-all）：`tests/skill/run.mjs` 或拆分：
   - SKILL.md frontmatter/大小 8–12KB、内部链接可解析、无旧命令（serve/export/render/ensure/paths/gallery/fonts/icons）；
   - refs/kits 结构、kit.md/pages/fragments 存在、kit 引用可达、无完整 deck/calibration；
   - 每个 kit 至少 1 个 fragment 组装到临时项目（补 manifest/theme/fonts），跑 `check` 与 `build --format pptx`，error 必须 0（geometry warning 记录但不算失败）；
   - 无主仓 docs 链接（尤其 docs/embedding、docs/image-generation）。
   Chrome 可选（不跑 PNG）。
6. **docs/image-generation.md**：内容迁移到 `skill/references/images.md`；主仓文件本波不删（W13），但 skill 不得链回它；代码/测试引用不新增。
7. **pack-release**：本波不做 zip（W12/W13）；skill/README 写清发布安装方式（release zip / 主仓 skill/）。
8. **允许改动**：`skill/**`、`tests/skill/**`、`tests/run-all.mjs`（仅加一行 test:skill；lead 复核）、handoff。其他文件零 diff。
