# W13 · Docs 清理终态 + 发布流程

> 分支/前置：W10、W11、W12 已合并；写入范围 `docs/**`、`README*`、`CHANGELOG.md`、`scripts/pack-release.mjs`、`.github/workflows/release.yml`、`package.json files`、`tests/docs/**`。
> 本波完成用户要求的 docs 清理：只留发布文档 + README 资产；更新发布资产（skill zip）。

## 目标

- 删除 `docs/embedding.md`、`docs/image-generation.md`（W11 已迁）、`docs/archive` 残留、DSH/旧 specs；docs 只留 `release-workflow.md` + `images/`。
- 删除所有代码/测试/README 对已删 docs 的引用；`npm run test:docs` 链接/旧命令检查。
- 更新 `docs/release-workflow.md`：3.0 CLI、skill zip、外部 skill 仓归档、资产列表/SHA。
- 更新 README/README.zh-CN：skill 安装 release zip；3.0 命令；不再 external skill clone；docs 链接；保留 images。
- `pack-release` 产出 skill zip；release workflow 上传；`package.json files` 不包含 skill（CLI 包干净）。
- Golden 终态：确认 W5 后无意外 diff；必要时最终稳定性检查。
- 不做功能变更。

## 范围

- docs/README/CHANGELOG/release scripts/workflows/package files/tests/docs。
- 删除 docs/embedding/image-generation/archive/DSH/旧 specs；保留 release-workflow/images。
- 文档链接/命令检查；release 干跑；skill zip 内容。
- 不碰 engine/editor/CLI/skill 内容（除安装说明/引用）。

## 非目标

- 不改功能/接口；不再新增 docs。
- 不保留 embedding 文档（用户选择 release-only）。
- 不做 push/tag/发版（只干跑/报告）。

## 验收

1. 全量回归 + contract/dep-graph + skill 测试绿。
2. `docs/` 只剩 `release-workflow.md` + `images/`；旧 docs/specs/DSH 不存在。
3. `npm run test:docs`：无断链/无旧命令/无已删文档引用；README/代码注释干净。
4. `npm run pack` 干跑产出 skill zip + runtime/icons/fonts（本机有资产时）；SHA/内容正确；release workflow 资产列表。
5. README/README.zh-CN/release-workflow 的 skill 安装/命令/资产说明正确；外部仓归档说明。
6. golden 稳定；无意外 diff；无新增依赖。

## 前置上下文

- 必读顺序：`ref/docs.md`（删除清单/顺序）→ `handoff/W10-worker.md`、`W11-worker.md`、`W12-worker.md` → `ref/cli.md` → 本工单。
- 基线命令（开工先跑，贴真实输出）：`node tests/run-all.mjs` → 38/38；`node tests/skill/run.mjs` 101/101；`node tests/cli/surface.mjs` 72/72；`node bin/open-pptd.js --help`；`node tests/tools/golden-diff.mjs`；dep-graph/contract。
- 现有事实（lead 已核实）：
  - `docs/` 仍有 `embedding.md`、`image-generation.md`（内容已迁 skill/references/images.md）、`release-workflow.md`、`images/`；`docs/archive/**`、旧 specs、DSH 已在 W1 删除。
  - README/README.zh-CN 已部分 3.0（CLI 迁移表），但仍写 `v2.0.0`、external skill clone、旧编辑器能力（属性面板/右键/组合对齐分布）、"预览=导出像素级"旧承诺。
  - `tests/docs/` 不存在；`package.json` 无 `test:docs`；`package.json.version` 仍 2.0.2；`package.json.files` 无 skill（正确）。
  - W12 的 pack-release 已产 `open-pptd-skill-v<ver>.zip`；release.yml 已含 skill zip 校验/资产说明。
  - 代码/测试对 docs/embedding|image-generation 的引用已基本清零（W10 注释清理）；`editor/app/project/source.js` 有 "adapter repo's dshSource" 旧注释需删。
- 稳定区（勿重读/勿改）：`packages/**`、`editor/**` 功能、`skill/{SKILL.md,references/**,kits/**}`（仅安装说明/引用）、`tests/golden/**`、`tests/projects/**`、`tests/contract/**`。
- 已知坑：docs 删除后不能有断链/旧命令；README 图片路径必须保留 `docs/images/`；版本 bump 后 pack 全量干跑产物名变化；不 push/tag/发版；`CHANGELOG` 历史条目保留，新增 3.0.0。

## 本波实施口径（lead 已拍板）

1. **删除**：`docs/embedding.md`、`docs/image-generation.md`（内容已迁；无替代文件）；`docs/` 终态只允许 `release-workflow.md` + `images/**`。同时删除代码/测试/README/注释中对这两个文件的引用（`editor/app/project/source.js` 的 dshSource 注释一并清理）。
2. **README/README.zh-CN 重写为 3.0**：
   - 版本 `v3.0.0`；CLI 5 + 迁移表保留；编辑器能力改为 W7 最小集（文字/表格/图表内容编辑、变换/多选/参考线、页面单页操作、Design 面板；删除属性面板/右键/组合/对齐/分布/剪贴板等描述）；
   - skill 安装改为 release `open-pptd-skill-v<ver>.zip` 或主仓 `skill/`，不再 git clone 外部仓；外部仓已归档；
   - 修正 "预览=导出像素级"：预览/PNG 同管线，PPTX 为原生可编辑导出（不承诺像素级）；
   - docs 只链 release-workflow；保留 docs/images 展示图；contract 3.0 / Node ≥18 / 零依赖零构建。
3. **CHANGELOG**：新增 `3.0.0` 条目（Breaking：CLI 5、contract 3、旧 API/深路径/internal 删除、最小编辑器、主题/字体库、表格 totalHeight、golden rebaseline、skill 入主仓）；保留历史。
4. **docs/release-workflow.md**：3.0 CLI、skill zip、外部 skill 仓归档、资产清单（runtime/icons/fonts/skill/install/SHA256SUMS）、`npm run test:docs`/`test:skill`、版本 bump/打包/发布步骤；不写未实现的自动发布。
5. **pack-release**：确认默认产出 runtime + skill + icons/fonts（本机有本体时）+ install + SHA，`--only skill` 仍可用；版本 3.0.0；干跑并贴产物清单/大小/SHA 项数。`package.json.files` 不含 skill。
6. **tests/docs**：新增 `tests/docs/run.mjs`（自跑，lead 接入 run-all）：
   - docs 目录仅 release-workflow.md + images/**；
   - 全仓扫描（排除 CHANGELOG 历史/spec 组/node_modules）无 `docs/embedding|docs/image-generation|docs/archive|docs/specs|dsh-theme` 引用；
   - README/README.zh-CN 含 5 命令、skill zip/主仓安装、无 external clone、无旧 `serve/export/render/ensure/paths/gallery/fonts/icons` 用法；
   - docs/release-workflow 资产清单含 skill zip；
   - `package.json.files` 无 skill；`package.json.version` 与 README 头一致。
7. **package.json**：version 3.0.0；scripts 加 `test:docs`；files 不含 skill；不新增依赖。
8. **验证**：run-all 39/39（新增 docs）、skill 101/101、CLI surface 72/72、golden 零漂移、pack 干跑资产清单。写 handoff（A/B/C，60–80 行）。
9. **允许改动**：`docs/**`、README/README.zh-CN、CHANGELOG.md、`scripts/pack-release.mjs`（如需最终资产）、`.github/workflows/release.yml`（资产说明）、`package.json`（version/scripts/files）、`tests/docs/**`、`tests/run-all.mjs`（一行）、`editor/app/project/source.js`（仅注释）、handoff。其他零 diff。
