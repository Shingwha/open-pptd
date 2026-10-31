# W14 · 终验 / 发布候选

> 分支/前置：W13 已合并；写入范围仅最终报告/必要的跨模块小修（lead 决定）；不改功能。
> 本波只做全量验证、三入口/核心路径抽验、发布候选报告；不 push/tag/发版。

## 目标

- 全量门禁：`node tests/run-all.mjs`、dep-graph、contract、e2e render、incremental（可选）、export/PNG parity、table/measure、theme/font、image alpha、CLI surface、skill kits、docs。
- 三入口抽验：
  - 浏览器：open → Home/Editor → 打开示例/本地项目 → 内容编辑/页面操作 → 保存/reload → 导出 PPTX/PNG/包。
  - CLI：open/build/check/assets/doctor；PPTX/PNG/bundle；JSON/严格/错误。
  - Skill：`skill/` 安装形态 → doctor → 选 kit → 生成/预览/check/build → zip。
- Golden 终态：默认 deck 无意外 diff；表格 rebaseline 二次稳定；PNG chart scale 1/2 清晰。
- 文档/发布：docs 只剩 release+images；README/CHANGELOG/release-workflow；skill zip；无旧命令/旧链接。
- 汇总遗留清单/等用户指令项；清理 worktree（保留分支）；不 push/tag。

## 验收

1. 全量门禁真实全绿（贴用例数/失败项）；浏览器/Office 外部依赖 SKIP 有原因。
2. 浏览器/CLI/skill 三入口核心路径全部通过。
3. 无已删 docs/旧 CLI/旧 API/旧深路径/死 UI 残留。
4. skill 6 kits check/build；skill zip 内容/SHA；外部仓归档说明。
5. 透明 PNG/图表 DPR/表格 totalHeight/主题 apply/font 全局库抽验。
6. 最终报告：改动总览、决策登记、遗留/后移、发布候选 hash；无未决阻塞。

## 前置上下文

待 W13 合并后补：W13 handoff、全量命令、已知 SKIP、发布干跑结果、稳定区、已知坑。
