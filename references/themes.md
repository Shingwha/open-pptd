# Theme & color（主题配色）

## 定位

两条路径，**默认走自定义**：

1. **自定义配色（默认路径）**：每次生成按内容/行业/受众独立设计一套专属配色，避免同质化。设计准则见下文「自定义配色准则」。
2. **内置预设（备选路径）**：10 套预设（与编辑器顶栏「配色」面板、CLI `--theme <key>` 同一数据源）。**仅当用户明确要求使用内置主题色、或与用户讨论后决定采用预设时**才使用。

无论哪条路径，deck 都必须自包含：把**完整 17 键色值**写入 `deck.theme.colors`（页面元素用 `$key` 引用），禁止用字符串形式引用预设（`theme: "tech"` 非官方格式，仅 v1 遗留兼容——命中预设键时解析为对应 colors，未知键告警并回退默认主题）。

## 自定义配色准则（默认路径）

### 结构要求

1. `theme.colors` 键集固定 17 键，全部显式 hex（#RRGGBB），禁止动态派生或省略：
   - 9 语义色：`primary / accent / bg / text / muted / line / success / warning / danger`
   - 3 主色派生色：`primarySoft / primaryTint / primaryDeep`（表头浅底/卡片/深底）
   - 4 图表系列色槽位：`accent3 / accent4 / accent5 / accent6`（accent1/2 固定 = primary/accent）
2. 键集不全会导致 `$text/$muted` 与图表系列色悬空，生成时必须写全。

### 设计准则

1. **主色定调**：从内容里提取设计锚点——品牌色、主题意象、行业惯例色（金融深蓝、环保绿、教育暖橙等），避免无依据地套用默认色。主色 = 页面强调、表头、深色区块、图表第一系列。
2. **点缀色负责点睛**：accent 与主色形成邻色或互补关系（如深蓝+金、墨绿+蜜金），用于强调标签、关键数字、图表第二系列；避免主色点缀色同色相。
3. **白字压主色对比度 ≥ 4.5:1**（表头行白字、深底白字的场景）：主色需足够深；亮色（如橙、粉）做主色时压深一档。
4. **图表系列色 6 槽彼此可区分**：色相或明度拉开（相邻系列 ΔE 建议 ≥ 15），且与家族和谐；同族明度阶梯（深→浅）是安全做法，避免 6 槽里有 2 个肉眼难分的颜色。
5. **派生色严格由主色派生**：primarySoft = 主色极浅底（斑马纹/浅背景）、primaryTint = 主色浅卡片底、primaryDeep = 主色加深（深色封面/深色区块）。
6. **中性色带家族色相**：text/muted/line 不是纯灰，而是混入主色色相的黑灰/浅灰（如冷色家族用蓝灰线、暖色家族用暖灰线），整体才统一。
7. **语义色按家族色温取值**：success/warning/danger 的色相可与中性色协调（避免在冷色方案里出现刺眼的荧光绿/荧光红），但保持语义可辨。
8. **同质化红线**：禁止无脑复用预设色值（尤其「深蓝+金」组合）；禁止一页堆砌红黄绿紫（见 slides_categories 通用规则）；每套配色的主色与点缀色组合应能一句话说清设计意图。

## 内置预设（备选路径）

### 使用条件

- 用户明确要求使用内置主题色，或
- 与用户讨论配色方案后决定采用预设（交付时主动给出备选建议，如「若想要更沉稳的商务感，可换 consult」）。

选中预设后，把该套**完整 17 键色值**写入 `deck.theme.colors`；textStyles/tableStyles 若无特殊设计需求，沿用文末默认模板（5 键文本样式 + 默认表格样式）。

### 10 套预设总览

