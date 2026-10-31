# W12 · Skill 第二批 kits + skill 测试/发布

> 分支/前置：W11 已合并；写入范围 `skill/kits/{lecture,poster}/**`、`tests/skill/**`、`skill/README.md`（lead）、release skill zip（lead）。
> 本波补齐 6 kit 覆盖并完成 skill 发布资产；不改 engine/CLI。

## 目标

- 新增 lecture / poster kits：kit.md/theme.md/pages/fragments/README；沿用 4 体系（lecture=instructional，poster=editorial 单页）。
- 6 kits 全量：fragments 组装 check/build；kit 索引/README；反同质化规则。
- skill 测试：refs 链接、命令 lint、kit 检查、无 demo/calibration、zip 内容/SHA。
- `pack-release` 产出 `open-pptd-skill-v<ver>.zip`；release workflow 上传；skill README 安装说明。
- 与 3.0 一起发；外部仓归档说明。

## 范围

- kits lecture/poster；tests/skill；skill README；pack-release/release workflow（lead）。
- 文档：skill 安装改为 zip；不再外部 clone；DSH 无。
- 不改 engine/editor/CLI（已定）。

## 非目标

- 不再新增 kit/style（6 kit/4 体系封顶）。
- 不做 calibration demo 在 skill。
- 不做主题/字体编辑器扩展。

## 验收

1. 全量回归 + CLI/contract 绿。
2. 6 kits 的 fragments 组装 check/build 全通过；kit index 完整；academic/business 视觉纪律检查。
3. skill lint 无旧命令/断链/主仓 docs 链接；无 demo/calibration。
4. skill zip 产出、SHA、内容清单正确；release workflow 资产列表包含。
5. 安装文档更新；外部仓归档说明；无 2.x 兼容命令。
6. 写入范围外零 diff；无新增依赖。

## 前置上下文

- 必读顺序：`ref/skill.md` §3.2/§4/§8 → `handoff/W11-worker.md` → `ref/cli.md` §4 → 本工单。
- 基线命令（开工先跑，贴真实输出）：`node tests/skill/run.mjs` → 67/67；`node tests/run-all.mjs` → 38/38；`node bin/open-pptd.js --help`；`node scripts/pack-release.mjs`（当前只产运行时/资产 zip）；dep-graph/contract。
- 现有事实（lead 已核实）：`skill/` 已有 SKILL/README/7 refs/4 kits/13 fragments；`tests/skill/run.mjs` 的 `KITS` 仍是 4 个（第 98 行）；`scripts/pack-release.mjs` 只产 runtime/icons/fonts + SHA256SUMS，无 skill zip；`.github/workflows/release.yml` 上传 `dist/*`（无需改功能，只更新资产清单注释/校验）；`skill/README.md` 已写 release zip/主仓两种安装，但 zip 尚不存在；`package.json` 无 `test:skill` script。
- 稳定区（勿重读/勿改）：`packages/**`、`editor/**`、`skill/SKILL.md`（除必要两行）、`skill/references/**`、4 个既有 kit、`tests/run-all.mjs`、`tests/golden/**`、`tests/projects/**`、`contract.json`。
- 已知坑：pack-release 从 git tracked/untracked（排除 ignored）收集；dist/ 被忽略；skill zip 顶层必须是 `open-pptd/`；不能把 tests/demo/媒体打进 skill；6 kit 的 fragments 必须能组装 `check/build` 且 error=0；零新增依赖。

## 本波实施口径（lead 已拍板）

1. **lecture kit**（system=instructional）：`skill/kits/lecture/{kit.md,theme.md,pages/*.md,fragments/*.page}`；页面 recipe 至少 objective/concept/example/walkthrough/practice/summary（可合并），theme 2–3 方向，大字号/步骤清晰；fragments ≥2（真实 YAML，无缺失媒体/字体）。
2. **poster kit**（system=editorial，单页）：`skill/kits/poster/...`；recipe 覆盖 title/abstract/method-data/results/conclusion/references-QR 的单页分区与视觉层级；明确“不把 16:9 拉成海报”，画布比例/安全区/信息密度规则；fragments ≥1（单页 poster，deck size 非 16:9）。
3. **kits/README.md** 增加 lecture/poster 行；6 kit 选择表完整；SKILL.md 仅在未列时最小补 lecture/poster 两行，保持 8–12KB。
4. **tests/skill**：KITS 扩为 6；新增 `tests/skill/zip.mjs`（或并入 run.mjs）——运行 `node scripts/pack-release.mjs --only skill`，检查 `dist/open-pptd-skill-v<ver>.zip` 条目：顶层 `open-pptd/SKILL.md`、`open-pptd/references/{7}.md`、`open-pptd/kits/README.md`、6 个 kit 的 kit.md/theme.md、≥1 fragment；无 tests/demo/media/脚本；SHA256SUMS 含该 zip 且哈希匹配。测试后清理生成的 dist 文件。
5. **pack-release**：`--only skill` 只产 skill zip；默认仍产全部。skill zip 顶层 `open-pptd/`，内容 `skill/{SKILL.md,README.md,references/**,kits/**}`（不含 `.git`/测试/媒体）；加入 `produced` 与 SHA256SUMS；日志/注释更新为“skill zip”。
6. **release workflow**：注释/资产清单加入 `open-pptd-skill-v<ver>.zip`；上传仍 `dist/*`；可加一步校验 skill zip 存在。
7. **package.json**：新增 `test:skill` 脚本（`node tests/skill/run.mjs`）；run-all 已含 skill 行，不重复。
8. **README/文档**：`skill/README.md` 安装说明与 zip 名称对齐（必要时补 SHA 校验一句）；`docs/release-workflow.md` 的 skill zip 说明本波最小补（W13 终稿）。
9. **允许改动**：`skill/kits/{lecture,poster}/**`、`skill/kits/README.md`、`skill/SKILL.md`（仅必要两行）、`skill/README.md`、`tests/skill/**`、`scripts/pack-release.mjs`、`.github/workflows/release.yml`、`package.json`（仅 scripts）、`docs/release-workflow.md`（最小）、handoff。其他零 diff。
