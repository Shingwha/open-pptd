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

待 W12 合并后补：W10-W12 handoff、skill zip 路径、docs 删除清单、release 干跑命令、稳定区、已知坑。
