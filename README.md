# open-pptd — 本地 PPTD 演示文稿技能

一套"内容 → 可编辑项目 → 实时预览 → PPTX"的演示文稿生成闭环，全部在本地运行，**零依赖、无需联网、无需 npm install**。

> 🌐 **在线体验（GitHub Pages）：https://shingwha.github.io/open-pptd/** —— 主题画廊 + 网页编辑器，浏览器直接打开就能看效果、玩一玩。

## 这是什么

- **PPTD** 是人类可读的 YAML 演示格式：一个 manifest（`deck.pptd`）+ 每页一个 `pages/*.page` + `media/` 图片
- 浏览器网页编辑器实时预览/共同修改（改文件刷新即生效），最终导出标准 `.pptx`
- 内置 10 种风格类型（排版方案）× 16 套配色（色系），自由组合，换色全页联动
- 预览（浏览器）= 导出（PowerPoint），单一定义、双消费者

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

# 2. 用 AI 助手生成 deck.pptd + pages/*.page（格式规范见 references/pptd-format.md）

# 3. 命令行导出 PPTX / 项目包
node bin/open-pptd.js export /path/to/你的项目目录/deck.pptd -o out.pptx
node bin/open-pptd.js export-project /path/to/你的项目目录/deck.pptd -o project.zip

# 4.（可选）启动网页编辑器实时预览（根路径即主题画廊）
node bin/open-pptd.js serve --project /path/to/你的项目目录 --port 55173
# 浏览器打开启动时打印的链接
```

`themes/` 目录是 10 个预置主题组合的完整项目：需要看页面写法时翻阅，或在仓库根执行 `node bin/open-pptd.js serve --project themes/01-商务经典` 直接体验效果。

## GitHub Pages 部署

在线站点：**https://shingwha.github.io/open-pptd/**（push main 分支即自动更新）

整个项目可部署为纯静态站点（编辑器 + 主题画廊均无后端依赖）：

```bash
# 1. push main 分支即自动部署（.github/workflows/pages.yml）
# 2. 仓库 Settings → Pages → Source 选 "GitHub Actions"
# 3. 访问 https://<user>.github.io/open-pptd/
```

站点结构：根路径重定向到 `editor/` 主题画廊（多主题卡片 → 逐页详情 → 编辑器），`?deck=` 相对路径加载项目，"打开文件夹"与"导出 PPTX"均为浏览器本地能力；实时刷新在静态托管下自动降级为手动刷新。

## 目录结构

```
open-pptd/
├── SKILL.md                  # 给 AI 助手的完整工作流说明
├── README.md                 # 本文档（给人看）
├── index.html                # GitHub Pages 入口（重定向到 editor/ 画廊）
├── references/               # 按需读取的参考文档
│   ├── pptd-format.md        #   PPTD 格式完整规范
│   ├── themes.md             #   颜色令牌 + 16 套色系 + 风格×配色搭配表
│   └── styles.md             #   10 种风格类型：场景/推荐配色/页型配方/写法要点
├── themes/                   # 10 个预置主题组合（deck.pptd + pages/，画廊展示用）
│   └── manifest.json         #   主题清单（scripts/gen-themes-manifest.js 生成）
├── scripts/                  # 构建/维护脚本（主题清单生成）
├── tests/                    # 测试（公式回归 + 浏览器冒烟，见 tests/README.md）
├── bin/open-pptd.js          # CLI（serve / export）
├── lib/                      # 本地服务器（静态 + /events SSE 推送 + /api/save 写回）+ 导出逻辑
├── .github/workflows/        # GitHub Pages 自动部署
└── editor/                   # 网页编辑器（纯前端：画廊 ⇄ 详情 ⇄ 编辑器）
```

## 测试

```bash
npm test                 # 公式转换回归：204 个用例 vs 官方 XSLT 固化参考（字节级一致）
npm run test:smoke       # 浏览器冒烟（画廊/缓存/编辑器加载，需 Chrome）
npm run test:live        # 项目模式 E2E（SSE 实时刷新 + 保存写回磁盘，需 Chrome）
```

详见 `tests/README.md`。重新生成公式参考（改语料后，需本机 Office）：`npm run test:fixtures` + `python tests/formula/formula-oracle.py --batch tests/formula/fixtures/mml tests/formula/fixtures/omml-ai`。

## 作为 AI 技能使用

把整个目录作为 skill 安装（SKILL.md 是入口）。AI 会按以下流程工作：

1. 与用户确认内容/场景→风格类型/配色/规模/交付方式（默认不预览）
2. 从零创建项目（`deck.pptd` + `pages/*.page`），按需参考 `themes/` 写法
3. 按需启动 `serve --project` 让用户浏览器实时预览
4. 用户满意后导出 `.pptx` 交付

## License

MIT
