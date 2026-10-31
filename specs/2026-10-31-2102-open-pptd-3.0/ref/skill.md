# skill · Skill 回归主仓与设计套件重构

> 目标：把外部 `open-pptd-skill` 的源迁入主仓 `skill/`；用“设计套件 + 页面配方”替代固定模板；精简结构、补全内容、与 3.0 CLI/theme/fonts 同步；外部仓归档。

## 1. 合并与分发

- 主仓新增 `skill/`（唯一源）；外部 `open-pptd-skill` 归档，旧 clone URL 停止。
- release 产出 `open-pptd-skill-v<ver>.zip`（顶层 `open-pptd/`，含 SKILL.md + references + kits + README）；SHA256SUMS。
- `pack-release.mjs` 增加 skill zip；`.github/workflows/release.yml` 上传；README/README.zh-CN 安装改为 release zip（或主仓 `skill/` 拷贝）。
- 不保留 2.x `serve/export/render/fonts list` 命令；skill 只面向 3.0 CLI。
- 不在 skill 内放可执行脚本；tests/脚本放主仓 `tests/skill/`，skill 目录保持文本/数据。

## 2. 目标结构

```text
skill/
  SKILL.md                     # 8–12 KB：定位、交付、CLI 自检、6 步流程、kit 选择、硬规则、参考索引
  README.md                    # 安装/维护（简短；不复制主 README）
  references/
    format.md                  # PPTD 核心格式（manifest/page/element 基础）
    elements.md                # 各元素字段，按需读
    charts.md                  # 图表类型/数据/encode/导出路由
    design.md                  # 4 套内容优先体系 + 网格/字号/密度/图表表格纪律
    quality.md                 # 证据/引用/数据来源/caption/QA 检查清单
    shapes.md                  # 形状查找表（按需读）
    images.md                  # 图片资产系统（证据/生成/搜索/透明/PPT 接线）
  kits/
    academic/
    business-review/
    consulting-report/
    brand-proposal/
    lecture/
    poster/
  kits/README.md               # kit 选择表
```

- 删除当前 8 篇 `slides_categories/*.md` 长文、12 风格菜单、完整 27 字体表、10×17 色值表；由 kits/design/quality/assets 承担。
- `pptd.md` 83KB 拆成 format/elements/charts；drift 测试同步拆。
- `design.md` 10–15KB：4 套体系；不列全字体/色表。
- SKILL.md 不复制格式细节；按需读 refs；不再要求全量读 design/pptd。

## 3. Kits / 视觉体系

### 3.1 四套内容优先体系

| 体系 | 用途 | 特征 |
|---|---|---|
| academic | 学术/技术 | 白/象牙底、严格网格、衬线/中性无衬线、单一克制强调色、图表/表格优先、无装饰 |
| executive | 商业/咨询 | 白底、单色骨架、结论式标题、稳定页眉页脚、数据/来源行 |
| editorial | 品牌/poster | 允许表达性排版/图像；一套系统、一个 motif；不做通用 AI 渐变/卡片 |
| instructional | 教育/培训 | 大字号、清晰步骤、例子、练习 |

- poster 是 editorial 的单页变体，不单独扩成 deck 风格。
- 取消 12 风格菜单；用户提供 reference/design system 时按其覆盖。

### 3.2 六个 kit（两批）

| Kit | 体系 | 典型页面 |
|---|---|---|
| academic | academic | 题目/作者、背景/gap、研究问题、方法、数据/实验、结果图/表、讨论/局限、结论/贡献、参考文献、backup |
| business-review | executive | 封面/KPI、执行摘要、趋势/驱动、分业务、风险、行动/负责人/时间、附录/来源 |
| consulting-report | executive | 问题、结论、议题树、证据、选项矩阵、建议、路线图/风险、附录 |
| brand-proposal | editorial | 背景/机会、概念、视觉系统、campaign/应用、证据、收尾/ask |
| lecture | instructional | 目标、概念、例子、练习、总结 |
| poster | editorial（单页） | 题目、摘要、方法/数据、结果、结论、参考文献/二维码 |

首批：academic / business-review / consulting-report / brand-proposal；第二批：lecture / poster。

### 3.3 页面配方 / fragments

每个 kit：

```text
kits/academic/
  kit.md                 # 受众、叙事、必选/可选章节、密度、证据规则、do/don't
  theme.md               # 体系 + 2–3 主题方向（不是固定 hex）、字体搭配
  pages/
    title.md
    gap.md
    method.md
    results-figure.md
    results-table.md
    discussion.md
    conclusion.md
    references.md
  fragments/
    results-figure-right.page
    results-table-full.page
    ...
```

- 页面配方卡：目的/读者任务、内容槽位、2–3 布局变体、选型规则、字号/密度、图表/表格纪律、do/don't、caption/source/证据要求。
- fragments：关键页面的真实 `.page` 片段（YAML），AI 复制/改编单页；**不提供完整 deck 模板**。
- 没有 calibration demo 在 skill；完整 demo 只在 `tests/skill/` 供维护者验证，AI 看不到、不复制。
- kit.md 明确禁止整 deck 复制；fragments 只是几何参考。

