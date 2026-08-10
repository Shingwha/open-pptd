---
name: open-pptd
description: 用 PPTD 格式（人类可读 YAML）在本地创建、编辑、预览并导出 PowerPoint 演示文稿（.pptx）。当用户要求"做一份 PPT / 演示文稿 / deck / 幻灯片 / 课件 / 汇报材料 / 发布会文稿"，或想修改已有 PPT 的内容、风格、配色、字体，或需要浏览器实时预览与共同编辑、导出 pptx 时，务必使用本技能——即使他们没明确提到 PPTD 或文件名。也适用于把 Word/Markdown/大纲内容转成可编辑的 PPT 项目。零依赖（仅需 Node.js v18+），预览与导出渲染一致。
---

# open-pptd — 本地 PPTD 演示文稿工作流

## 定位

PPTD 是人类可读的 YAML 演示格式：manifest `deck.pptd` + 每页一个 `pages/*.page` + `media/` 图片。本技能完成"内容 → 可编辑项目 → 实时预览 → PPTX"的本地闭环，仅依赖 Node.js v18+。

- 核心承诺：预览（浏览器渲染）= 导出（PowerPoint），模型单一定义、双消费者
- 协作模式：浏览器编辑器（用户实时改 + 保存写回磁盘）与 Agent 直接改文件（刷新即生效）互补
- 支持范围：8 种组件（文字/形状/线条/图片/图标/表格/图表/公式）+ 主题系统；不支持任意 PPT 格式

## 使用边界（先读）

本技能自包含：做 PPT 只需四件事——与用户讨论需求、创建/修改项目目录、运行 CLI 命令、按需查阅文档。

**禁止阅读引擎源码**：`editor/`、`bin/`、`lib/`、`scripts/`、`tests/`、`icons/`、`docs/`、`.github/`、`package.json`、`README.md`、`index.html` 均为引擎实现，不要打开、不要搜索、不要引用其中的任何内容。组件清单、格式、字体、主题等全部信息在本文档与 `references/` 中；文档没有的能力就是不支持的能力，直接告知用户，不要从源码中挖掘。

唯一可读例外：`themes/` 目录下的 `.pptd` / `.page` 文件（示例项目数据，看写法用）。

## 工作流

### Step 1 需求确认

与用户确认四件事，缺一不可：

1. 内容：主题 / 已有文档 / 大纲（有文档先通读；只有主题先列页大纲请用户确认）
2. 主题：按场景从 `references/styles.md` 预置组合表挑选，或按 风格 × 色系 × 字体 三维自由组合（默认「商务经典」）；也可让用户描述氛围，由你推荐
3. 规模：页数（默认 8-12 页）与信息密度
4. 交付方式：是否需要浏览器预览与共同修改（默认不需要，直接导出）

先给出"N 页 + 目录 + 风格 + 配色"摘要请用户确认，不要在需求不明时直接生成。

### Step 2 创建项目

```bash
mkdir -p <项目目录>/pages <项目目录>/media
```

- 项目目录用英文短名（如 q3-review），deck 标题用中文
- 写页面前读 `references/pptd-format.md`（元素写法）、`references/components.md`（图标/形状选型），按 `references/styles.md` 所选风格的页型配方排版
- 图片放 `media/`（仅 png/jpg/gif）；没有合适图片用图标/形状/色块排版，不放无关图
- 写完必须自检：导出一次确认无报错（语法错误会在此暴露）

注意：主题只是引导，不是模板——选好主题后按内容做配套优化（图标/形状/布局/字体）。示例主题页只参考写法，不要照搬页面内容。

### Step 3 预览与协作（用户不需要则跳过）

```bash
node "$SKILL/bin/open-pptd.js" serve --project "<项目目录>" --port 55173
```

- 项目文件在磁盘，浏览器经 server 读写；用户保存自动写回磁盘，外部改动约 1.5 秒内自动刷新
- 两条修改路径互补，始终以磁盘文件为准：用户网页改（小改：位置/文字/颜色/图表数据），Agent 直接改文件（结构调整/批量内容/换风格/新增页面）
- Agent 写文件尽量原子写（临时文件 + rename），避免半成品被轮询读到
- serve 是长驻进程：后台启动，用户确认满意并导出完成后停掉

### Step 4 导出交付

