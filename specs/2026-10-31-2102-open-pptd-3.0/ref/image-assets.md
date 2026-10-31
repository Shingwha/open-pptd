# image-assets · 图片资产系统（证据 / 数据 / 表达 / 结构 / 品牌）

> 唯一规则将落在 `skill/references/images.md`；本文件是 3.0 设计依据。主仓 `docs/image-generation.md` 迁入后删除。
> 核心：**证据与表达分开**；原图优先；生图/搜图只在工具存在且用户 opt-in 时使用；透明走 PNG alpha。

## 1. 资产分类

| 类型 | 例子 | 来源 | 规则 |
|---|---|---|---|
| 证据图/表 | 论文 figure、实验照片、显微图、archival、报告图表 | 用户原文件/论文 | 原图优先；保留图号/caption/来源；**永不生成** |
| 数据图/表 | KPI、趋势、对比、结果表 | 用户数据 | 原生 chart/table；数据可核对；简单指标可原生重绘并标注 |
| 概念/插图/背景/纹理 | hero、概念图、背景、纹理、透明物件 | 生图/授权图库/用户 | 工具存在 + 用户 opt-in；只做表达；不冒充证据 |
| 结构图 | 流程、架构、关系、时间线 | 原生 shapes/charts/tables/icons | 优先可编辑原生元素；不生图 |
| 品牌资产 | logo、VI、产品图、官方照片 | 用户提供 | 不生图、不伪造；按品牌规范 |

## 2. 来源优先级

1. 用户原始图片/论文 actual figure/table；
2. 从真实数据原生重绘的 chart/table（标注“重绘自来源”）；
3. 授权/官方图库；
4. 生成图（仅表达，经用户同意）；
5. 原生 shapes/icons 或省略。

- 数据/证据/论文图/logo/真实人物/产品/新闻现场：**永不生成**。
- 学术默认不用 stock/生图；商业可选装饰/hero；品牌/poster 可生图为主。

## 3. 论文/文档提取

工具（Agent 有什么用什么，不硬依赖）：

- MinerU（PDF→Markdown + images/tables）
- PyMuPDF/pdfimages、pdftotext（PDF 图像/文本）
- OCR（扫描件）
- Pandoc/python-docx（docx/html）
- 截图/网页抓取（URL）
- Pillow（裁剪/格式转换/alpha）

流程：

1. 提取正文、figures、tables、图注/表注、公式、引用信息。
2. 逐图核对完整性：坐标轴、图例、单位、误差棒、子图、标注；不要用截断/拆散的半张图。
3. 方法图、复杂证据、实验照片、显微图、archival：**原图**；保留图号/caption/来源；不重绘、不生成。
4. 简单最终指标（结果表、KPI、对比数字）：数据可靠提取时，可用原生 chart/table 重绘；必须核对数字并标注“重绘自 [来源]”。
5. 表格：可靠数据 → 原生 table；复杂表格 → 原图；公式优先 LaTeX/OMML，不能转再用图片。
6. 图片存 `media/`，`fit: contain`，不裁剪坐标轴/图例；caption/来源脚注必须有。
7. 提取失败/缺图：向用户要原图或 placeholder；**绝不生成“像论文图”的图**。
8. 记录 `assets-sources.md`：文件/URL、作者年份、图号/表号、license/授权、提取工具/版本、hash。

学术 kit 默认不生图；页面配方直接带 evidence figure/table slots、caption/source 规则。

## 4. 生图（image generation）

### 4.1 触发条件

- **只有 Agent 确实有 image-gen 工具时才询问**；没有工具 → 不问、不承诺、直接原生/省略。
- 只有页面计划确实需要非证据视觉（概念/背景/透明物件）时才问；不需要视觉的 deck 不问。
- 用户 opt-in 才生成；默认关闭。
- 访谈只问一次，包含：是否允许生图、用途、透明、隐私（是否可把资料/提示发给外部服务）、风格。
- 用户拒绝 → 本 deck 不再询问；走原始资料/授权图/原生图形。

### 4.2 允许范围

- 允许：概念插图、hero、背景/纹理、透明物件、图标 family（内置 FA 不够时）、装饰 lettering（逐字核对 + 原生标题 dual-layer）。
- 禁止：数据/图表/表格/实验图/论文图、logo/VI、真实人物/产品/新闻现场、未核实文字。
- 学术默认不生图；商业只在同意时做装饰/hero；品牌/poster 可为主。
- 生成图是栅格图，不可编辑；数据/结构优先原生。

### 4.3 风格与产物

