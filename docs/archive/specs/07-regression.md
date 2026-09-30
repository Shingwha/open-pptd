# Spec · 回归红线与门禁（07-regression）

> 对象：所有 agent 与 lead。红线破坏 = 该 commit 打回重做。

## 红线总表

| # | 红线 | 验证方式 |
|---|---|---|
| 1 | 全量回归 20/20 | `node tests/run-all.mjs`；**独立确认退出码**（`echo $?`），不用管道吞 |
| 2 | 分层纪律 | `node tests/regression/dep-graph.mjs`（既有四条 + 各波新增） |
| 3 | CLI 行为不变 | 既有八命令抽验（serve/export/check/render/gallery/fonts/icons/export-project），新增命令只增不改 |
| 4 | 浏览器三入口 | `?deck=` / 无 `?deck`（画廊）/ `?shot=1` 全部正常 |
| 5 | 截图管线 | `node tests/tools/ui-shots.mjs` 可用；`window.__pptdEditor/__pptdIo/__pptdShot` 存续 |
| 6 | 句柄/增量/包完整 | `handle-io.mjs`、`e2e/incremental-load.mjs`、`package-integrity.mjs` 全绿 |
| 7 | UI 波次隔离 | `git diff main -- packages/` 为空（仅 U1/U2） |
| 8 | 资源解析（W2 起） | 删 `~/.open-pptd`（或用 OPEN_PPTD_HOME 指向空目录）后 CLI 与 serve 照常；home 存在过期 registry.json 不影响行为 |
| 9 | 渲染黄金基线（W5 起） | `node tests/tools/golden-diff.mjs`：非表格页哈希全一致；表格页差异逐页目检进白名单；非白名单漂移 = 打回 |

## 每波门禁（lead 合并前执行）

- W1：红线 1–6 + `tests/contract/public-api.mjs`
- W1.5：红线 1–2 + 契约测试（editor 断言收紧后）
- W2：红线 1–6、8 + 契约测试（paths/config 断言）
- W3/W4：红线 1–5、7 + 截图走查（浅深两套）+ 各 spec 手动用例清单
- W5：全部红线 + 三入口手工终验 + `npm pack --dry-run` 产物清单终验

## serve 用法（验证编辑器时）

`node bin/open-pptd.js serve --project tests/projects/chart`（前台，Ctrl-C 停）——**勿用 python http.server**（MIME/路径语义不同）。验证完确认进程已停（`netstat -ano | grep 55173` 或直接换端口）。

## 截图走查

`node tests/tools/ui-shots.mjs` 生成 `tests/ui-shots-out/`（gitignore，不入库）；agent 用 Read 工具目检 PNG。基线 = W0 时点 main 的输出；U1 后仅选中态外观允许变化，其余页面渲染不得漂移；U2 后 chrome/顶栏/状态条按设计稿变化属预期。
