# open-pptd — 本地 PPTD 演示文稿技能

> 🌏 English version: [README.en.md](README.en.md)

一套「内容 → 可编辑项目 → 实时预览 → PPTX」的演示文稿生成闭环，全部在本地运行，**零依赖、无需联网、无需 npm install**。

## 这是什么

- **PPTD** 是人类可读的 YAML 演示格式：一个 manifest（`deck.pptd`）+ 每页一个 `pages/*.page` + `media/` 图片
- 浏览器网页编辑器实时预览/共同修改（改文件刷新即生效），最终导出标准 `.pptx`
- **预览（浏览器）= 导出（PowerPoint）**：单一定义、双消费者（writer / renderer 同源）
- 能力覆盖：13 种图表、187 种预置形状 + 自定义路径、LaTeX 公式混排、字体嵌入、淡入淡出转场

> 本项目实现完全独立、全部自研（网页编辑器、PPTX writer、图标库、图表与 LaTeX 渲染、CLI 导出链路），未使用任何第三方编辑器代码或逆向实现。

## 前置条件

- **Node.js v18+**（唯一依赖，无需安装任何 npm 包）
- 浏览器推荐 Chrome / Edge（「打开文件夹」保存功能需要）

## 安装（3 步）

把仓库 clone 到你的 AI 工具的 **skills 文件夹** 即可使用：

```bash
# 方式一：指定目录克隆（推荐，目录名保持 open-pptd）
git clone https://github.com/Shingwha/open-pptd-publish <你的 skills 文件夹>/open-pptd

# 方式二：先进入 skills 文件夹再克隆
cd <你的 skills 文件夹>
git clone https://github.com/Shingwha/open-pptd-publish open-pptd
```

skills 文件夹的位置因工具而异：

| AI 工具 | skills 文件夹 |
|---|---|
| Claude Code | `~/.claude/skills` |
| pi | `~/.pi/agent/skills` |
| 其他自定义目录 | 按你的工具配置 |

> 技能内所有路径均相对 skill 目录，装到哪里都能直接工作。前置条件仅 Node.js v18+（无需 npm install、无需联网）。

### 首次使用：下载字体库（可选但推荐）

字体文件本体（约 155MB）不入 git，首次使用前二选一：

```bash
# 方案 A：一次全量下载（一劳永逸，约 155MB，离线可用）
node bin/open-pptd.js fonts download all

# 方案 B：按需下载（用到哪个下哪个，导出前跑）
node bin/open-pptd.js fonts download 得意黑
```

> 未下载字体不影响导出：导出时自动跳过嵌入并告警，PPTX 照常生成（打开时回退系统字体）。

## 快速开始

```bash
# 1. 创建项目目录
mkdir -p /path/to/项目目录/pages /path/to/项目目录/media

# 2. 用 AI 助手生成 deck.pptd + pages/*.page（格式规范见 references/pptd.md）

# 3. 命令行导出 PPTX / 项目包
node bin/open-pptd.js export /path/to/项目目录/deck.pptd -o out.pptx
node bin/open-pptd.js export-project /path/to/项目目录/deck.pptd -o project.zip

# 4.（可选）启动网页编辑器实时预览
node bin/open-pptd.js serve --project /path/to/项目目录 --port 55173
# 浏览器打开启动时打印的链接
```

格式规范按需查阅 `references/`：`pptd.md`（PPTD v2 完整规范，**一切格式决策的唯一依据**）、`shapes.md`（187 种预置形状）、`fonts.md`（字体清单）、`icons.md`（图标清单）、`slides_categories.md`（各场景排版方案）、`general-poster.md`（海报/信息图单页设计）。

## 目录结构

```
open-pptd/
├── SKILL.md                  # 给 AI 助手的完整工作流说明
├── README.md                 # 本文档（给人看，中文）
├── README.en.md              # 英文版本文档
├── index.html                # 编辑器入口（重定向到 editor/）
├── bin/open-pptd.js          # CLI（serve / export / export-project / fonts）
├── lib/                      # 本地服务器（静态 + SSE 实时刷新 + 保存写回）+ 导出逻辑
├── editor/                   # 网页编辑器（纯前端，无后端依赖）
│   ├── core/                 #   数据模型 / 富文本 / 主题 / 几何 / 图标库
│   ├── writer/               #   PPTX writer（OOXML 生成，与 PowerPoint 结构对齐）
│   ├── renderer/             #   预览渲染（与 writer 同源）
│   ├── types/                #   元素类型注册表（text/shape/line/image/icon/table/chart）
│   └── app/                  #   编辑器装配（状态/视图/IO/工具栏）
├── assets/                   # 内置资源（icons/ 图标源；fonts/ 字体库 29 种免费商用字体，本地资源不上传 GitHub）
├── references/               # 按需读取的参考文档（pptd.md / shapes.md / fonts.md / icons.md / …）
├── scripts/                  # 构建脚本（图标库 / 预置几何 / 参考文件生成）
├── tests/                    # 测试（见 tests/README.md：组件项目 + 一键回归 + E2E）
└── package.json
```

## 测试

```bash
npm test                      # 一键回归：导出全部组件项目 + 包一致性 + 颜色 + 形状全量 + 公式 + 图标
npm run test:live             # 项目模式 E2E（SSE 实时刷新 + 保存写回磁盘，需 Chrome）
npm run test:incremental      # 渐进加载 E2E（写入中的项目逐页显示，需 Chrome）
```

详见 `tests/README.md`（发布仓库不含测试，测试与开发资源见开发仓库）。

## 仓库说明

本项目分两个仓库：

- **发布仓库 [open-pptd-publish](https://github.com/Shingwha/open-pptd-publish)（默认使用）**：skill 运行时精简版，仅供直接安装使用，不含测试、图标源与生成脚本。不参与代码开发的用户 clone 这个即可（见上方安装）。
- **开发仓库 [open-pptd](https://github.com/Shingwha/open-pptd)（参与开发时用）**：完整源码，含全部测试、图标源文件与生成脚本。

发布仓库由开发仓库经 `npm run sync:publish -- --push` 自动同步（白名单快照，见开发仓库 `scripts/sync-publish.mjs`），其内容以开发仓库 `main` 分支为准。

## 作为 AI 技能使用

把整个目录作为 skill 安装（SKILL.md 是入口）。AI 会按以下流程工作：

1. 与用户确认内容/场景 → 确定主题（配色/字体/表格样式，生成时一次性设计决策写入 `deck.theme`；编辑器内置 10 套配色预设可一键替换 `theme.colors`，CLI 导出支持 `--theme <key>`）
2. 从零创建项目（`deck.pptd` + `pages/*.page`），默认交付 PPTD 项目 + 本地导出的 `.pptx` 双产物
3. 按需启动 `serve --project` 让用户浏览器实时预览/编辑/导出
4. 视觉审查通过后导出 `.pptx` 交付（默认嵌入字体 + 淡入淡出转场）

## License

MIT
