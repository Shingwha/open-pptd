# W14 · 终验报告（lead）

> 2026-11-01 · main 分支（14 波全部合并）· 未 push / 未打 tag / 未发版

## A. 全量门禁（真实输出）

```text
node tests/run-all.mjs                 → 39/39 通过 ✅
node tests/regression/dep-graph.mjs    → ✓ 依赖方向与环境全局检查通过
node tests/contract/public-api.mjs     → 契约通过 ✅
node tests/skill/run.mjs               → 101/101（6 kits 组装 check/build，warnings 0）
node tests/docs/run.mjs                → 35/35
node tests/cli/surface.mjs             → 72/72
node tests/e2e/render.mjs              → 9/9（scale=2 1920×1080，timeouts=0）
node tests/e2e/editor-minimal.mjs      → 21/21
node tests/e2e/page-ops.mjs            → 17/17
node tests/e2e/preview-shell.mjs       → 23/23（双实例/destroy/单壳/headless）
node tests/e2e/incremental-load.mjs    → 5/5
node tests/e2e/browser-export.mjs      → 15/15（真 Chrome 下载、revision 冲突、capture）
node tests/regression/parity-png.mjs   → 22/22（scale 1/2/3）
node tests/tools/golden-diff.mjs       → 24 项目/156 页字节一致，0 未登记漂移
```

## B. 三入口 / 核心路径抽验

- **浏览器**：`/editor/` 单壳 Home/Editor；双实例互不污染；editor-minimal/page-ops/preview-shell 全过；headless `/editor/?shot=1` 输出与 W7 逐字节一致。
- **CLI 5**：
  - `build chart --format pptx -o tmp` → ok，837227 B；`bundle` → ok；`png --page 2 --scale 2` → 1920×1080；
  - `check table --json` → ok、0 errors、2 warnings、资源摘要正常；
  - `open text --detach --json` → URL/port/pid 正确，`--stop --all` 清理；`doctor --json` → png.available=true。
  - 旧命令 serve/export/export-project/render/ensure/paths/gallery/fonts/icons → exit 1 + 迁移提示，stdout 空。
- **server**：`/api/save` revision/原子回滚；`/api/export-image` capture 2x 出图；`/api/themes`、`/api/fonts` 冒烟通过。

## C. 发布候选（pack 干跑）

```text
open-pptd-v3.0.0.zip        249 文件 3.75MB → 1.14MB   SHA ed953172…ed489da
open-pptd-skill-v3.0.0.zip   82 文件 0.25MB → 0.12MB   SHA cb5468c4…0ab8d0b
install.ps1 / install.sh / SHA256SUMS（2 项，sha256sum -c OK）
```

- runtime zip 顶层唯一 `open-pptd/`，无 `skill/`、`docs/`、`tests/`、`examples/`、`scripts/`、`.github/`。
- skill zip 顶层唯一 `open-pptd/`，含 SKILL.md、7 refs、6 kits（17 fragments），无 tests/媒体/脚本。
- 图标/字体资产 zip 本次跳过：仓库工作树无本体（本体在 `~/.open-pptd/assets`，且不入 git；CI 同）。装包脚本仍按需下载；如需六件套，先把本体放到 `assets/icons|fonts` 再 `npm run pack`。

## D. 遗留 / 需用户决定

1. **未 push / 未打 tag / 未发版**（按约定）。发布前需 bump/确认版本（当前 `3.0.0`）并让 CI 跑 release workflow。
2. 外部 `open-pptd-skill` 仓库的归档动作（停 clone、README 指向主仓/release zip）未在远端执行；本仓库 README/skill README 已声明归档。
3. 图标/字体 zip 需在具备本体的工作树打包；CI 上按设计跳过，由 `install` / `assets sync` 下载。
4. 已知软警告：chart/text/table 若干页存在几何 overlap warning（2.x 既有内容问题，非引擎回归）；没有 Office/WPS 原生渲染对照（按 3.0 非目标后移）。
5. 浏览器字体字节参与 capture/PPTX 的路径未用真实字体文件覆盖（本机 assets 无字节）；CLI/Node 路径已覆盖。
6. 多 full 实例同页时共享 document 主题；如宿主需要隔离，需显式指定 themeHost（W8 记录的后移项）。
