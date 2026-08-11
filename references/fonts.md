# Font system

## 字体总览

- **内置字体库**：`assets/fonts/`（技能资源文件夹，不上传 GitHub），共 **29 种免费商用字体**，全部实测过 name 表注册名、fsType 可嵌入、支持子集化。
- **使用方式**：deck.fonts 资源项写 `{family: <注册名>}` 即自动嵌入（默认子集化），模型无需下载/放置任何字体文件。
- **默认字体**：`Microsoft YaHei`（微软雅黑，Windows 系统自带）。它不在内置字体库（微软版权，不可分发/嵌入），属系统字体——仅声明不嵌入，任何 Windows 机器打开都一致显示。如需跨机器一致的品牌字体（如 MiSans），在 deck.fonts 声明并让页面显式引用即可。
- **系统字体**：未命中注册表的 fontFamily 仅声明不嵌入，依赖打开方系统已装。常用系统字体的注册名/平台覆盖见下方「系统字体」章节（CLI `fonts list` 也可查）。

## Selection principles

1. Language matching: when the user's query is in Chinese or a Chinese PPT deliverable is requested, both Chinese and English fonts need to be specified; otherwise, only English fonts need to be set
2. Selection approach: it is recommended to prioritize highly readable fonts for body text, and to use stylized fonts plus special treatments (all caps, widened letter spacing, bold, italics, etc.) in titles or special pages to strengthen the style
3. The font combination must support the overall visual style positioning
4. Name consistency: **页面 `fontFamily` 必须与下表「注册名」完全一致（含大小写/空格），这是嵌入生效的唯一要求**——直接抄注册名，不要写展示名

## 内置字体库（29 种，全部免费商用 + 子集化嵌入）

### 黑体（sans）

| 展示名 | 注册名（family） | 风格与特点 | 适合场景 |
|---|---|---|---|
| MiSans | `MiSans` | 小米系统黑体，现代清晰，多字重 | 科技/企业/产品 |
| 得意黑 | `Smiley Sans` | 窄身斜体黑体，人文与几何平衡（斜体字形） | 创意科技/品牌展示/标题 |
| 思源真黑 | `Gen Shin Gothic` | 方正硬朗，工业感 | 工业/机械/标题 |
| 思源柔黑 | `Gen Jyuu GothicL` | 圆润柔和，亲和 | 生活/轻松/正文 |
| 阿里妈妈数黑体 | `Alimama ShuHeiTi` | 几何黑体，规整商业感（粗体字重） | 商业/科技/电商 |
| 霞鹜新晰黑 | `LXGW Neo XiHei` | 清晰现代，简洁利落 | 科技/正文/通用 |
| Liter | `Liter` | 现代无衬线，理性干净 | 科技/产品 |
| HedvigLettersSans | `Hedvig Letters Sans` | 非设计师视角，个性辨识度 | 创意设计/品牌 |
| QuattrocentoSans | `Quattrocento Sans` | 经典优雅无衬线，小字号清晰 | 学术/企业/教育 |
| Coda | `Coda` | 圆润友好，开放曲线 | 商务/亲和品牌 |

### 宋/衬线（serif）

| 展示名 | 注册名（family） | 风格与特点 | 适合场景 |
|---|---|---|---|
| 思源宋体 | `Source Han Serif CN` | 笔画对比鲜明，优雅 | 文学/设计/正式演示 |
| LXGW Bright | `LXGW WenKai` | 霞鹜文楷，楷书与仿宋融合，温润清秀 | 文学/教育/人文 |
| 霞鹜緻宋 | `LXGW ZhiSong MN` | 现代感宋体 | 文学/古典/印刷风 |
| 霞鹜铭心宋 | `LXGW Heart Serif MN` | 笔画清秀 | 文学/古典/标题 |
| Oranienbaum | `Oranienbaum` | 高对比几何衬线，古典优雅 | 文化/艺术/时尚 |
| SortsMillGoudy | `Sorts Mill Goudy` | 古典衬线，柔和易读 | 文学/人文 |
| Unna | `Unna` | 新古典衬线，垂直韵律 | 文学/出版/学术 |

### 手写/书法（handwriting）

