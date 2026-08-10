# 组件测试项目

统一存放**针对不同类型组件的专项测试项目**，每个目录是一个完整的 PPTD 项目（含 `deck.pptd` + `pages/`），可直接 serve 到编辑器验证预览，再从网页导出 PPTX 验证 PowerPoint 渲染。

| 项目 | 覆盖组件 | 说明 |
|---|---|---|
| `text/` | text（富文本/公式/渐变/阴影/对齐/布局/图标） | 阶段 A：官方 text 格式对齐全特性验证 |

## 使用

```bash
# 启动编辑器并挂载某个测试项目
node bin/open-pptd.js serve --project tests/projects/text
```

## 测试流程（PowerPoint 参考文件比对法）

**背景**：PPTD 的导出目标是「PowerPoint 打开零修复、渲染与官方一致」。但 OOXML 的很多结构细节（子元素顺序、单位、命名空间包装）仅凭规范容易写错，PowerPoint 判损修复后效果会静默丢失。因此采用**官方文件比对法**：

### 流程

1. **构建参考文件**：用 PowerPoint 手动制作「目标效果」的样例（如渐变文字、公式混排、阴影…），文件命名为 `test-<特性>.pptx`（如 `test-gradient.pptx`），放到仓库的 `tests/reference/` 目录下，并口头告知（"已构建"）。
   - 制作方式：随便建个空演示，插入文本框，用 PowerPoint 自带功能做出目标效果，另存为该名字。
   - 注意：**PowerPoint 需关闭**（存在 `~$` 锁文件说明还没存完）。
2. **解包比对**：解压参考文件，读 `ppt/slides/slide1.xml`，找到目标效果对应的 XML 片段，与我们的 writer 输出逐字节对照，列出差异（元素顺序 / 属性单位 / 命名空间包装 / 默认值省略规则）。
3. **修复**：按官方结构修改 `editor/writer/` 对应模块，**不引入兼容旧格式的代码**。
4. **回归验证**：
   - 命令行导出测试项目：`node bin/open-pptd.js export tests/projects/text/deck.pptd -o /tmp/check.pptx`
   - 解包检查：全部 XML 部件良构（`parseXml` 逐个校验）、关键结构存在性、与参考文件结构对齐
   - 让用户网页导出 → PowerPoint 打开确认「无修复弹窗 + 效果正确」

### 已通过比对修复的历史问题（防回归清单）

| 特性 | 根因 | 修复 |
|---|---|---|
| 公式混排 | 裸 `<m:oMath>` 不是 `a:p` 合法子元素 | `mc:AlternateContent` + `a14:m` 包装（行内 `m:oMath` / 独占段 `m:oMathPara`+`m:jc`），Fallback 降级为 LaTeX 源码文本 |
| 文字高亮 | `a:highlight` 多包一层 `a:solidFill`（CT_Highlight 是 CT_Color 直接子元素） | 输出 `<a:highlight><a:srgbClr …/></a:highlight>` |
| rPr 子元素顺序 | `effectLst` 排在 `latin/ea/cs` 之后，违反 CT_TextCharacterProperties 序列 | 顺序：fill → effectLst → highlight → latin/ea/cs → hlinkClick |
| 文字/背景/形状渐变 | `a:gs pos` 单位写错（`*1000`，实际 100% = 100000） | `pos = position * 100000`（参考 `test-text.pptx` 官方 `pos="100000"`） |
| 元素翻转 | — | `a:xfrm flipH/flipV`（PowerPoint 对文字对象翻转后自动回正，属 PPT 行为，字段保留） |
| 文字透明度 | `spPr effectLst alphaModFix` 是形状填充语义，对文字无效 | run 级 `solidFill > 颜色元素 > a:alpha`（无色时用 `schemeClr tx1`，参考 test-text.pptx 透明文字） |
| 文本框自动调整 | `normAutofit` 溢出缩字，与编辑器「框随内容增高」矛盾 | `spAutoFit`（PowerPoint 原生默认）；编辑器渲染后同步 bounds 高度（view.js autoGrowTexts） |

### 参考文件存放

PowerPoint 生成的原版参考文件（用户构建、含官方存储格式）统一放 `tests/reference/`，保留原文件以便复比对：

```
tests/reference/
  test-text.pptx      # 文字：背景高亮 + 公式混排 + 渐变文字（官方结构基准）
```

新增测试项目：按组件建目录（如 `shape/`、`chart/`、`table/`），写 `deck.pptd` + `pages/*.page`，在此表登记一行。
