# 字体指南（fonts.md）

> 设计 PPT 时按本文选字体、写 `fonts` 声明；格式语法细节见 `pptd-format.md` 第 1 节。嵌入由导出自动处理，无需手动干预。
>
> **一句话原则**：正文可读性优先（现代无衬线），标题要气质（衬线/粗黑体），全页默认微软雅黑——**只有系统字体满足不了气质时**才用网络字体（有成本：首次加载体积、依赖网络）。

## 1. 决策流程（先问三个问题）

1. **换机打开**是否要求字体不丢？→ 要 → 用**可嵌入网络字体**（OFL 许可，导出自动子集化嵌入）；不要 → 系统字体即可
2. **气质**要什么？→ 现代商务/科技 → 无衬线；正式/印刷/高端 → 衬线标题；文化/手作 → 楷体系
3. **性能预算**？→ 网络字体首次加载 0.8–25MB（CDN 缓存后不再下载）；导出子集化后只有几 KB～几十 KB

> 注意：预览与导出必须一致：浏览器 FontFace 加载原始字体，导出做 EOT 封装 + 子集化，同一字节源。**不要声明未安装、且没有 file/url 来源的字体**——两端会同时回退，等于没声明。

## 2. 系统字体池（Windows 自带，零成本，跨端稳定）

| 字体 | 英文名 | 气质 | 推荐场景 |
|---|---|---|---|
| 微软雅黑 | `Microsoft YaHei` | 现代无衬线（默认） | 商务/科技/极简/通用 |
| 黑体 | `SimHei` | 粗犷庄重、标题感 | 政务/庄重大标题 |
| 宋体 | `SimSun` | 衬线印刷、报纸感 | 复古/学术/正式报告 |
| 楷体 | `KaiTi` | 手写温润、文气 | 新中式/文化/引用 |
| 仿宋 | `FangSong` | 公文感 | 政务正文 |
| 幼圆 | `YouYuan` | 圆润可爱 | 教育/活泼 |

系统字体**不可再分发**（商业字体），导出不嵌入、不适用换机场景。

## 3. 网络字体推荐清单（OFL 免费可嵌入，直链已验证）

> 全部验证过 CORS 全开、可被子集化嵌入；思源系是可变字体（name 表实例名自动归一，见第 6 节）。**体积是首次加载成本**，子集化嵌入后只占几 KB。

| 字体 | 家族名（YAML 用） | 气质 | 场景 | 直链 | 体积 |
|---|---|---|---|---|---|
| **思源宋体** | `Noto Serif SC` | 高级衬线、印刷感（麦肯锡 Bower 的中文对应） | 高端标题/学术/正式 | `https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifsc/NotoSerifSC%5Bwght%5D.ttf` | 25MB（jsDelivr 20MB 上限需走 GitHub raw） |
| **思源黑体** | `Noto Sans SC` | 现代黑体（Graphik 的中文对应） | 正文/通用 | `https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf` | 17.7MB |
| **EB Garamond** | `EB Garamond` | 西文经典衬线（Bower 开源替身） | 西文标题/数字/英文 | `https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/ebgaramond/EBGaramond%5Bwght%5D.ttf` | 0.85MB |
| 霞鹜文楷 | `LXGW WenKai` | 宋楷融合、温润文艺 | 文化/手作/生活方式 | `https://github.com/lxgw/LxgwWenKai/releases/download/v1.510/LXGWWenKai-Regular.ttf` | 19MB |
| 站酷小薇 | `ZCOOL XiaoWei` | 秀气宋体感、编辑文艺 | 文艺/编辑/新中式 | `https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/zcoolxiaowei/ZCOOLXiaoWei-Regular.ttf` | 6.3MB |
| 得意黑 | `Smiley Sans` | 斜体感黑体、动感 | 海报/发布会大字 | GitHub `atelier-anchor/smiley-sans` release | 2.6MB |

**取直链注意事项**：jsDelivr gh/google/fonts 单文件限 20MB（思源宋体超限 403，改 GitHub raw `raw.githubusercontent.com/google/fonts/main/...`，CORS 全开）；URL 中 `[` `]` 需编码为 `%5B` `%5D`；字体文件大小变化时以仓库实际文件为准。

