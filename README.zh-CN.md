<div align="center">

# open-pptd

**对 AI 说一句话，得到可编辑的 PPT 或海报，导出为原生 PPTX。**

`v3.0.1` · `MIT` · `Node ≥ 18` · `contract 3.0` · 零依赖 · 零构建

[English](README.md) · [线上画廊](https://shingwha.github.io/open-pptd/) · [发布流程](docs/release-workflow.md)

<img src="docs/images/editor.png" width="880" alt="open-pptd 编辑器：纸色画布 + 选中操作条 + 底部页面缩略条"/>

</div>

## 30 秒上手

前置只有一个：**Node.js ≥ 18**。

**Windows（PowerShell）**

```powershell
irm https://raw.githubusercontent.com/Shingwha/open-pptd/main/install.ps1 | iex
```

**macOS / Linux**

```sh
curl -fsSL https://raw.githubusercontent.com/Shingwha/open-pptd/main/install.sh | sh
```

装到 `~/.open-pptd` 并写入用户级 PATH（不需要管理员）。重复运行安装器会升级旧版本，已是最新则不做改动；仅在需要强制重装时使用 Windows 的 `-Force` 或 macOS/Linux 的 `--force`。不装也行：clone 本仓库后跑 `node bin/open-pptd.js …` 效果相同。

```sh
open-pptd open <项目目录> --detach --json   # 浏览器打开编辑器，改文件实时刷新
open-pptd build <项目目录>/deck.pptd --format pptx
open-pptd check <项目目录>/deck.pptd        # 只读体检
open-pptd assets list                       # 字体 / 图标
open-pptd doctor                            # 环境自检
```

## 和 AI 一起用

复制下面的 Prompt，安装或升级应用和 Skill：

```text
Install or upgrade open-pptd and its Skill on my device. Detect my OS and current AI tool's skills directory, then execute the commands directly. To install or upgrade the CLI, use Windows (PowerShell): irm https://raw.githubusercontent.com/Shingwha/open-pptd/main/install.ps1 | iex; macOS/Linux: curl -fsSL https://raw.githubusercontent.com/Shingwha/open-pptd/main/install.sh | sh. After that, run open-pptd assets skill install --dir [actual skills directory], using the detected path.
```

如果只想手动安装 Skill，使用 agent 的技能目录（Claude Code 为 `~/.claude/skills`，pi 为 `~/.pi/agent/skills`，其他工具按其配置）。三种来源，按优先级：

```sh
# A. CLI 安装（推荐；--force 覆盖已有安装）
open-pptd assets skill install --dir ~/.claude/skills

# B. Release zip：稳定名（或固定版本 open-pptd-skill-v3.0.1.zip）
curl -L -o open-pptd-skill.zip https://github.com/Shingwha/open-pptd/releases/latest/download/open-pptd-skill.zip
unzip open-pptd-skill.zip -d <技能目录>
# PowerShell: Invoke-WebRequest https://github.com/Shingwha/open-pptd/releases/latest/download/open-pptd-skill.zip -OutFile open-pptd-skill.zip
#             Expand-Archive open-pptd-skill.zip -DestinationPath <技能目录>

# C. 源码回退：从本仓库复制 skill/
cp -r skill <技能目录>/open-pptd
```

AI 会交付**两样东西**：可编辑的 PPTD 项目目录（manifest + pages + media）和可直接发送的 `.pptx`（字体已嵌入，PowerPoint 打开零修复）。

## 能做什么

- **PPTD，不是黑盒** — AI 写出人类可读的 YAML 项目（manifest + pages + media），可手改；`open` 实时展示每一页的生成过程。
- **最小网页编辑器** — 文字/表格/图表内容编辑，拖动缩放 + 对齐参考线，多选，页面插入/删除/排序，Design 面板管理颜色令牌、字体与深浅色。
- **原生 PPTX + PNG** — 原生可编辑 PowerPoint（淡入淡出转场）、逐页 PNG、项目包。预览与 PNG 走同一条 layout/paint 管线；与浏览器预览存在轻微字体度量差异属正常。
- **图表、形状、图标、公式** — 13 种图表 + 数据网格，187 种预置形状 + 自定义路径，约 2000 个 Font Awesome 图标，LaTeX 公式混排。
- **字体** — 字体库，子集/完整字体嵌入与导出前体检（`build --fetch` 显式补齐缺失字体）。
- **给 AI 的 6 个 kit** — academic、business-review、consulting-report、brand-proposal、lecture、poster。

## 从 2.x 迁移

旧命令已删除：`serve` → `open`，`export` → `build --format pptx`，`render` → `build --format png`；`export-project` → `build --format bundle`，`ensure` → `check` / `build --fetch`，`paths` → `doctor`。完整映射见 [CHANGELOG.md](CHANGELOG.md)。

发布打包与版本 bump / tag 清单见 [docs/release-workflow.md](docs/release-workflow.md)。

## License

MIT · 图标基于 [Font Awesome Free](https://fontawesome.com/license/free)（CC BY 4.0）
