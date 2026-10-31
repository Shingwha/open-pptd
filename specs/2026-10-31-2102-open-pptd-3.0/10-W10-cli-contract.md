# W10 · CLI 5 命令 + Contract 3.0

> 分支/前置：W3、W9 已合并；写入范围 `packages/cli/**`、`bin/open-pptd.js`、`contract.json`、`package.json`、所有 barrel（lead 所有）、`tests/cli/**`、`tests/contract/**`、`tests/regression/dep-graph.mjs`、`README/CHANGELOG`（lead）。
> 本波是破坏性接口收口：没有兼容层。docs/embedding 删除在 W13；本波先改所有代码/测试引用。

## 目标

- CLI 收敛为 `open/build/check/assets/doctor`；删 serve/export/export-project/render/ensure/paths/gallery/fonts/icons 及别名。
- `open` 自动识别 manifest、Home/blank、detach/json/stop、浏览器默认；状态按项目/端口；fail-fast。
- `build` 三格式、full check、fetch/offline/strict/json、font embed、PNG 浏览器要求、bundle snapshot/raw。
- `check` 只读/JSON/strict/资源摘要；`assets` 主题/字体/图标/内置；`doctor` 路径/PNG 能力。
- `CONTRACT_VERSION=3`；contract.json/exports 加 runtime/export；删 `./internal/*`、旧深路径、旧 API/选项/shim。
- 根入口改为双端核心；server/cli 子入口；删除 renderPage/autoGrowTexts 旧兼容面。
- 更新 contract/dep-graph/CLI surface 测试、README/CHANGELOG 迁移表；删除对 docs/embedding 的代码注释（docs 文件 W13 删）。

## 范围

- packages/cli/bin.js 重写 dispatch/usage；新 open/build/check/assets/doctor；删旧业务文件（ensure/fonts/icons/gallery 等按需合并）。
- package.json exports/contract.json；barrels；contract tests；dep-graph 边表。
- README/CHANGELOG（lead）；`docs/release-workflow` 在 W13。
- tests/cli/surface；旧命令消失；JSON 单行；迁移映射。

## 非目标

- 不做 skill（W11）。
- 不做 docs 最终删除/README 完整改版（W13；最小迁移表可本波）。
- 不恢复兼容别名。
- 不改 editor 功能（W7-W9）。

## 验收

1. 全量回归 + dep-graph/contract 绿。
2. `open-pptd --help` 只 5 命令；旧命令不存在/非零；无别名。
3. open/build/check/assets/doctor 的 JSON/退出码/错误符合 `ref/cli.md`。
4. contract 3.0：exports/contract.json/barrel 一致；无 `./internal/*`/旧深路径；旧 API/shim 无残留。
5. CLI 迁移表/README/CHANGELOG 更新；代码/测试无 docs/embedding 引用（embedding 文件未删，引用已改）。
6. 无新增依赖；写入范围外零 diff（lead 文件例外）。

## 前置上下文

待 W9 合并后补：ExportService、createPreview/createEditor API、Runtime、W3/W9 handoff、CLI 旧面、稳定区、已知坑。
