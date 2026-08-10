# PPTD 格式完整参考

> 按需读取：写/改页面文件时参考本文；颜色令牌与色系见 `themes.md`，风格类型与排版见 `styles.md`。

## 1. manifest（`deck.pptd`）

```yaml
version: v2
title: 演示标题
gallery:                 # 可选：画廊展示元数据（新增主题时填写，manifest.json 由脚本自动生成）
  name: 商务经典
  style: mckinsey 麦肯锡商务
  color: blue 蓝色
  font: 微软雅黑
  scene: 战略汇报 / 经营分析 / 投融资路演
theme: blue            # 色系 key（见 themes.md）
fonts:                 # 可选：字体声明（不写 = 微软雅黑；推荐清单/直链/写法见 fonts.md）
  latin: Microsoft YaHei   # 默认字体（所有组件兜底）
  ea: Microsoft YaHei
  title: SimHei            # 组件字体：标题（$title）
  body: FangSong           # 正文（$body）——不同组件可配不同字体
  table: Microsoft YaHei   # 表格
  chart: Microsoft YaHei   # 图表
size: [960, 540]          # 固定 16:9
pages:
  - pages/1_cover.page
  - pages/2_toc.page
```

> 新增主题是**引擎维护者**操作：建 `themes/xx-名称/` 目录 + 写 `deck.pptd`（含 `gallery` 元数据）+ 页面文件，运行 `scripts/gen-themes-manifest.js` 自动注册到画廊。设计流程直接用 `themes/` 现成主题即可，**无需运行任何脚本**。

`fonts` 支持四种写法（由简到繁）：

1. **字符串**（全组件统一）：`fonts: KaiTi`
2. **默认字体分工**：`fonts: { latin: SimHei, ea: FangSong }`
3. **组件级**（`title`/`subtitle`/`body`/`caption`/`quote` 文字样式令牌 + `table`/`chart` 组件；缺省组件回退默认字体）：
   ```yaml
   fonts:
     title: SimHei
     body: FangSong
   ```
4. **字体资源表 + 组件槽引用**（嵌入字体推荐写法）：`fonts` 块中除 9 个组件键（`latin/ea/title/subtitle/body/caption/quote/table/chart`）外的任意键 = **字体资源**声明；组件槽与元素级 `fontFamily` 的字符串值**先查资源表**（命中取 `family`，否则当系统字体名）：
   ```yaml
   fonts:
     站酷小薇: { family: ZCOOL XiaoWei, url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/zcoolxiaowei/ZCOOLXiaoWei-Regular.ttf", subset: true }
     garamond: { family: EB Garamond, file: fonts/EBGaramond.ttf, subset: true }
     title: 站酷小薇        # 组件槽引用资源 key（解析为 ZCOOL XiaoWei）
     body: garamond
   ```
   资源字段：`family`（字体家族名，必填，与字体 name 表一致）、`file`（项目内相对路径）/ `url`（网络直链，二选一）、`subset`（可选，true = 子集化嵌入，默认全量）。

**嵌入字体**：带 `file`/`url` 的字体（资源表或组件槽内联对象）导出时嵌入 PPTX（fntdata 部件，见 docs/pptx-font-embedding.md）。浏览器端在编辑器「字体」按钮添加（本地文件/网络 URL），保存项目自动写入资源表；命令行导出按声明嵌入，`--no-embed-fonts` 关闭。元素级可用 `fontFamily` 覆盖（字符串同样先查资源表）。

## 2. 页面（`pages/xxx.page`）

```yaml
pageType: cover          # cover | toc | chapter | content | final（语义标签）
background:
  type: solid            # solid | gradient | none
  color: "#FFFFFF"       # solid 用
  # gradient 用：angle: 150, stops: [{position: 0, color: "#002143"}, {position: 1, color: "#002E5D"}]
elements: [...]          # 元素数组，见下；顺序 = 图层顺序（先写的在下层）
```

## 3. 元素（8 种）

> 注意：**字符串字段 YAML 写法通则（text / latex / 表格单元格等所有字符串）**
>
> 1. **禁止裸值**（不带引号）：含 `:`（如 `时间：8:30`）、`#`、`{`、`[` 会被 YAML 解析错或截断
> 2. **单行字符串用单引号**：`text: '时间：8:30 # 安全'` —— 反斜杠原样、`:`/`#` 安全、零转义
> 3. **多行/换行用块标量 `|`**：下一行缩进书写，真实换行直接保留，无需 `\n`
> 4. 双引号仅用于需要转义场景（`\n` 换行等），平时避免（`\t` `\u` 陷阱）

