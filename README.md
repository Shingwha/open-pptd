# open-pptd — 本地 PPTD 演示文稿技能

一套"内容 → 可编辑项目 → 实时预览 → PPTX"的演示文稿生成闭环，全部在本地运行，**零依赖、无需联网、无需 npm install**。

## 这是什么

- **PPTD** 是人类可读的 YAML 演示格式：一个 manifest（`deck.pptd`）+ 每页一个 `pages/*.page` + `media/` 图片
- 浏览器网页编辑器实时预览/共同修改（改文件刷新即生效），最终导出标准 `.pptx`
- 预览（浏览器）= 导出（PowerPoint），单一定义、双消费者（writer / renderer 同源）
- 能力覆盖：13 种图表（bar/line/area/scatter/bubble/pie/radar/waterfall/treemap/sunburst/candlestick 等）、187 种预置形状 + 自定义路径、LaTeX 公式混排、字体嵌入、淡入淡出转场

## 前置条件

- **Node.js v18+**（唯一依赖，无需安装任何 npm 包）
- 浏览器推荐 Chrome / Edge（"打开文件夹"保存功能需要）

## 安装

### git clone（推荐）

把仓库直接 clone 到任意 AI 工具的 **skills 文件夹**即可使用，无需任何额外配置：

```bash
# 方式一：克隆到指定 skills 文件夹
 git clone https://github.com/Shingwha/open-pptd <你的 skills 文件夹>/open-pptd

# 方式二：先进入 skills 文件夹再克隆（目录名自动为 open-pptd）
cd <你的 skills 文件夹>
git clone https://github.com/Shingwha/open-pptd
```

skills 文件夹的位置因 AI 工具而异（Claude Code 的 `~/.claude/skills`、pi 的 `~/.pi/agent/skills`、其他自定义目录等），找到你所用工具存放 skill 的目录、把 `open-pptd` clone 进去即可。本技能内所有路径都是相对 skill 目录的，装到哪里都能直接工作。

> 前置条件仅 Node.js v18+（无需 npm install、无需联网）。

## 快速开始

```bash
# 1. 创建你的项目目录
mkdir -p /path/to/你的项目目录/pages /path/to/你的项目目录/media

# 2. 用 AI 助手生成 deck.pptd + pages/*.page（格式规范见 references/pptd.md）

# 3. 命令行导出 PPTX / 项目包
node bin/open-pptd.js export /path/to/你的项目目录/deck.pptd -o out.pptx
node bin/open-pptd.js export-project /path/to/你的项目目录/deck.pptd -o project.zip

# 4.（可选）启动网页编辑器实时预览
node bin/open-pptd.js serve --project /path/to/你的项目目录 --port 55173
# 浏览器打开启动时打印的链接
```

格式规范按需查阅 `references/`：`pptd.md`（PPTD v2 完整规范，字段表/约束/示例，**一切格式决策的唯一依据**）、`shapes.md`（187 种预置形状）、`fonts.md`（字体清单）、`icons.md`（图标清单）、`slides_categories.md`（各场景排版方案）、`general-poster.md`（海报/信息图单页设计）。

## 目录结构

```
open-pptd/
├── SKILL.md                  # 给 AI 助手的完整工作流说明
├── README.md                 # 本文档（给人看）
├── HANDOFF.md                # 交接文档：当前状态 / 测试流程 / 下一步任务
├── index.html                # 编辑器入口（重定向到 editor/）
├── bin/open-pptd.js          # CLI（serve / export / export-project）
├── lib/                      # 本地服务器（静态 + SSE 实时刷新 + 保存写回）+ 导出逻辑
├── editor/                   # 网页编辑器（纯前端，无后端依赖）
│   ├── core/                 #   数据模型 / 富文本 / 主题 / 几何 / 图标库
│   ├── writer/               #   PPTX writer（OOXML 生成，与 PowerPoint 结构对齐）
│   ├── renderer/             #   预览渲染（与 writer 同源）
│   ├── types/                #   元素类型注册表（text/shape/line/image/icon/table/chart）
│   └── app/                  #   编辑器装配（状态/视图/IO/工具栏）
├── assets/icons/             # Bootstrap Icons 源（192 个 SVG，scripts/gen-icons.mjs 生成内置库）
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

详见 `tests/README.md`。

## 作为 AI 技能使用

把整个目录作为 skill 安装（SKILL.md 是入口）。AI 会按以下流程工作：

1. 与用户确认内容/场景 → 确定主题（配色/字体/表格样式，生成时一次性设计决策写入 `deck.theme`）
2. 从零创建项目（`deck.pptd` + `pages/*.page`），默认交付 PPTD 项目 + 本地导出的 `.pptx` 双产物
3. 按需启动 `serve --project` 让用户浏览器实时预览/编辑/导出
4. 视觉审查通过后导出 `.pptx` 交付（默认嵌入字体 + 淡入淡出转场）

## License

MIT
