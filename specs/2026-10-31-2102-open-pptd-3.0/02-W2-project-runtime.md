# W2 · ProjectRuntime + ResourceProvider

> 分支/前置：W1 已合并；写入范围 `packages/runtime/**`、`tests/runtime/**`、Node adapter（CLI/server 侧）、必要契约测试。
> 本波只建共享运行时核心；不改编辑器 UI、不改 CLI 命令面、不重构导出。

## 目标

把“加载项目 → 解析 → 解析主题/字体/图片/图标 → 序列化”收进一个跨端 ProjectRuntime；Node/browser 只提供 source/provider adapter。编辑器/CLI/server 后续都通过它，禁止再写各自的 loader。

## 范围

- 新增 `packages/runtime/`（纯逻辑，无 node:/DOM）：
  - `loadProject(input,{source})`
  - `parseProject(files)`
  - `resolveProject(deck,{resources,themeLibrary?})`
  - `serializeProject(project,{mode:"snapshot"|"raw"})`
  - `checkProject(project,{resources,layout?})`
  - `ProjectSource`/`ProjectFiles`/`SourceFile`/`ResourceProvider` 类型与错误类型。
- Node adapter（CLI/server 侧 Node-only）：disk source、fs/registry provider、memory provider for tests；不在 runtime 包内引入 node:。
- 把当前 `packages/cli/export.js` 的 `loadProjectFiles`、`editor/app/project/loader/source` 的重复逻辑抽成 runtime 的调用；CLI `check` 内部先接 runtime（命令面不变）。
- 测试：memory/disk source；manifest/page/media；revision；缺失资源；serialize round-trip；checkProject 与现 check 输出对齐。

## 非目标

- 不移除 CLI 旧命令（W10）。
- 不改 editor UI（W7/W8）。
- 不改 renderer/writer/measure/table（W4/W5）。
- 不做主题/字体库（W6）。
- 不做 ExportService（W3）。

## 验收

1. 全量 `node tests/run-all.mjs` + dep-graph/contract 绿。
2. 新 runtime 测试通过；memory source round-trip；磁盘项目与现有 CLI check 输出一致。
3. 当前 `open-pptd check`/`export` 行为零变化（命令面未改）。
4. 写入范围外零 diff；无新增依赖；runtime 双端纯净（无 node:/DOM/fs）。

## 前置上下文

待 W1 合并后补：必读顺序、基线命令、稳定区、W1 handoff 摘要、已知坑。