```yaml
# 正确写法：单行用单引号
  text: '第一行文字'
# 正确写法：多行用块标量（推荐，零转义）
  text: |
    第一行
    第二行（含冒号：和井号#都安全）
# 错误写法：裸值（`#` 后变注释、`{` 开头变 map，禁止）
  text: 研究背景 # 注释
```

### icon（内置 192 个商务图标，Bootstrap Icons MIT）
```yaml
- elementId: ic1
  elementType: icon
  bounds: [48, 96, 72, 72]
  icon: check              # 图标 key（见下方说明）
  fill: {color: "$primary"}  # 主题色令牌/hex，默认 $text
```

- **图标 key**：完整清单见 `references/components.md`（192 个，按分类列出，含中文名），也可在编辑器「＋ → 图标 → 选择图标…」里挑（可搜索）
- **渲染**：等比缩放居中（不拉伸变形）；颜色跟随主题令牌，换主题全页联动
- **导出**：图标作为 **SVG 图片**嵌入 PPTX（`<p:pic>` + `asvg:svgBlip`，与 PowerPoint「插入 → 图标」的原生存储格式一致，实测官方文件字节结构验证）——PowerPoint 用内置 SVG 引擎渲染，**预览 = 导出零转换**（弧/填充规则等均由两端原生 SVG 引擎处理）；PPT 内可改色/缩放，右键「转换为形状」可进一步编辑几何
- 注意：只支持图标库内 key，未知 key 预览显示占位框、导出跳过

### text
```yaml
- elementId: t1
  elementType: text
  bounds: [48, 32, 500, 34]        # [x, y, w, h] px（960×540 画布）
  content:
    style: "$title"                # 可选，预设文字样式（见 themes.md）
    fontSize: 22
    bold: true
    color: "$text"
    fontFamily: FangSong   # 可选：元素级字体覆盖（字符串或 {latin, ea}；默认跟随 deck fonts）
    align: [left, middle]          # [水平: left|center|right, 垂直: top|middle|bottom]；缺省 [left, middle]
    lineHeight: 1.35
    text: "第一行\n第二行"           # \n 换行；超高时编辑器自动增高框体

> 提示：**对齐默认值**：不写 `align` 时 = `[left, middle]`——**水平左对齐 + 垂直居中**（预览与导出一致；
> 垂直居中由导出 `anchor="ctr"` 实现，PowerPoint / WPS 实测一致）。垂直对齐只在"框比字高"时有
> 视觉差异（居中 = 文字在留白中垂直居中，顶部 = 贴框上沿）；正文段落如需顶部对齐请显式写 `align: [left, top]`。

> 提示：**导出行为**：文本框导出为 PowerPoint 原生文本框（`txBox`），框体固定为 bounds；
> 文字溢出时 PowerPoint 自动等比缩小文字（`normAutofit`，与编辑器“框体随内容增高”的设计一致，
> 不会像 `spAutoFit` 那样在编辑时把文本框撑爆）。

> 注意：**text 换行写法（遵循上方通则）**：优先用块标量 `|`（真实换行、零转义）：
> `text: |` 换行缩进写多行；单行用单引号 `text: '一行'`；`"第一行\n第二行"`（双引号 \n）也可用但需注意转义。
> 裸值写法中的 `\n` 是字面两字符（不换行），且 `:`/`#` 有解析风险——禁止。
```

### shape（26 种：基础 5 + ECMA-376 预置几何 21）
```yaml
- elementId: s1
  elementType: shape
  bounds: [48, 96, 210, 76]
  shapeName: roundRect
  adjustments: [12000]            # 圆角：半径 = adj/100000 × min(w,h)；默认 16667(≈1/6)
  fill: {color: "#F4F7FB"}        # 支持 "#RRGGBBAA" 半透明
  border: {width: 1, color: "$line"}   # 可选
  shadow: {blur: 8, color: "#00000040", offset: [0, 3]}  # 可选；默认不用阴影
