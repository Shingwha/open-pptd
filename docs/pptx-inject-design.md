# PPTX 注入器设计（open-pptd inject）

> 状态：设计定稿 ｜ 日期：2026-08 ｜ 范围：**仅元素级注入（语义 A）**
> 前置阅读：`references/pptd.md`（元素模型）、`editor/writer/*`（elementToXml 复用点）、`docs/pptx-import-design.md`（独立能力，本文不依赖它）

---

## 1. 背景与目标

用户手上有一个现成的 PPTX（可能是他人制作、含复杂内容、不想重建），希望**只增加内容、不改动原有内容**——典型场景：往某页注入公式、图表、图片、文本、表格等。

**核心约束：原内容 100% 不变。** 因此本方案**不经过 pptd 中转**（那会丢失 importer 不支持的 SmartArt/动画/母版等），而是在 OOXML 层做**增量注入**：

```
现有 pptx ──zip 解压──▶ 目标 slideN.xml 的 spTree 末尾追加元素 XML 片段
                        → 配套更新 rels / [Content_Types].xml → 重新打包
```

原有节点一个字节不动——SmartArt、动画、母版、旧字体嵌入全部原样保留。

**与 pptx→pptd 导入器的关系**：完全独立、互不依赖。导入器是"读 + 重建"，注入器是"只写不读"。本文不涉及导入器。

---

## 2. 核心设计思想

### 2.1 注入 = 字符串插入，不是解析

对现有 slideN.xml，注入器只做**定位 + 插入**，不理解其内容。唯一需要"读"的东西是三个数字：

1. 现有 `cNvPr` 的 id 最大值 → 新元素 id 从 max+1 开始；
2. 现有 rels 的 rId 最大值 → 新图片/chart 的 rId 从 max+1 开始；
3. 目标 `p:sldSz`（EMU 尺寸）→ 宽高比判断。

### 2.2 元素 XML 复用 writer（关键决策）

"元素模型 → OOXML 片段"是最复杂的转换（公式的 `mc:AlternateContent + a14:m`、13 种图表的整套部件、187 种形状的 geometry），**writer 的 `elementToXml` 已经全部实现**。注入器构造一个"假 ctx"（nextId / 图片注册 / chart 注册回调）喂给 writer，白捡全部能力：

| 能力 | 复用点 |
|---|---|
| 元素 → XML 片段 | `editor/writer/*` 的 `elementToXml`（类型注册表分派） |
| 公式 | `editor/writer/text.js` 的 `buildFormulaRun`（`\(...\)` → 原生可编辑公式） |
| 图表部件全套 | `editor/writer/chart.js` 的 `buildChartParts`（chartN.xml + rels + 内嵌 xlsx） |
| 字体嵌入 | `editor/writer/font.js` 的 `buildEmbeddedFonts`（取字体 → 子集化 → EOT fntdata + XML 注册片段） |
| 形状/图标 | `editor/writer/shape.js` / `icon.js` |
| 打包 | `editor/writer/zip.js` 的 `ZipWriter` |

### 2.3 颜色解析零处理

writer 生成 XML 片段时内部已调用 `resolveColor(theme, "$primary")` → 输出 `a:srgbClr val="RRGGBB"`。**片段里不存在 $token**，注入器不需要读目标主题、不需要做任何颜色映射。解析所用的 theme 就是 PPTD 项目自己的 theme → **注入结果与 PPTD 预览所见即所得**。

---

## 3. 输入输出形态

```
open-pptd inject <deck.pptd> --page <K> --target-slide <N> [-o out.pptx]
```

| 参数 | 含义 |
|---|---|
| `<deck.pptd>` | PPTD 项目 manifest（含 pages/、media/） |
| `--page K` | 取该项目第 K 页（1-based）的 `elements[]` |
| `--target-slide N` | 目标 pptx 的第 N 页（1-based） |
| `-o out.pptx` | 输出文件（默认 `<原文件名>_injected.pptx`，原件不动） |
| `--z <pos>` | 可选：插入层级（0 = 最底层，默认最顶层） |

