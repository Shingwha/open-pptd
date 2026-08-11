# Font system

## Selection principles

1. Language matching: when the user's query is in Chinese or a Chinese PPT deliverable is requested, both Chinese and English fonts need to be specified; otherwise, only English fonts need to be set
2. Selection approach: it is recommended to prioritize highly readable fonts for body text, and to use stylized fonts plus special treatments (all caps, widened letter spacing, bold, italics, etc.) in titles or special pages to strengthen the style
3. The font combination must support the overall visual style positioning
4. Name consistency: **make sure font names are exactly identical, including capitalization and spaces, so that the model can use them correctly**

## Font list

### English fonts

| Font name | Font type | Style and characteristics | Suitable scenarios | Stylized font |
|---|---|---|---|---|
| Liter | Sans-serif | Modern neo-grotesque style; low contrast, balanced proportions, optimized for screens; clean and rational | Tech, product | No |
| HedvigLettersSans | Sans-serif | A "non-designer perspective" design; slightly irregular with a distinctive personality and strong brand character | Creative design, branding | No |
| Oranienbaum | Serif | Modern high-contrast serif; strongly geometric with elegant lines and a classical temperament | Culture, art, fashion | No |
| QuattrocentoSans | Sans-serif | Classic, elegant sans-serif; gentle, highly readable, clear at small sizes | Academic, corporate, education | No |
| SortsMillGoudy | Serif | Revival of the classical print style of Goudy Old Style; soft serifs, pleasant to read | Literature, humanities | No |
| Unna | Serif | Neoclassical serif with a pronounced vertical rhythm; elegant yet forceful | Literature, publishing, academia | Yes |
| Coda | Sans-serif | Rounded and friendly; soft curves, high openness | Business, friendly brand tone | Yes |
| Jersey15 | Sans-serif (sports style) | Sports jersey style; squared structure with a noticeable grid feel (supports English + digits only) | Sports, tech showcase pages | Yes |
| Jersey20Charted | Pixel font (grid shading) | Sports-number style with a shaded grid that reinforces an athletic texture (supports English + digits only) | Sports, mechanical, decorative showcase pages | Yes |

### Chinese fonts

| Font name | Font type | Style and characteristics | Suitable scenarios | Usage restriction |
|---|---|---|---|---|
| MiSans | Sans-serif (heiti) | Xiaomi system font; clean and modern, variable weights, excellent on-screen rendering (multilingual support) | Tech, corporate, product | No |
| Noto Sans SC | Sans-serif (heiti) | A branch of Source Han Sans; well-regulated structure, neutral style, extremely broad coverage. **Because it is so widely used, use it as little as possible** | Report-style | No |
| 思源宋体 | Serif (songti) | Source Han Serif; refined songti structure with stroke contrast; elegant reading experience (multilingual support) | Literature, design, formal presentations | No |
| 阿里妈妈刀隶体 | Calligraphy (clerical script) | Alimama DaoLi; clerical-script style with blade-like strokes; strength and archaic simplicity combined | China-chic, culture, art displays | No |
| 阿里妈妈东方大楷 | Calligraphy (regular script) | Alimama Dongfang Dakai; based on the Yan style of calligraphy; full and rounded, heavy and powerful | Culture, brand launches, guofeng (Chinese-style) themes | No |
| 阿里妈妈数黑体 | Sans-serif (heiti) | Alimama ShuHei; geometric heiti; uniform and regular with a strong commercial feel | Business, tech, e-commerce | No |
| 站酷文艺体 | Handwriting | Zcool WenYi; clean and fresh with a slight handwritten feel and a strong literary/artistic vibe | Light design, lifestyle | No |
| 飞波正点体 | Calligraphy (brush) | Feibo Zhengdian; brush-writing style with heavy strokes, full of power | Film posters, e-commerce, brand display | No |
| 得意黑 | Sans-serif (slanted heiti) | Smiley Sans; tall, slanted heiti combining humanist and geometric qualities with a strong modern feel. **Does not support a non-italic upright style** | Creative tech, brand display | No |
| 霞鹜新致宋 | Serif (songti) | LXGW XinZhiSong; based on IPAmj Mincho; bright, elegant, well-structured | Literature, classical style, print style | No |

### Mixed CJK–Latin fonts

| Font name | Font type | Style and characteristics | Suitable scenarios | Usage restriction |
|---|---|---|---|---|
| 精品点阵体 | Pixel font | Jingpin Dianzhen; 9×9 dot-matrix pixel style with an extremely retro electronic feel | Games, tech, pixel art | Yes |
| LXGW Bright | Serif (fangsong/kaiti) | LXGW WenKai family; combines fangsong and kaiti characteristics; gentle and clear letterforms | Literature, education, humanities | No |
| ZCOOL KuaiLe | Handwriting (rounded) | ZCOOL KuaiLe; lively, cute, playful and cartoonish; youthful energy | Anime, children, entertainment | No |

## PPTX 字体嵌入方法

导出默认嵌入 `deck.fonts` 资源表中带 `file`/`url` 的字体（`--no-embed-fonts` 关闭）。嵌入后 PPTX 自带字体，任何机器打开不缺字。

### 1. 字体文件放哪里

- **本地文件**：放在 **deck 项目目录内**（如 `deck/fonts/xxx.ttf`），manifest 中写相对路径——导出器按 `deck.pptd` 所在目录解析
- **网络字体**：写 `url`（CDN，需 CORS；如 jsDelivr 的 npm 字体包，可直接拿 TTF/OTF 原版）

### 2. deck.fonts 声明语法

```yaml
fonts:
  得意黑:   { family: "Smiley Sans", file: fonts/SmileySans-Oblique.ttf, subset: true }
  思源宋体: { family: "Source Han Serif SC", url: https://cdn.jsdelivr.net/.../SourceHanSerifSC-Regular.otf }
  title: 得意黑      # 组件槽引用资源表 key（不产生嵌入）
  body: MiSans       # 系统字体字符串：只声明不嵌入
```

- `family` 必须与字体 name 表完全一致（含大小写/空格），否则 PowerPoint 不认
- `subset: true` 时只嵌入文档用到的字符（TTF 支持，中文可小 100 倍以上）；**不写 = 全量嵌入**；CFF/OTF（OTTO 魔数）不支持子集化，自动回退全量嵌入
- 只写 `family` 字符串的槽位（系统字体 / 资源 key）不会触发嵌入

### 3. 预览（编辑器 serve 模式）

- `url` 字体自动 fetch 注册 FontFace 预览；`file` 字体浏览器无法读本地任意路径，需在编辑器「字体管理」中手动选择一次（导出不受影响，Node 端直接按相对路径读文件）

### 4. 注意事项

- **许可**：OFL 字体（思源/霞鹜/Noto/得意黑等）可嵌入再分发；微软雅黑等 Windows 商业字体不可再分发嵌入
- **受限字体**：fsType = Restricted（0x0002）的字体导出时跳过并告警
- **主题字体**：theme 的默认字体不要用嵌入字体（PowerPoint 会把主题字体也当"使用中"强制嵌入，导致文件膨胀）
- 嵌入实现细节见 `docs/font-embedding.md`（开发文档，排障时查阅）