## 4. 防同质化

- **无完整 deck 模板**，只有 page-level 配方/片段。
- 内容驱动选型：多系列→图表；2–3 方案→对比表/矩阵；步骤→时间线；单结论→statement；证据→figure+interpretation。
- 2–3 个布局变体；同一配方/变体不连续重复；每 deck 至少 N 种配方；可选章节按内容增删，页码不固定。
- 每 deck 自定义主题：kit 只给 2–3 主题方向 + 2–3 字体搭配；主题/颜色/字体仍由内容/品牌生成。
- 不生成完整 demo；不要求 AI 使用固定页序。
- 视觉体系是约束，不是固定模板。

## 5. SKILL.md 流程

目标 6 步：

1. **CLI 自检**：`open-pptd doctor`；缺 CLI 先报告并安装（安装写 PATH/下载脚本，先告知）。
2. **分类 + 选 kit**：新建/编辑/复刻；匹配 academic/business/consulting/brand/lecture/poster；读 kit.md + 相关 page 配方 + design 体系；不再全量读 42/83KB。
3. **一轮访谈**：kit/风格方向、页数、内容扩展、来源/引用、speaker notes opt-in；**Image plan 条件触发**（只有 image-gen 工具存在且需要非证据视觉才问，默认否；搜图独立询问、默认否）。
4. **页面 map + manifest + 预览**：按内容列页面 map，选配方/变体；写 manifest（pages/theme/fonts）；`open-pptd open <dir> --detach --json` 实时预览。
5. **填页面 + 检查**：生成 pages/media；`open-pptd check`；只在用户要求/模型能看图时 `build --format png` 抽查；修证据/溢出/对比度/来源。
6. **导出 + 交付**：`build --format pptx`；交付 PPTD 目录 + PPTX + 预览状态；不手动解压检查 transition（引擎测试负责）。

- 命令统一 3.0：open/build/check/assets/doctor；不再 serve/export/render/fonts list。
- 预览 URL 来自 `open --json`；停止 `open --stop`。
- 删除手动 unzip transition 检查；导出验证靠 build JSON/引擎测试。
- 编辑/复刻/风格迁移仍保留，但读模板/参考时按需；不读源码除非排障。

## 6. 内容补全

新增/强化：

- `quality.md`：证据/引用/数据来源、单位、caption、placeholder、无伪造、学术/商业检查清单。
- 学术 kit：research question/gap/method/evidence/contribution/limitations/references；原图优先，原生重绘只在真实数据且标注；图/表 caption/source。
- 商业 kit：结论式标题、KPI/趋势/驱动/风险/行动、source line；禁止 emotion curve/装饰 motif/装饰 SmartArt。
- 品牌 kit：概念/视觉系统/campaign/证据；允许表达，但不做通用 AI 渐变/卡片。
- 教育 kit：目标/概念/例子/练习/总结；可读性。
- 海报 kit：单页视觉层级、证据、参考文献/二维码；不把 16:9 拉成海报。
- 图片资产：见 `ref/image-assets.md`；原图优先、生图条件触发、透明 PNG。

## 7. 删除/精简

- 删 `slides_categories` 8 篇长文；场景细节进 kits。
- 删 12 风格菜单；保留 4 体系 + 用户 reference 覆盖。
- 删完整字体表/10×17 色值表；由 assets/theme library/kits 承担。
- 删手动 PPTX 解压检查；删重复 preview/export/check 说明。
- 删 skill 内 calibration demo（不在 skill 内）；删外部仓双写。
- SKILL.md 压到 8–12KB；refs 按需读。

## 8. 合并 / 发布 / CI

- `skill/` 源；外部仓归档；release skill zip。
- `tests/skill/`：
  - SKILL.md frontmatter/链接/命令 lint；
  - kit index/页面配方/fragments 存在；
  - 把 fragments 组装成测试 deck，`check` + `build --format pptx`；
  - 不把 demo 放 skill；
  - docs 链接/旧命令检查。
- drift guard：本地比较 refs ↔ engine（类型/theme/shape/font 等），不再跨仓。
- `pack-release` 产出 skill zip；release workflow 上传；README/install 更新。
- skill 与 3.0 并行开发，3.0 发布时一起发；不保留 2.x 命令。
- `npm run test:skill`（新增）纳入 CI/release gate；Chrome 可选（PNG 抽查跳过）。

## 9. 验收

- `skill/` 结构与 refs/kits 完整；SKILL.md 引用可解析；无旧命令。
- 6 kits 的 fragments 可组装 `check`/`build`；无缺资源/overflow 致命错误（若模板有占位，需 allowlist 说明）。
- 无固定完整 deck、无 calibration demo 在 skill；kit.md 有反复制/变体规则。
- 图片规则包含原图优先、条件生图、透明、provenance；`images.md` 唯一源。
- skill zip 随 release 产出；外部仓归档；README 安装更新。
- 学术/商业 kit 的视觉纪律：无卡片/渐变/装饰 motif/emotion curve；学术 default 不生图。
- 文档/命令 lint 通过；无 DSH。