语义：**语义 A（元素级注入）**——PPTD 第 K 页的全部元素追加到目标 PPT 第 N 页。PPTD 页面的 `background` / `notes` **不注入**（页面级属性，属于"插入新页"语义，不在本方案范围）。

---

## 4. 总体架构

```
lib/pptx-inject.js                        # 新增，~400-600 行
  ├─ readZip(bytes)                       # 最小 ZIP 读取器（central directory + inflateRawSync）
  ├─ loadDeck(manifest)                   # 复用 editor/core/pptd-io.js → deck 模型（取第 K 页）
  ├─ scanSlideIds(slideXml)               # cNvPr id 最大值
  ├─ scanRelsIds(relsXml)                 # rId 最大值
  ├─ buildElementXml(deck, page, ctx)     # 复用 elementToXml；ctx 收集 media/chart 部件
  ├─ injectIntoSlide(slideXml, fragment)  # 定位 spTree 的 grpSpPr 结束处 → 插入
  ├─ registerMedia(pkg, files)            # 图片字节 → ppt/media/ + slide rels 追加
  ├─ registerChart(pkg, parts)            # chart 部件落盘 + rels + [Content_Types] 登记
  └─ writeZip(pkg, outPath)               # 复用 ZipWriter 重打包
```

复用资产：
- `editor/core/xml-parser.js`：解析 PPTD 页 / 扫描 id（零依赖）
- `editor/core/pptd-io.js`：parseDeck
- `editor/writer/*`：elementToXml / buildChartParts / ZipWriter
- `editor/core/theme.js`：resolveColor（writer 内部使用）

---

## 5. 详细流程（数据流）

```
1. 读目标 pptx：zip 解压 → presentation.xml、[Content_Types].xml、
   目标 slideN.xml + 其 rels、theme1.xml（仅读 sldSz）
2. 读 PPTD：parseDeck → deck.theme + deck.pages[K-1].elements
3. 扫描：slideN.xml 的 cNvPr id 最大值；slide rels 的 rId 最大值
4. 构造 writer ctx：nextId / mediaRef（rId 分配）/ chartRef（chart 编号分配）
5. 逐元素调用 elementToXml → XML 片段集合 + 收集到的媒体/图表部件
6. 坐标处理：
   - 宽高比一致（PPTD size vs 目标 sldSz）→ 坐标直接 ×12700 落 EMU，零误差
   - 不一致 → 等比缩放 + 警告（"目标 16:9，PPTD 4:3，已缩放"）
7. 插入：slideN.xml 的 spTree 中 grpSpPr 之后追加片段（--z 控制层级）
8. 增量登记：媒体文件、chart 部件、rels 行、[Content_Types] 声明
9. 重打包输出 out.pptx（原件不动）
```

---

## 6. 元素类型注入成本

| 类型 | 注入成本 | 说明 |
|---|---|---|
| text（含公式） | 纯 XML 片段 | 零部件 |
| shape / line | 纯 XML 片段 | 零部件 |
| table | 纯 XML 片段 | 零部件 |
| icon | 视 writer 实现 | 若转形状则纯 XML；若转图片则同 image（实现时确认） |
| image | 媒体文件 + rels 一行 | 字节写 `ppt/media/` |
| chart（13 类） | 整套部件 | chartN.xml + rels + 内嵌 xlsx + content-types 声明；writer 已产出全部字节，注入器只做落盘 + 编号 + 登记 |

全部类型走同一条注入管线，差异只在"部件收集"环节的分支。

---

## 7. 关键设计决策