| 展示名 | 注册名（family） | 风格与特点 | 适合场景 |
|---|---|---|---|
| 飞波正点体 | `Feibo Zheng Dots` | 毛笔书法，笔画厚重有力 | 电影海报/电商/品牌展示 |
| 阿里妈妈刀隶体 | `Alimama DaoLiTi` | 隶书风格，刀削笔画，古拙有力 | 国潮/文化/艺术展示 |
| 阿里妈妈东方大楷 | `Alimama DongFangDaKai` | 颜体大楷，丰腴厚重 | 文化/品牌发布/国风主题 |
| 站酷文艺体 | `zcoolwenyiti` | 清新手写感，文艺气息 | 轻设计/生活方式 |
| ZCOOL KuaiLe | `HappyZcool-2016` | 活泼可爱手写圆体 | 动漫/儿童/娱乐 |
| 霞鹜臻楷 | `LXGW ZhenKai` | 楷书韵味 | 国风/文学/正式 |

### 标题/艺术（display）

| 展示名 | 注册名（family） | 风格与特点 | 适合场景 |
|---|---|---|---|
| 站酷小薇LOGO体 | `xiaowei` | LOGO 艺术字，个性张扬 | 标题/品牌标识 |
| 站酷庆科黄油体 | `zcoolqingkehuangyouti` | 圆润厚实黄油体 | 标题/食品/轻松品牌 |
| Jersey15 | `Jersey 15` | 运动队服风格（仅英数） | 运动/科技展示 |

### 像素（pixel）

| 展示名 | 注册名（family） | 风格与特点 | 适合场景 |
|---|---|---|---|
| 精品点阵体 | `BoutiqueBitmap9x9 1.9` | 9×9 点阵像素风 | 游戏/科技/复古电子 |
| 寒蝉点阵体 | `寒蝉点阵体` | 16px 点阵像素风 | 游戏/复古/像素 |
| Jersey20Charted | `Jersey 20 Charted` | 网格阴影运动数字（仅英数） | 运动/机械/装饰 |

> 全表、大小、许可、回源 URL 见 `assets/fonts/registry.json`（机器可读，CLI/编辑器共用）。

## 系统字体（仅声明不嵌入，依赖打开方系统已装）

以下为常用系统字体参考清单（**无字体字节、不嵌入、不下载**）：页面 `fontFamily` 直接写注册名即可，PPTX 里仅作声明。观感取决于打开方系统是否已装该字体——**未装则静默回退**，跨平台/跨设备一致性与嵌入字体不可比。注册名以 Windows 字体 name 表为准；`platform` 列标注覆盖范围，macOS 专有字体（苹方等）在 Windows 上会回退。

### Windows 自带中文

| 展示名 | 注册名（family） | 平台 | 风格与特点 | 适合场景 |
|---|---|---|---|---|
| 微软雅黑 | `Microsoft YaHei` | Windows 7+ | 现代黑体，屏幕阅读首选（**默认字体**） | 正文/通用 |
| 宋体 | `SimSun` | Windows 全系 | 老牌宋体，公文/打印惯用 | 正文/正式文档 |
| 仿宋 | `FangSong` | Windows 全系 | 仿宋，公文标准字体 | 公文/正式文档 |
| 楷体 | `KaiTi` | Windows 全系 | 楷体，手写书卷感 | 题词/引用 |
| 黑体 | `SimHei` | Windows 全系 | 老牌黑体，方正硬朗 | 标题/正文 |
| 幼圆 | `YouYuan` | Windows 全系 | 圆体，圆润亲和 | 标题/轻松场景 |
| 隶书 | `LiSu` | Windows 全系 | 隶书，古风 | 标题/装饰 |
| 等线 | `DengXian` | Windows 10+ / Office | Office 默认中文，清秀 | 正文/通用 |

### 西文基础（Windows / Office 必带）

| 展示名 | 注册名（family） | 平台 | 风格与特点 | 适合场景 |
|---|---|---|---|---|
| Times New Roman | `Times New Roman` | 全平台 | 经典衬线 | 西文正文/学术 |
| Arial | `Arial` | 全平台 | 经典无衬线 | 西文正文 |
| Calibri | `Calibri` | Office | Office 默认西文，圆润 | 西文正文 |

