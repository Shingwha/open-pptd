# W10 · Skill 分发（CLI install）+ README 精简

> 分支由 lead 派工时创建。最高约束：不改引擎/编辑器/示例内容；只动 skill 分发、CLI assets、打包、README/docs 展示。

## 目标

1. **Skill 安装入口统一**：release zip（稳定名 + 版本名）+ 新增 `open-pptd assets skill install --dir <skills-dir>`；runtime 包携带 `skill/`；外部 `open-pptd-skill` 仓归档为指针。
2. **README 精简**：只保留一张主图 `docs/images/editor.png`；删除 example 展示图片/链接与冗长功能表/原理段；中英文同步。
3. `docs/images/` 只保留 `editor.png`；`tests/docs` 的图片规则同步收紧；`docs/release-workflow.md` 更新资产/安装说明。
4. 不新增测试套件（用户要求测试克制）；只更新受影响的现有测试/检查。

## 前置上下文

- 必读：`handoff/W13-worker.md`（docs/release）、`handoff/W12-worker.md`（skill zip）、`ref/skill.md` §8、`ref/cli.md` §4。
- 基线：`run-all` 39/39；`tests/cli/surface.mjs` 72/72；`tests/skill/run.mjs` 101/101；`tests/skill/zip.mjs` 10/10；`tests/docs/run.mjs` 35/35；`golden` 23/144。
- 现状：
  - `scripts/pack-release.mjs` 产 `open-pptd-skill-v<ver>.zip`；runtime WHITELIST 不含 skill；`package.json.files` 不含 skill。
  - `packages/cli/assets.js` 有 list/sync/clean/themes/fonts；`runAssets` 未分发 skill。
  - `packages/paths.js` 有 `PACKAGE_ROOT`；CLI 可用 `skill/` 源目录。
  - README 目前有 example 图片网格、较长功能表/原理段；`docs/images` 有 editor/gallery/brand-mori/business-review/poster-* /xiaohongshu 等；`tests/docs/run.mjs` 要求 docs/images ≥6 且 README 图片路径存在。
- 稳定区：`packages/**`（除 cli/assets.js、paths 只读）、`editor/**`、`examples/**`、`tests/projects/**`、`tests/golden/**`、`contract.json`、`skill/**` 内容（只改 README 安装段）。

## 工单

### T1 runtime 包携带 skill
- `package.json.files` 增加 `skill`；`scripts/pack-release.mjs` 的 WHITELIST 增加 `skill`（runtime zip 含 `open-pptd/skill/**`）。
- 确认 runtime zip 仍不含 tests/docs/examples；`contract.json`/CLI 5 不变。

### T2 `assets skill install`
- `packages/cli/assets.js` 新增 `assetsSkill(args)`：
  - `open-pptd assets skill install --dir <skills-dir> [--force] [--json]`
  - 目标 = `<skills-dir>/open-pptd`；`--dir` 必填（错误码 `ERR_USAGE`，提示 Claude Code `~/.claude/skills`、pi `~/.pi/agent/skills`）；`~` 展开；创建父目录。
  - 源 = `<PACKAGE_ROOT>/skill`；递归复制；目标已存在且非空时默认拒绝（`ERR_SKILL_EXISTS`），`--force` 先删再装；复制后统计文件数。
  - 人类文本 stderr；`--json` stdout 单行 `{ok,source,target,files}`；失败 `{ok:false,error:{code,message}}`。
  - 不联网；不读 user home 资源；不改 skill 内容。
- `packages/cli/bin.js` 的 assets help 增加一行 `assets skill install --dir <skills-dir>`；`runAssets` 分发 `skill`。
- 抽验：临时目录安装 → `open-pptd/SKILL.md` 存在；重复安装拒绝；`--force` 覆盖；`--json` 单行解析。

### T3 稳定 release 资产
- `scripts/pack-release.mjs` 在版本 zip 之外写 `dist/open-pptd-skill.zip`（同一字节副本；默认与 `--only skill` 都产出）；加入 SHA256SUMS（版本 zip + 稳定别名两行）。
- release workflow 已上传 `dist/*`，无需改上传逻辑；更新注释/资产说明（稳定名用于 latest URL）。
- 验证：`npm run pack` 与 `--only skill` 产出两文件；`sha256sum -c`；zip 内容仍单顶层 `open-pptd/`、无 tests/媒体/脚本。

### T4 README 精简
- README.md / README.zh-CN.md 重写为简洁结构：
  1. 标题 + 一句话价值 + 一行 badges（版本/MIT/Node/零依赖）；
  2. 唯一主图 `docs/images/editor.png`；
  3. 30 秒安装 + CLI 5 条速查（open/build/check/assets/doctor）；
  4. 和 AI 一起用：skill 安装（优先 CLI `assets skill install --dir`；其次 release 稳定 zip；主仓 `skill/` 作为源码回退）；外部仓已归档；
  5. 4–6 条能力要点（AI 生成 PPTD、最小编辑器、PPTX/PNG、主题/字体、6 kits）；
  6. 迁移说明压缩为链接 CHANGELOG/README 小表或 3 行；
  7. License。
- 删除 example 图片网格、长功能表、长原理段、重复的 preview/export 说明；保留必要事实（预览/PNG 同管线，PPTX 原生可编辑）。
- 删除 `docs/images/` 除 `editor.png` 外的所有图片（含 gallery.png、brand-mori、business-review、poster-*、xiaohongshu）。
- `skill/README.md` 安装段改为 CLI 优先 + 稳定 zip + 主仓 copy；不链外部仓 clone。

### T5 docs/tests 同步
- `docs/release-workflow.md`：资产清单加入稳定 `open-pptd-skill.zip`、CLI install 示例、外部仓归档说明。
- `tests/docs/run.mjs`：docs/images 规则改为**只允许 editor.png**（或至少要求 editor.png 且 README 只引用它）；保持 docs 只剩 release-workflow+images。
- `tests/skill/zip.mjs`：若稳定别名/新增 SHA 行影响断言，做最小更新（仍校验版本 zip 与 SHA；别名存在性可抽验但不新增套件）。
- 不新增测试；CLI 安装以手工抽验记录。
- 回归：run-all 39/39、cli surface 72/72、skill 101/101、skill zip、docs 35/35、golden 23/144；pack 干跑；写 handoff W10-worker.md（A/B/C，50–70 行）。

## 验收

1. runtime 包含 `skill/`；`assets skill install --dir` 可用（成功/拒绝/force/JSON）；help 有入口。
2. release 产出版本 zip + 稳定 `open-pptd-skill.zip`，SHA 正确；zip 内容合规。
3. README 只有 `editor.png` 一张图；example 图片/链接/长段落删除；中英文一致、内容精简。
4. docs/images 仅 editor.png；tests/docs 更新且通过；docs/release-workflow 说明正确。
5. run-all/cli/skill/docs/golden 全绿；写入范围外零 diff；无新增依赖/测试套件。

## 禁触清单

`packages/**` 除 `cli/assets.js`/`cli/bin.js`（help/dispatch）；`editor/**`、`examples/**`、`skill/**` 内容（仅 README 安装段）、`tests/projects/**`、`tests/contract/**`、`tests/golden/**`、`contract.json`。

## 交接 / 报告

最后 commit 写 `specs/2026-11-01-0743-open-pptd-3.1/handoff/W10-worker.md`：CLI 用法/错误码、runtime/zip 清单、README 删除清单、tests 更新、pack 产物/SHA、e2e/门禁、偏差、探索审计。
