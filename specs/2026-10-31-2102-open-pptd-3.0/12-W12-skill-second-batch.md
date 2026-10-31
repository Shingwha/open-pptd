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

待 W11 合并后补：W11 handoff、skill lint/kit 测试、zip 打包命令、稳定区、已知坑。