```bash
node "$SKILL/bin/open-pptd.js" export "<项目目录>/deck.pptd" -o "<输出目录>/out.pptx" [--theme <key>]
```

导出成功后把 .pptx 的绝对路径明确告诉用户；若启动了 serve，确认交付后停掉进程。用户也可在编辑器点「导出」自行下载。

## 组件速查

| 组件 | 说明 | 何时用 |
|---|---|---|
| text | 标题/正文/标签/数字 | 一切文字 |
| shape | 26 种原生形状（可调参数，PPT 可编辑） | 流程图/容器/强调图形 |
| icon | 192 个内置商务图标（跟随主题色） | 概念/状态/小图形 |
| line | 分隔线/连接线（可加箭头） | 分组、指向 |
| image | png/jpg/gif（放 media/） | 照片、截图、logo |
| table | 自动主题色表格 | 结构化数据明细 |
| chart | 7 种：bar/line/area/pie/doughnut/scatter/radar | 数据趋势与对比 |
| formula | LaTeX 公式（PPT 原生可编辑） | 数学/技术公式 |

选型要点：概念/状态/小图形用 icon；流程/结构/强调用 shape（chevron 步骤条、diamond 决策、parallelogram 处理节点、star5 强调）；数据用 chart 或 table。一页视觉语言不超过 3 种，避免堆砌。

常用图标：`check` 对勾 · `arrow-right` 右箭头 · `graph-up` 上升折线 · `lightbulb` 灯泡 · `people` 多人 · `clock` 时钟 · `geo-alt` 定位针 · `lock` 锁。完整图标清单（192 个）、形状清单（26 种，含调整参数）与高频推荐见 `references/components.md`。

## 命令

路径约定：本 skill 根目录 = SKILL.md 所在目录，下文用 `$SKILL` 表示；命令中替换为实际绝对路径，与当前 CWD 无关。不要写死用户路径（skill 可能安装在任意位置）。

```bash
node "$SKILL/bin/open-pptd.js" serve [--port 55173] [--project <项目目录>]  # 启动网页编辑器（本地文件与网页实时同步）
node "$SKILL/bin/open-pptd.js" export <deck.pptd> [-o out.pptx] [--theme <key>]  # 命令行导出 PPTX
node "$SKILL/bin/open-pptd.js" export-project <deck.pptd> [-o out.zip]  # 导出项目包（pptd+pages+media 原样打包）
```

`bin/open-pptd.js` 是唯一命令行入口：只运行，不要打开阅读（引擎实现）。

## 参考文档导航

| 文件 | 内容 | 何时读 |
|---|---|---|
| references/components.md | 图标全清单（192）+ 形状全清单（26）+ 选型速查 | 选图标/形状时 |
| references/pptd-format.md | 格式完整规范：manifest/页面/8 种元素 YAML 写法 | 写或改页面文件时 |
| references/styles.md | 10 种风格：场景/配色/页型配方/字体建议/预置组合表 | 定风格、设计布局时 |
| references/themes.md | 颜色令牌 + 16 套色系 | 选题、配色调色时 |
| references/fonts.md | 字体决策流程 + 系统/网络字体池 + YAML 四层写法 | 选字体、写 fonts 声明时 |
| themes/ | 预置主题完整项目（示例数据，可读，非引擎代码） | 需要看示例写法时 |

## 铁律

1. 禁止阅读引擎源码（见「使用边界」）；文档缺失的能力按不支持处理
2. 预览与导出不一致 = bug：如实转述现象，不要自行阅读/修改引擎源码排查
3. 不引入 npm 依赖：不执行 npm install、不改 package.json（运行时零依赖是核心承诺）
4. 字体跟随 deck 声明：默认微软雅黑；系统字体（雅黑/宋体/黑体/楷体/仿宋/幼圆）导出不嵌入；网络字体（OFL 可再分发）带 file/url 资源声明，导出自动子集化嵌入；不要用未安装且未声明来源的字体
5. 主题色一律用令牌（$primary 等），禁止写死主题 hex（例外：风格特征背景如深底/纸底，属风格不属于色系）
6. 页面元素顺序 = 图层顺序（先写的在下层）
7. 字符串字段一律单引号或块标量，禁止裸值：裸值遇 :、#、\n 会静默出错
