# W11 · Skill 合并 + 第一批 kits

> 分支/前置：W10、W6 已合并；写入范围 `skill/**`（除 shared SKILL/README 由 lead 整合）、`tests/skill/**`、`docs/image-generation.md` 迁移（删除在 W13）、`scripts/pack-release.mjs` 的 skill zip 最小接入（lead）。
> 本波把技能源迁入主仓，完成 references 拆分、images.md、4 个核心 kit；不做第二批 lecture/poster。

## 目标

- 外部 `open-pptd-skill` 源迁入 `skill/`；外部仓归档；release skill zip 目标。
- `SKILL.md` 精简为 8–12KB：定位、交付、CLI 自检、6 步流程、kit 选择、硬规则、参考索引、条件 Image plan。
- references 拆为 `format/elements/charts/design/quality/shapes/images`；删除 8 篇 slides_categories、12 风格菜单、完整字体/色表、手动 unzip 检查。
- `images.md`：吸收 docs/image-generation.md + 证据提取/授权/格式/provenance/透明/QA；作为唯一图片规则。
- kits：academic / business-review / consulting-report / brand-proposal；kit.md/theme.md/pages/fragments/README；无完整 deck/calibration demo。
- 4 套视觉体系；academic/business 克制；editorial 只品牌/poster。
- 测试：SKILL/refs 链接、旧命令 lint；kit fragments 组装 check/build；skill 包内容。

## 范围

- `skill/` 目录、kits、refs；`tests/skill/`；`docs/image-generation.md` 内容迁移后删除（主仓文件删除在 W13）。
- SKILL.md 3.0 命令：open/build/check/assets/doctor；删除旧命令；条件 Image plan。
- `pack-release` skill zip（lead）；release workflow 在 W13。
- 不改 engine/editor/CLI（已 W10）。

## 非目标

- 不做 lecture/poster kits（W12）。
- 不做完整 demo/calibration 在 skill。
- 不做外部仓镜像（归档）。
- 不保留旧 slides_categories/12 风格/全表。

## 验收

1. 全量回归 + CLI/contract 绿；skill lint 绿。
2. references 拆分完整、互链可达；SKILL.md 无旧命令/旧路径。
3. 4 kits 的 kit.md/pages/fragments 存在；fragments 组装 check/build 通过（占位/示例内容有说明）。
4. 无完整 starter deck/无 calibration demo 在 skill；kit.md 有反同质化规则。
5. images.md 覆盖原图优先/条件生图/搜图/透明/provenance/PPT 接线；无主仓 docs 链接。
6. skill zip 内容清单正确（可 W12/W13 最终产出；本波至少 pack 干跑）。

## 前置上下文

待 W10 合并后补：CLI 5、Theme/Font library API、W9 image/PNG、W6/W10 handoff、skill 旧内容位置、稳定区、已知坑。