1. **id / rId 编号**：扫描现有最大值 +1 递增；PowerPoint 只要求 cNvPr id 在 slide 内唯一，跨 slide 可重复，无需全局管理。
2. **插入位置**：spTree 固定结构 = `nvGrpSpPr` + `grpSpPr` + 元素…，片段插在 `grpSpPr` 之后；末尾 = 最顶层，`--z` 可指定插入到第 n 个元素后。
3. **命名空间**：`a:` / `p:` 前缀在 slide 根已声明，writer 片段直接可用，零处理。
4. **颜色**：writer 内部用 PPTD 的 theme 解析 $token → hex（见 §2.3）。不做"映射到目标主题槽位"（可选增强，默认不启用）。
5. **字体嵌入**：默认随注入一起嵌入 PPTD 声明用到的字体。复用 `buildEmbeddedFonts(deck)` 产出的 fntdata 部件 + embeddedFontLst XML + rels 条目，注入器只做增量登记：
   - `parts` 字节落盘 `ppt/fonts/fontN.fntdata`（编号从现有最大值+1）；
   - presentation.xml 按 schema 顺序（notesSz 之后）插入 `embeddedFontLst`，已存在则合并条目；
   - presentation.xml.rels 追加 rId；`[Content_Types].xml` 补 `.fntdata` Default 声明（缺失时）；
   - **去重**：目标已嵌入同名字体则跳过；
   - **许可边界**（沿用现有逻辑）：fsType 不可嵌入的字体跳过；微软雅黑等系统字体仍只声明不嵌入；CFF 字体回退全量嵌入。
   - 只嵌入 PPTD 声明用到的字体，原 PPT 的字体渲染完全不受影响。
   - 目标 PPT 缺字体且未嵌入时，打印缺失字体警告清单。
6. **背景 / 备注 / 过渡**：不注入（页面级属性；目标 PPT 的过渡动画原样保留）。
7. **页面尺寸**：1px = 12700 EMU 为固定换算；宽高比一致即天然 1:1，与 PPTD size 数值无关。

---

## 8. 校验策略

1. **结构校验**：复用 `tests/package-integrity.mjs`——注入后 ZIP 完整性、slide 结构、content-types 一致性。
2. **往返测试**：examples 项目 export 出 pptx → 注入测试元素（每类元素各一个）→ 校验：
   - 原 slide 元素数量 +1（或 +N）；
   - 新元素 id/rId 无冲突；
   - PowerPoint 打开无修复提示（渲染抽查）。
3. **幂等性**：同一注入操作重复执行两次，第二次不破坏第一次的结果（id 扫描基于现值，天然幂等）。
4. **人工 QA**：`serve` 预览注入前后的对比（可选）。

---

## 9. 边界与降级

| 情况 | 处理 |
|---|---|
| 加密 / 损坏的 pptx | 明确报错，不输出 |
| 找不到 spTree / grpSpPr（非标准结构） | 报错不注入（防御性，不猜测） |
| `--target-slide` 超出页数 | 报错 |
| `--page` 超出 PPTD 页数 | 报错 |
| 图表部件注入失败（编号/声明冲突） | 跳过该元素 + 警告，其余元素照常 |
| 目标为 PowerPoint 2007 旧格式 | 公式/新图表等新特性降级警告 |
| 元素坐标超出目标页边界 | 照常写入（PowerPoint 允许元素出界），打印提示 |

---

## 10. 实施路线图

| 阶段 | 内容 |
|---|---|
| P1 | 最小 ZIP 读取器 + 纯 XML 类型（text/shape/line/table）注入 + CLI + 结构校验 |
| P1.5 | 字体嵌入登记（复用 buildEmbeddedFonts，含去重/许可边界） |
| P2 | image（媒体搬移）/ chart（整套部件）注入 |
| P3 | 往返测试完善、字体缺失警告、坐标缩放逻辑 |
| 可选增强 | $token → 目标主题槽位映射、背景注入、`--all-pages` 批量注入（每页 logo/页脚） |

---

## 11. 结论

- 注入器是三条路线中**最简单**的一条：不解析原文件、不重建骨架，只做"writer 成品 XML 片段 → 字符串插入 + 小范围登记"。
- 全部元素类型（含公式、13 种图表）通过复用 `elementToXml` **天然全支持**，无需逐类型实现。
- 原内容 100% 不变是架构保证（不动原节点），而非尽力而为。
