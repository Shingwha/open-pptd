# docs · 主仓文档清理与引用迁移

> 目标：主仓只保留发布相关文档与 README 资产；嵌入/生图/归档/DSH/旧 specs 删除；所有代码/测试/README 引用同步更新；skill 是内容唯一源。

## 1. 最终结构

```text
docs/
  release-workflow.md       # 发布流程
  images/                   # README/画廊截图（资产，不是文档）
specs/
  2026-10-31-2102-open-pptd-3.0/   # 本次活跃 spec；完成后可删
```

- 不再有 `docs/embedding.md`、`docs/image-generation.md`、`docs/archive/`、DSH 文档。
- `docs/images/` 约 3.5MB，README 引用；保留；若未来要极致瘦身再迁移压缩。
- `specs/` 只保留活跃 3.0 spec；旧 `2026-09-30-ui-redesign-line/**`、`specs/ref/**` 删除。

## 2. 删除清单

| 路径 | 原因 | 前置动作 |
|---|---|---|
| `docs/archive/**` | 1.x/2.0 历史设计稿、integration-plan、旧 specs、editor-design-reference.html | 无；git 历史保留；确认无活跃引用 |
| `docs/embedding.md` | 用户只保留 release 文档；不再单独维护嵌入契约 | 代码/测试注释改指 contract.json/tests/README |
| `docs/image-generation.md` | 内容迁入 `skill/references/images.md` | 先完成迁移/扩展，再删 |
| `specs/2026-09-30-ui-redesign-line/**` | 已完成 UI spec | DSH requirements 已删；无活跃引用 |
| `specs/ref/dsh-theme-mapping.md` | 不再适配 DSH | 无 |
| `specs/2026-09-30-ui-redesign-line/ref/dsh-theme-requirements.md` | 不再适配 DSH | 无 |
| `docs/archive/README.md` | 随 archive 删除 | 无 |

**不删**：`docs/release-workflow.md`、`docs/images/**`、`README*`、`CHANGELOG.md`、`tests/**`（测试说明保留但更新引用）、`examples/**`。

## 3. 执行顺序（避免断链）

1. **W1 阶段**：删除 `docs/archive/**`、已完成 specs、DSH 文档；更新仍保留的文档/代码中对它们的引用（archive/DSH）。
2. **W10/W13 阶段**：删除 `docs/embedding.md` 前，先改：
   - `packages/index.js`、`packages/model/index.js`、`packages/paths.js`、`packages/server/index.js`、`editor/index.js`、`tests/contract/public-api.mjs` 的 “see docs/embedding.md” 注释 → `contract.json` + `tests/contract/public-api.mjs` + README。
   - `tests/contract/README.md` 的旧 spec 路径 → contract tests/README。
3. **W11 阶段**：把 `docs/image-generation.md` 内容吸收进 `skill/references/images.md`；删除主仓文件；确保 skill 内无指向主仓 docs 的链接。
4. **W12/W13**：更新 `docs/release-workflow.md`、README、pack-release/release workflow；检查 docs 链接；运行 docs 检查。
5. **W14**：最终 `npm run test:docs`（新增）确认无断链、无旧命令、无已删文档引用。

## 4. 必须更新的引用

### 4.1 代码注释

- `packages/model/font.js:4` → 删除对不存在的 `docs/pptx-font-embedding.md` 的引用。
- `packages/model/theme-presets.js:10` → 删除对不存在的 `docs/editor-v2-ux.md` 的引用。
- `packages/model/index.js:5-6` → 删除对 `docs/specs/ref/integration-plan.md` 的引用；指向 `contract.json` / contract tests。
- `packages/cli/bin.js:4` → 删除 `integration-plan appendix D.9`；CLI 契约以 `ref/cli.md` / README 为准。
- `packages/index.js:12`、`packages/paths.js:2`、`packages/server/index.js:27`、`editor/index.js:6`、`tests/contract/public-api.mjs:2`、`:82` → 删除 `docs/embedding.md` 引用；改为 `contract.json` + `tests/contract/public-api.mjs`。
- `packages/cli/ensure.js` 在 3.0 删除，相关注释随文件消失。
- `scripts/pack-release.mjs:15` → “内容面已迁到独立 skill 仓”改为“skill 在主仓 `skill/`，release 产出 skill zip”。
- `.github/workflows/release.yml` 注释/资产列表 → 加 skill zip；外部 skill 仓归档说明。

### 4.2 测试/README/发布

- `tests/contract/README.md:23` → 删除 `docs/specs/01-engine-api.md`；指向 `contract.json` + contract tests。
- `README.md` / `README.zh-CN.md`：
  - skill 安装：外部 `git clone open-pptd-skill` → 下载 release skill zip（或从主仓 `skill/` 拷贝）。
  - 删除/更新 docs 链接（embedding/image-generation/archive/DSH）。
  - `docs/images` 图片路径保留。
  - 3.0 CLI 命令更新（open/build/check/assets/doctor）。
  - “preview=export”表述更新为图像基准 + 原生 PPTX（由 README 改版波次执行）。
- `docs/release-workflow.md:85` → 外部 skill 仓链接删除；说明 skill zip 随 release。
- `CHANGELOG.md` → 保留历史；3.0 条目新增“skill 回归/文档清理/无兼容”。
- `scripts/pack-release.mjs`：skill zip 产出一个新资产；docs 仍不进 runtime zip；skill zip 单独列出。
- `package.json files`：不加入 `skill/`（CLI runtime 包保持干净）；skill 走 repo/release zip。

## 5. 文档规范

- 主仓 docs 只允许 release-workflow.md（发布流程）与 images/。
- 任何架构/契约/设计说明不再进 `docs/`：
  - 机器可读契约：`contract.json` + contract tests；
  - 人类说明：README/CHANGELOG/spec（活跃）；
  - AI 内容：`skill/`。
- 不允许“临时文档”长期留在 docs；完成后删除或进 spec。
- 不允许双份：`docs/image-generation.md` 删除后，只存在 `skill/references/images.md`。
- 文档语言：spec 中文；README 双语；`docs/release-workflow.md` 中文（现有）。

## 6. 文档检查（新增 `npm run test:docs`）

- 扫描 `docs/**`、`README*`、`specs/<active>/**`、代码注释中的相对文档链接：
  - 目标文件存在；不指向已删 `docs/embedding.md`/`docs/archive`/DSH/旧 specs；
  - 不出现过时 CLI 命令（serve/export/export-project/render/ensure/paths/gallery/fonts/icons）作为当前用法；
  - skill 引用指向 `skill/` 内文件；不指向主仓 docs；
  - `docs/` 只含 release-workflow.md + images/。
- 检查应在 W13/W14 运行；W1 删除 archive/specs 后先跑一次。

## 7. 取舍

- **删除 embedding.md**：下游没有独立嵌入文档；契约由 `contract.json` + tests + README 承担。用户明确只保留 release 文档；若未来有宿主，重新写一份简短 embedding 文档（新 spec），不复用旧归档。
- **删除 DSH 文档**：不再适配 DSH；不再维护 `--dsw-*` 映射。
- **不删除 docs/images**：README/画廊依赖；不是文档内容。
- **不保留 archive**：git 历史足够；archive 会继续误导读者。