| 键 | 名称 | 主色 | 点缀色 | 性格 | 适用场景 |
|---|---|---|---|---|---|
| consult | 咨询蓝 | 深海军蓝 #16324F | 复古金 #C9962E | 沉稳、专业、商务 | 咨询报告、管理汇报、战略分析、金融 |
| tech | 科技青 | 深海青 #0B7C8D | 亮琥珀 #F5A623 | 理性、现代、活力 | 科技、互联网、产品发布、研发汇报 |
| orange | 活力橙 | 焦橙 #C0531F | 深青 #2A6E72 | 热烈、行动力 | 营销活动、电商大促、运动、双创 |
| green | 森林绿 | 深林绿 #1D6B45 | 蜜金 #D0A437 | 自然、稳健、成长 | 农业、环保、医药健康、ESG |
| red | 沉稳红 | 绯红 #B02A3A | 墨蓝 #2E4A6E | 庄重、正式、警示 | 党政、国企、年度总结、红色主题 |
| purple | 优雅紫 | 深紫罗兰 #5A2E8C | 暖琥珀 #C99A3A | 高贵、创意、神秘 | 品牌发布、时尚、文创、女性向 |
| mono | 高级灰 | 炭黑 #20272F | 金 #C9993E | 极简、克制、高级 | 设计师作品集、建筑、工业、摄影 |
| brown | 大地棕 | 可可棕 #6D4A2C | 蜂蜜金 #D19A4B | 温暖、质朴、复古 | 文旅、餐饮、地产、手作、教育 |
| morandi | 莫兰迪 | 灰调鼠尾草 #64725F | 亚麻米 #B7A187 | 低饱和、雅致、安静 | 家居、美学、生活类、女性向内容 |
| sakura | 樱花粉 | 玫瑰粉 #BC4F76 | 鼠尾草绿 #7FA87C | 柔美、清透、亲和 | 美妆、母婴、婚礼、情感类内容 |

### 完整色值表（17 键 × 10 套）

主色与图表系列色（图表系列色循环 = accent1-6，即 primary → accent → accent3 → accent4 → accent5 → accent6，按系列出现顺序循环取用）：

| 套 | primary | accent | accent3 | accent4 | accent5 | accent6 |
|---|---|---|---|---|---|---|
| consult | #16324F | #C9962E | #3D6B99 | #7FA6CB | #C26B4E | #5D8A72 |
| tech | #0B7C8D | #F5A623 | #23A5B8 | #79C7D4 | #8C5BC4 | #5C7D8C |
| orange | #C0531F | #2A6E72 | #E0804A | #F2B48E | #3E8A8F | #8FB5B8 |
| green | #1D6B45 | #D0A437 | #3E8B60 | #7FB593 | #B56A3E | #7C93A5 |
| red | #B02A3A | #2E4A6E | #C94B57 | #E3A0A6 | #4E6F9E | #9AA9C4 |
| purple | #5A2E8C | #C99A3A | #7B4FA8 | #AC8CCB | #C26B8A | #5E7FA3 |
| mono | #20272F | #C9993E | #55606E | #A0A9B4 | #3E8A8C | #B05A4A |
| brown | #6D4A2C | #D19A4B | #8D6742 | #C4A57E | #7E8C5A | #A68B4F |
| morandi | #64725F | #B7A187 | #8FA08A | #C3CDC0 | #AE8B92 | #8E9BA5 |
| sakura | #BC4F76 | #7FA87C | #D97FA4 | #EFB8CD | #4E8A62 | #A98AC0 |

其余 11 键（bg/text/muted/line/success/warning/danger + primarySoft/primaryTint/primaryDeep）：