## 4. YAML 写法（由简到繁四层）

```yaml
# ① 字符串：全组件统一
fonts: KaiTi

# ② 中西文分工
fonts: { latin: EB Garamond, ea: Noto Sans SC }   # 西文/数字用 Garamond，中文用思源黑体

# ③ 组件级（缺省组件回退默认；9 个组件键：latin/ea/title/subtitle/body/caption/quote/table/chart）
fonts:
  latin: EB Garamond
  ea: Noto Sans SC
  title: { latin: EB Garamond, ea: Noto Serif SC }   # 标题：西文 Garamond + 中文思源宋体
  body: Noto Sans SC                                 # 正文
  quote: Noto Serif SC                               # 引用用衬线
  table: Noto Sans SC
  chart: Noto Sans SC

# ④ 资源表 + 组件槽引用（网络字体推荐写法）：除 9 个组件键外的键 = 资源声明
fonts:
  title: { latin: EB Garamond, ea: Noto Serif SC }
  body: Noto Sans SC
  Noto Serif SC: { family: Noto Serif SC, url: "https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifsc/NotoSerifSC%5Bwght%5D.ttf", subset: true }
  Noto Sans SC: { family: Noto Sans SC, url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf", subset: true }
  EB Garamond: { family: EB Garamond, url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/ebgaramond/EBGaramond%5Bwght%5D.ttf", subset: true }
```

资源字段：`family`（字体家族名，必填，须与字体 name 表一致——思源系写 `Noto Serif SC` 这类族名即可，实例名自动归一）、`file`（项目内相对路径，放 `fonts/` 目录）/ `url`（网络直链，二选一）、`subset`（true = 子集化嵌入，默认全量）。

**组件槽引用**：`title: Noto Serif SC`（字符串先查资源表命中 family）；**元素级覆盖**：单个元素 `fontFamily: Noto Serif SC`（同样先查资源表）。

## 5. 高级字体组合配方（已验证的主题级组合）

| 组合 | 标题 | 正文 | 西文/数字 | 气质 |
|---|---|---|---|---|
| **麦肯锡咨询**（主题默认） | Noto Serif SC | Noto Sans SC | EB Garamond | 高端咨询、Bower+Graphik 的中文复刻 |
| 学术论文 | Noto Serif SC | Microsoft YaHei | EB Garamond | 正式学术 |
| 新中式 | KaiTi（或 LXGW WenKai） | KaiTi | KaiTi | 文气统一 |
| 政务 | SimHei | FangSong | SimHei | 庄重公文 |
| 文艺编辑 | ZCOOL XiaoWei | Microsoft YaHei | EB Garamond | 秀气书卷 |
| 全雅黑（默认） | Microsoft YaHei | Microsoft YaHei | Microsoft YaHei | 通用稳妥 |

> 完整示例见 `themes/01-商务经典/deck.pptd`（麦肯锡组合，7 页全组件展示样板）。

## 6. 嵌入机制与注意事项（了解即可，自动处理）

- **导出自动嵌入**：带 `file`/`url` 的声明导出时自动嵌入字体；`--no-embed-fonts` 或导出对话框取消勾选可关闭
- **子集化**：TrueType 字体自动子集化（只保留用到的字，几十 KB）；**CFF/OTF 不支持子集化**（如 Adobe 版思源 .otf），回退全量嵌入——大字体全量可达 13.9MB，慎用
- **可变字体自动归一**：Google Fonts 思源系（`[wght]` 变量）嵌入时自动把字重实例名归一为族名、默认字重归一到 400，PowerPoint 匹配与字重正常
- **fsType 0x0002 Restricted 禁止嵌入**：跳过并提示（雅黑/宋体等系统商业字体 fsType 允许预览但不适合再分发）
- **浏览器端**：编辑器「字体」按钮添加本地文件/URL（预览即时生效），保存项目自动写入资源表；打开项目 URL 字体自动拉取、file 字体待重选