- 沿用现有 `docs/image-generation.md` 的 style contract：
  - 一套 deck 一个 images contract；
  - 按 family 生成（固定风格前缀，只换 subject），不逐图漂移；
  - 固定 negative prompt：no text/watermark/border；
  - subject 约 65% 画面，≥10% 安全边；匹配放置比例，2× 分辨率；
  - 生成文字仅限已逐字核对的 lettering；原生可编辑标题保留。
- 记录 `assets-prompts.md`：family、prompt、模型/工具/版本、seed、用户授权、用途、透明处理。
- 输出转 PNG；透明见 §6。

## 5. 图库搜索

- 只在 Agent 有 search 工具且页面计划需要外部图时问一次；默认关闭。
- 只用有授权/官方来源；记录 URL/license；学术默认不用 stock；商业/品牌用授权图库。
- 不伪造来源/水印/杂志封面/机构标识；不使用未授权图片。
- 与生图分开授权；用户拒绝后不再问。

## 6. 透明图片

引擎：PNG/JPEG/GIF；PNG alpha 原字节嵌入（PPTX/PowerPoint 支持）；WebP/SVG/AVIF 不支持，转 PNG。

路线（按可用性排序）：

1. **Native alpha**：模型直接输出透明 PNG。
2. **Key-color matting**：prompt 远离画面/主题的 solid key color；Pillow 转 alpha；适合 lettering/图标。
3. **AI matting**：rembg/U2Net；适合剪影，不适合细边缘/发光/lettering。
4. **Base-color avoidance**：只有 full-bleed/明确分区才用背景色伪装；主题切换/叠放会破。

规则：

- 透明统一 PNG；JPEG 无 alpha，GIF 透明边缘差。
- 浅色/深色背景各检查：无白边、无 halo、无洞、无残留底色。
- 学术证据图不抠背景；透明主要给商业/品牌图标、物件、hero。
- 加**透明 PNG 回归测试**：渲染/导出后确认 alpha/字节未被压平；引擎不改，除非测试失败。
- 分辨率 2× 放置尺寸；透明大图注意 PPTX 体积。

## 7. PPTD / engine 接线

- `media/<family>_<name>.png`；`elementType: image`；`fit: contain`（证据图）/`cover`（照片）/`fill`（拉伸）；`crop` 只用于设计裁切，不裁数据图。
- 页面背景图：`background: {type: image, src, fit: cover}`；留 text-safe zone/overlay。
- 图片尺寸/分辨率：按显示 2×；压缩；避免超大 PPTX；不放大低清图。
- 透明 alpha：PNG；不压平；不转 JPEG。
- caption/source：学术图/表必须有图号/caption/来源；商业数据图有 source line。
- 生成图/搜图：记录 provenance；不生成证据。
- 现有引擎不需要 WebP/SVG 支持；skill/Agent 转换。

## 8. Skill / kits 集成

- `skill/references/images.md`：唯一规则（本文件的设计落地）。
- `SKILL.md` reference map 增加 images.md；只在涉及图片/论文/海报时读。
- 需求访谈的 Image plan：条件触发；工具存在才问；默认否。
- kits page recipes 的 image slots：
  - academic：evidence figure/table、caption/source、默认不生图；
  - business：chart/table、source line、可选 hero/背景（授权）；
  - consulting：原生结构图/证据图为主；
  - brand/poster：generated/transparent hero（授权 + style contract）；
  - lecture：示意图/例子，优先原生。
- `quality.md` 图片检查：来源/caption/单位/图号、无裁剪/拉伸、透明边缘、文件大小、生成图非证据、prompt/来源记录。
- 测试：透明 PNG、格式转换、media 落盘；论文提取依赖外部工具，不做 CI 硬依赖。

## 9. 旧文档迁移

- `docs/image-generation.md` 的内容保留“生图/透明/PPT 接线/清单”部分，并补上证据提取、授权、格式、provenance、scenario 规则；迁入 `skill/references/images.md` 后删除主仓文件。
- 不保留双份；主仓 docs 只留 release-workflow + images。

## 10. 验收

- 论文项目：原图/原生重绘混合可用；图表完整、caption/source、无生成证据。
- 生图：无工具不问；有工具默认否；用户同意后只做表达；prompt/来源记录。
- 透明 PNG：预览/PPTX alpha 保留；浅/深底无 halo；回归测试通过。
- 图片格式：PNG/JPEG/GIF；WebP/SVG 转换；不支持格式明确报错。
- kits page recipes image slots 可用；skill lint/kit check/build 通过。