| 键 | consult | tech | orange | green | red | purple | mono | brown | morandi | sakura |
|---|---|---|---|---|---|---|---|---|---|---|
| bg | #FFFFFF | #FFFFFF | #FFFFFF | #FFFFFF | #FFFFFF | #FFFFFF | #FFFFFF | #FFFFFF | #FFFFFF | #FFFFFF |
| text | #16222E | #142B33 | #2E241E | #172A20 | #2C2022 | #2A2136 | #232A33 | #2E241D | #33352E | #3A2831 |
| muted | #5C6C7E | #5B7376 | #78685C | #5C6E62 | #75676A | #6E6480 | #66707C | #7A6B5C | #76796F | #8A6E78 |
| line | #E3E8EF | #DDEBEC | #F0E6DE | #E2EAE3 | #F0E3E4 | #E9E2F2 | #E7E9EC | #EDE5DA | #E6E5DE | #F5E4EA |
| success | #2F7D52 | #2E9E5B | #3D7A4F | #2F8A52 | #3D7A52 | #3D7A52 | #3D8A57 | #4F7A4E | #5E7A60 | #4F8A5C |
| warning | #A86A1F | #D98A1F | #C07A12 | #B07816 | #B07A14 | #AD7513 | #B0781C | #B57A1C | #A88A4E | #C08A2E |
| danger | #C0524E | #D64545 | #C0503C | #C05248 | #C64A3E | #BF4A56 | #C7504A | #B55242 | #B07A70 | #C0504E |
| primarySoft | #EEF2F7 | #EFF7F8 | #FCF3EC | #F0F6F1 | #FBF1F2 | #F6F2FA | #F2F3F5 | #F7F4F0 | #F4F6F2 | #FCF4F7 |
| primaryTint | #DCE4EE | #DFEFF2 | #F8E6D8 | #E0EDE4 | #F5E2E4 | #ECE4F5 | #E3E6EA | #EFE8DF | #E8ECE4 | #F9E9EF |
| primaryDeep | #0E2236 | #075E6A | #9A3A12 | #124D31 | #831C28 | #3F1E63 | #141A23 | #4E341E | #4A5646 | #8C3A5B |

> 用法：`primarySoft` = 主色浅底（斑马纹/浅色背景）、`primaryTint` = 主色卡片底、`primaryDeep` = 主色深底（深色封面/深色区块）。三者为显式色值，不要动态派生。

## deck.theme 写法示例

以「科技青 tech」为例（colors 整块换成所选预设或自定义的 17 键即可；textStyles/tableStyles 为默认模板）：

```yaml
theme:
  colors:
    primary: "#0B7C8D"
    accent: "#F5A623"
    bg: "#FFFFFF"
    text: "#142B33"
    muted: "#5B7376"
    line: "#DDEBEC"
    success: "#2E9E5B"
    warning: "#D98A1F"
    danger: "#D64545"
    primarySoft: "#EFF7F8"
    primaryTint: "#DFEFF2"
    primaryDeep: "#075E6A"
    accent3: "#23A5B8"
    accent4: "#79C7D4"
    accent5: "#8C5BC4"
    accent6: "#5C7D8C"
  textStyles:
    title: { fontSize: 32, color: "$text", bold: true, lineHeight: 1.3 }
    subtitle: { fontSize: 16, color: "$muted", lineHeight: 1.4 }
    body: { fontSize: 16, color: "$text", lineHeight: 1.6 }
    caption: { fontSize: 12, color: "$muted", lineHeight: 1.4 }
    quote: { fontSize: 16, color: "$text", italic: true, lineHeight: 1.6 }
  tableStyles:
    default:
      cellStyle: { fontSize: 13, color: "$text", fill: { type: "solid", color: "#FFFFFF" }, border: { style: "solid", width: 1, color: "$line" } }
      firstRowStyle: { fill: { type: "solid", color: "$primary" }, color: "#FFFFFF", bold: true }
      bodyStyles:
        - { fill: { type: "solid", color: "$primarySoft" } }
        - { fill: { type: "solid", color: "#FFFFFF" } }
      rowOverColumn: true
```

页面元素引用示例：文本 `style: "$title"`、`color: "$primary"`、表格 `style: "$default"`、图表系列 `fill: ["$primary", "$accent", "$accent3"]`（缺省时系列自动按 accent1-6 循环取色）。

## 生成后换皮入口（与生成流程互补）

- **编辑器**：顶栏「配色」面板一键应用（仅替换 `theme.colors`，全页 `$key` 引用与图表系列色立即联动），单键可微调。
- **CLI**：`node bin/open-pptd.js export <deck.pptd> -o out.pptx --theme <key>`（未知键报错；仅替换 colors，保留 manifest 的 textStyles/tableStyles）。

## 维护约定

- **权威源**：`editor/core/theme-presets.js`（`THEME_PALETTES`，DEFAULT_THEME = 第 1 套 consult）。
- 修改预设色值后必须同步：本文档两张色值表 + `docs/editor-v2-ux.md` §1.3；一致性由 `tests/theme-presets-consistency.mjs` 守护。