```

- **基础 5 种**：`rect` / `roundRect` / `ellipse` / `triangle`（adj 顶点偏移）/ `diamond`
- **预置几何 21 种**（几何与 PowerPoint 同源——ECMA-376 规范附录，预览=导出）：
  - 多边形类：`pentagon`（adj 缺省 hf=105146/vf=110557 双参数）、`hexagon`（adj+vf）、`octagon`（adj）、`parallelogram`（adj）、`trapezoid`（adj）、`homePlate`（adj）、`plus`（adj）、`mathMinus`（adj1）
  - 箭头类：`chevron`（adj）、`rightArrow` / `leftArrow` / `upArrow` / `downArrow`（adj1 头宽、adj2 头长）、`leftRightArrow` / `upDownArrow`（adj1、adj2）、`quadArrow`（adj1/adj2/adj3）
  - 星形：`star4` / `star8`（adj）、`star5`（adj+hf+vf）
  - 其他：`heart`、`lightningBolt`（无调整值）
- **adjustments 语义**：数值按规范 avLst 顺序对应（缺省 = 规范默认值，预览/导出一致）；多参数形状（如 pentagon 的 hf/vf）导出时自动使用规范参数名

### line
```yaml
- elementId: l1
  elementType: line
  bounds: [72, 446, 816, 2]
  viewBox: [816, 2]
  points: "0,1 816,1"             # viewBox 内坐标
  border: {style: solid, width: 1, color: "#FFFFFF33"}
  arrow: [null, "arrow"]          # [起点箭头, 终点箭头]
```

### image
```yaml
- elementId: im1
  elementType: image
  bounds: [580, 376, 332, 118]
  src: media/company.png          # 相对路径（相对项目目录）或 dataURL
  fit: {mode: cover}              # cover 裁剪填充 | contain 完整居中 | fill 拉伸
  border: {width: 1, color: "$line"}
```
注意：只支持 PNG/JPG/GIF（SVG/WebP 会损坏 PPT 文件）。

### table（表头自动主题色、斑马纹、边框跟随主题；行高内容自适应）
```yaml
- elementId: tb1
  elementType: table
  bounds: [48, 416, 864, 100]     # 高度会被内容自适应覆盖
  # 裸值格式（推荐）：字符串/数字/百分比直接写，解析时自动转 {text}
  rows:
    - [产品线, 一季度, 二季度]
    - [企业版, 128, 156]
    - [毛利率, "58%", "65%"]       # 含 % 等特殊字符的用引号
```

### chart（7 种：bar / line / area / pie / doughnut / scatter / radar）
```yaml
- elementId: c1
  elementType: chart
  bounds: [48, 204, 424, 170]
  data:
    cols: [月份, 营收, 成本]
    rows:
      - [1月, 860, 620]
      - [2月, 920, 640]
  series:
    - type: bar                   # 与 cols 列名对应
      encode: {category: 月份, y: 营收}
      name: 营收
```
- 数据标签默认开启（数值/饼图百分比），`dataLabels: false` 可关
- 饼图/环形图 `encode: {category, value}`；散点 `{x, y}`；雷达 `{category, y}`
- `smooth: true` 折线平滑；`stack: "percent"` 百分比堆叠；bar+line 可混合共享轴（见 themes/01-商务经典/pages/4_content.page）
- 系列颜色自动取主题色板，线条/面积/网格全部跟随主题

### formula（公式，导出为 PowerPoint 原生可编辑公式）

```yaml
- elementId: f1
  elementType: formula
  bounds: [40, 196, 420, 46]
  latex: '\hat{y}_{t+1} = \text{Attention}(Q_t, K, V) W_O + b'   # LaTeX（必填，注意：必须单引号）
  fontSize: 16          # 可选，默认 16pt
  color: '#1565C0'      # 可选，公式颜色（RRGGBB）
  align: left           # 可选：left | center | right；缺省 left
```

- 导出为 **PowerPoint 原生可编辑公式**（双击可改）；预览用浏览器原生 MathML 渲染
- 预览/导出链路：LaTeX → KaTeX → MathML → OMML（全程本地、零依赖）
- KaTeX 语法覆盖常用子集：分数/根号/上下标/求和积分/矩阵/分段/`\text{}`/`\mathcal` 等

> 注意：**`latex` 字段 YAML 写法铁律（转义陷阱重灾区，务必遵守）**
>
> 1. **必须用单引号**（推荐）或块标量 `|`，**禁止裸值、禁止双引号**
> 2. 反斜杠**直接写一个**：`'\frac{1}{2}'`（不是 `"\\frac..."`）
> 3. 公式内若需撇号（如导数）写两个单引号：`f''(x)`；建议用 `^{\prime}`

```yaml
# 正确写法：单引号（首选，短公式）
  latex: 'x = \frac{-b \pm \sqrt{b^2-4ac}}{2a}'

# 正确写法：块标量（长公式/多行，零转义）
  latex: |
    \mathcal{L} = \frac{1}{T}\sum_{t=1}^{T} (y_t - \hat{y}_t)^2 + \lambda \|\theta\|_2^2

（双引号/裸值的错误写法同上方通则——latex 含 `\` `{` `}` `#`，违反时静默出错）
```
