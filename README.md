# open-pptd — 本地 PPTD 演示文稿技能

> 🌏 English version: [README.en.md](README.en.md)

一套「内容 → 可编辑项目 → 实时预览 → PPTX」的演示文稿生成闭环，全部在本地运行，**零依赖、无需联网、无需 npm install**。

**先去线上画廊看效果 👉 https://shingwha.github.io/open-pptd/**

无需安装，浏览器直接打开：精选示例封面实时渲染，点卡片进编辑器随意修改、导出 PPTX，或下载项目包（zip）带回本地继续编辑。

## 示例画廊

仓库自带 9 套精选示例（`examples/`），点击图片直接在线打开编辑：

<p align="center">
  <a href="https://shingwha.github.io/open-pptd/editor/?deck=examples%2Fbusiness-review-7p%2Fdeck.pptd"><img src="docs/images/business-review.png" width="32%" alt="远川 2025 · 一条河的水文年报"/></a>
  <a href="https://shingwha.github.io/open-pptd/editor/?deck=examples%2Fcity-cycling-report-7p%2Fdeck.pptd"><img src="docs/images/city-cycling.png" width="32%" alt="两轮上的城市脉搏 · 骑行数据年报"/></a>
  <a href="https://shingwha.github.io/open-pptd/editor/?deck=examples%2Ftide-festival-sponsorship-7p%2Fdeck.pptd"><img src="docs/images/tide-festival.png" width="32%" alt="潮汐音乐节 · 招商合作方案"/></a>
</p>

<p align="center">
  <a href="https://shingwha.github.io/open-pptd/editor/?deck=examples%2Fmiaopai-saas-bp%2Fdeck.pptd"><img src="docs/images/miaopai.png" width="32%" alt="秒排 A 轮商业计划"/></a>
  <a href="https://shingwha.github.io/open-pptd/editor/?deck=examples%2Fislelight-brand-book%2Fdeck.pptd"><img src="docs/images/islelight.png" width="32%" alt="屿光品牌手册"/></a>
  <a href="https://shingwha.github.io/open-pptd/editor/?deck=examples%2Fbrand-mori-showcase-7p%2Fdeck.pptd"><img src="docs/images/brand-mori.png" width="32%" alt="MORI 森野品牌提案"/></a>
</p>

<p align="center">
  <a href="https://shingwha.github.io/open-pptd/editor/?deck=examples%2Fshanmingji-2026-launch%2Fdeck.pptd"><img src="docs/images/shanmingji.png" width="32%" alt="山茗集品牌发布会"/></a>
  <a href="https://shingwha.github.io/open-pptd/editor/?deck=examples%2Ftech-architecture-review-7p%2Fdeck.pptd"><img src="docs/images/tech-architecture.png" width="32%" alt="订单中台架构评审"/></a>
  <a href="https://shingwha.github.io/open-pptd/editor/?deck=examples%2Fev-range%2Fdeck.pptd"><img src="docs/images/ev-range.png" width="32%" alt="电动汽车续驶里程预测"/></a>
</p>

## 这是什么

- **PPTD** 是人类可读的 YAML 演示格式：一个 manifest（`deck.pptd`）+ 每页一个 `pages/*.page` + `media/` 图片
- 浏览器网页编辑器实时预览/共同修改（改文件刷新即生效），最终导出标准 `.pptx`
- **预览（浏览器）= 导出（PowerPoint）**：单一定义、双消费者（writer / renderer 同源）
- 能力覆盖：13 种图表、187 种预置形状 + 自定义路径、约 2000 个 Font Awesome 图标（三风格）、LaTeX 公式混排、字体嵌入、淡入淡出转场

> 本项目实现完全独立、全部自研（网页编辑器、PPTX writer、图表与 LaTeX 渲染、CLI 导出链路），未使用任何第三方编辑器代码或逆向实现；图标采用 [Font Awesome Free](https://fontawesome.com/license/free)（CC BY 4.0）。

## 安装

前置仅 **Node.js v18+**（无需 npm install、无需联网；render 命令推荐 Node 21+）；浏览器推荐 Chrome / Edge（「打开文件夹」保存功能需要）。

二选一，装到你的 AI 工具的 **skills 文件夹**：

**方式一：下载发布包（推荐，无需 git）**

1. 到 [Releases](https://github.com/Shingwha/open-pptd/releases) 页面下载最新的 `open-pptd-v*.zip`
2. 解压到 skills 文件夹，得到 `<skills 文件夹>/open-pptd/`；更新时重新下载覆盖即可

**方式二：git clone（适合跟踪更新 / 参与开发）**

```bash
git clone https://github.com/Shingwha/open-pptd <你的 skills 文件夹>/open-pptd
```

skills 文件夹的位置因工具而异：Claude Code 在 `~/.claude/skills`，pi 在 `~/.pi/agent/skills`，其他工具按其配置。技能内所有路径均相对 skill 目录，装到哪里都能直接工作。

### 首次使用：下载字体库（可选但推荐）

字体文件本体（约 155MB）不入包，首次使用前二选一：

```bash
# 方案 A：一次全量下载（一劳永逸，约 155MB，离线可用）
node bin/open-pptd.js fonts download all

# 方案 B：按需下载（用到哪个下哪个，导出前跑）
node bin/open-pptd.js fonts download 得意黑
```

> 未下载字体不影响导出：导出时自动跳过嵌入并告警，PPTX 照常生成（打开时回退系统字体）。

装好后交给 AI 助手即可（`SKILL.md` 是完整工作流入口）；CLI 用法（serve / export / render / check / fonts）见 `node bin/open-pptd.js --help`。

## License

MIT