### macOS 中文（Windows 无，跨平台会回退）

| 展示名 | 注册名（family） | 平台 | 风格与特点 | 适合场景 |
|---|---|---|---|---|
| 苹方 | `PingFang SC` | macOS | macOS 默认黑体 | 正文/通用（macOS） |

> 系统字体由 `registry.json` 的 `systemFonts` 维护（CLI `fonts list` / `fonts check` 与编辑器字体面板共用同一份）。

## 新环境初始化（clone 仓库后）

字体文件本体（约 155MB）不入 git（仅 `registry.json` 元数据入库），首次使用前二选一：

```bash
# 方案 A：一次全量下载（一劳永逸，约 155MB，离线可用）
node bin/open-pptd.js fonts download all

# 方案 B：按需下载（用到哪个下哪个，导出前跑）
node bin/open-pptd.js fonts download 得意黑
node bin/open-pptd.js fonts check <deck.pptd>   # 体检后按 ✗ 补下载
```

未下载字体不影响导出：导出时自动跳过嵌入并告警，PPTX 照常生成（字体名保留，打开时回退系统字体）。

## PPTX 字体嵌入方法

导出默认嵌入 `deck.fonts` 资源表中**命中内置字体库或带 url 的字体**（`--no-embed-fonts` 关闭）。嵌入后 PPTX 自带字体，任何机器打开不缺字。

### 1. deck.fonts 声明语法

```yaml
fonts:
  得意黑: { family: "Smiley Sans" }          # 注册表引用：导出自动从内置库取字 → 子集化 → 嵌入
  title-font: { family: "Alimama DaoLiTi", subset: false }   # 显式关闭子集化（默认 true）
  web-font:  { family: "SomeFont", url: https://cdn.example.com/somefont.ttf }  # 网络字体（需 CORS）
  body: MiSans                              # 组件槽字符串：仅引用，不产生嵌入
```

- `family` 是**嵌入注册名**：必须与上表注册名完全一致（含大小写/空格）；**未命中注册表且无 url 的 family 视为系统字体，仅声明不嵌入**
- `subset: true`（默认）只嵌入文档用到的字符（TTF 子集化，中文可小 100 倍以上）
- 嵌入注册名 = 字体 name 表 ID16（typographic family）优先、ID1 回退——上表注册名已全部实测，**直接抄，不要写展示名**

### 2. 项目不需要 fonts 目录

字体字节全部在技能内置库 `assets/fonts/`，deck 项目目录保持 `deck.pptd + pages/ + media/` 干净。

### 3. CLI 字体管理

```bash
node bin/open-pptd.js fonts list                  # 全表 + 下载状态 ✓/✗
node bin/open-pptd.js fonts download <名称|all>   # 按需 / 全量补下载到字体库
node bin/open-pptd.js fonts check <deck.pptd>     # 体检：哪些嵌入 / 仅声明 / 缺失
```

### 4. 编辑器（serve 模式）

工具栏「字体」→ 字体管理对话框：内置字体库分区浏览（黑体/宋衬线/手写书法/标题艺术/像素），点「使用」一键加入并写入 deck.fonts（注册名自动带对）；预览与导出共用同一字体字节（`/assets/fonts/` 静态服务 + FontFace）。

### 5. 注意事项

- **使用即嵌入**：注册表引用的字体一律嵌入（不管本机是否已装），保证任何机器打开一致；体积靠子集化控制
- **theme 默认字体不要用嵌入字体**（PowerPoint 会把主题字体也当"使用中"强制嵌入，导致文件膨胀）
- **必须有 run 实际使用**：只声明 fonts 而页面/主题样式没有引用该 family → PowerPoint 打开时丢弃嵌入声明。deck.fonts 声明后，记得在 theme.textStyles 或元素 fontFamily 中使用
- **许可**：内置库 29 种全部免费商用（OFL / IPA / 阿里妈妈 / 站酷授权），可嵌入再分发；微软雅黑等 Windows 商业字体不可再分发嵌入
- **受限字体**：fsType = Restricted（0x0002）的字体导出时跳过并告警（内置库无此类）
- 嵌入实现细节见 `docs/font-embedding.md`（开发文档，排障时查阅）
