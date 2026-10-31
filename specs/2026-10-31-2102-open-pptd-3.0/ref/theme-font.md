# theme-font · 主题库与字体库重构

> 目标：把“deck 主题 / 可复用资源 / 查看器外观”拆开；主题像资源一样可保存/复用；字体全局可复用；Design 面板替代旧字体/配色 popover。

## 1. 概念分离

```text
Deck 主题       每个项目内联快照：colors / textStyles / tableStyles
主题库          内置主题 + 我的主题（~/.open-pptd/themes/*.json）
字体库          内置 registry + 我的字体（~/.open-pptd/assets/fonts/user）
查看器外观      浅色 / 深色 / 跟随系统（本地偏好，不写 deck）
```

- Deck 主题是快照，不是活引用；应用主题 = 拷贝进 deck。
- 主题不含字体字节；textStyles/tableStyles 的 `fontFamily` 由字体库解析。
- 外观与 deck 主题彻底分离；当前 theme-panel 混入的明暗切换移到 Design > 外观。

## 2. 主题模型

```yaml
# ~/.open-pptd/themes/<id>.json
version: 1
id: user-20261031-consult-warm
name: 咨询暖灰
description: 内部分享 / 经营复盘
builtin: false
colors:
  primary: "#18324E"
  accent: "#D19B2E"
  # ... 17 standard keys + custom tokens (e.g. gold, paper)
textStyles:
  title: { fontSize: 32, color: "$text", bold: true, lineHeight: 1.3 }
  # ...
tableStyles:
  default:
    cellStyle: { fontSize: 13, color: "$text", fill: {...}, border: {...} }
    # ...
```

- **完整快照**：colors + textStyles + tableStyles；不是只存颜色。
- 内置主题：默认主题 + 10 个 palette 展开为完整主题（默认 textStyles/tableStyles + palette colors）。
- 用户主题：JSON；id/name/description/version；builtin 只读。
- 主题 UI v1 以颜色编辑为主；textStyles/tableStyles 随存/应用，但不提供完整可视化编辑器（后移）。
- 自定义颜色 token：colors 任意 key；UI 添加/编辑/删除；所有颜色选择器读取全部 token。

## 3. 应用语义

```js
applyTheme(currentTheme, themeFile) → { theme, preserved }
```

1. 用主题快照覆盖 colors/textStyles/tableStyles。
2. 扫描 deck 中所有 `$token`、`style`、`textStyle`、table `style` 引用。
3. 新主题缺少、但 deck 仍引用的颜色/样式，从旧主题保留；报告 `preserved`。
4. 未被引用的旧项丢弃。
5. 应用可撤销；面板显示“保留了 N 个自定义颜色/样式”。
6. 当前主题检测：按主题内容匹配；有额外自定义项显示“自定义（基于 XX）”，不存活引用。

**理由**：AI deck 常用 `$gold` 等自定义 token；纯替换会断引用，纯合并会积累旧 token。保留“仍被引用”的项是最干净的折中。

**取舍**：主题切换不是字面全替换；未被引用的自定义 token 会丢失，需要先保存到主题库。

## 4. 内置 / 用户主题库

- 内置：包内数据/资源；只读；不能覆盖/删除。
- 用户：home；`ThemeStore` 读写；原子写；导入/导出 JSON。
- 主题库卡片：名称 + 6 个色块；应用；保存当前；导入/导出；删除；内置 badge。
- 保存当前为主题：名称/描述 → 写 home；同名提示覆盖/另存。
- 导入：校验 schema/version/colors；重复 id 生成新 id；非法字段规范化。
- 导出：JSON；不打包字体字节；字体依赖由字体库解析。
- 静态站：只用内置主题；用户库需要本地 server（不做 IndexedDB）。

## 5. 自定义颜色 UI

- 主题 tab 的颜色区显示全部 token：
  - 标准 17 key 显示中文名（主色/背景/文字/...）。
  - 自定义 token 显示 key/名称。
  - 每行 swatch + 名称 + picker + hex（#RRGGBB/#RRGGBBAA）。
- “+ 添加颜色”：key（如 `gold`）、显示名（可选）、值；立即写入 deck.theme.colors。
- 编辑：即时 applyTheme/commit；可撤销。
- 删除：统计 deck 引用数量；被引用 → 警告/阻止；未被引用可删。
- 颜色选择器（文字/表格/图表）使用全部 token + custom；不再固定 swatch 列表。
- 重命名 token 并更新引用后移；v1 只支持新增/编辑/删除。
- 预设卡片高亮只比较主题包含的 key；额外 custom token 不算不同。

## 6. 字体库

### 6.1 模型

- 内置：`assets/fonts/registry.json` + home/包内字节；只读 registry。
- 用户：`~/.open-pptd/assets/fonts/user/*` + 用户索引（family/key/file/source/license/size/subset）。
- 导入本地/URL：复制字节到 home + 元数据；全局复用。
- deck.fonts 只引用 family；不再区分“我的字体/内置字体”。
- 浏览器预览：FontFace 注册；CLI 导出：同一 home 字节；解决 local font 不可移植。

### 6.2 字体使用/状态

Design > 字体：
- 顶部“当前 deck 使用的字体”：可嵌入/系统/缺失；缺失提供“从字体库选择/导入”。
- 全局字体库：内置 + 我的；搜索/预览/导入/删除。
- 字体选择器（文字/表格/图表）：按“主题字体 / 我的字体 / 内置 / 系统”分组；显示状态。
- 删除字体：提示可能被项目使用；不扫描所有项目。
- 系统字体：仅声明，不嵌入；字体选择器直接可选，不再“复制注册名”。

### 6.3 嵌入

- 导出全局设置：嵌入字体开/关 + 子集/完整。
- 所有 deck 用到的库字体按此策略；系统字体不嵌入；缺失字体警告。
- 删除每字体 embed/subset chip；删除导出对话框重复的字体管理控件；保留“字体管理…”跳转 Design > 字体。
- 本地字体导入后重新打开不再要求重新选文件；CLI/浏览器一致。
- 项目包携带字体后移；PPTX 嵌入负责交付；项目包依赖全局字体库。

## 7. Design 面板

- 顶栏一个“设计”按钮；删除“字体”“配色”两个按钮。
- Tabs：
  1. 主题：当前主题、主题库、保存/导入/导出、颜色令牌、样式摘要。
  2. 字体：当前 deck 字体状态、全局库、导入、嵌入说明。
  3. 外观：浅色/深色/跟随系统。
- 面板用抽屉/模态；桌面/窄屏适配；改动即时预览；主题/颜色可撤销；库导入/删除是全局操作，不进 deck undo，需明确提示。
- 文字编辑器字体下拉直接使用字体库；颜色选择器直接使用全部主题 token。

## 8. 存储 / API / CLI

- Paths：
  - `paths.themes` = `~/.open-pptd/themes`
  - `paths.fonts` = `~/.open-pptd/assets/fonts`
  - 用户字体 = `.../fonts/user/` + 索引
- Server：
  - `GET/POST/PUT/DELETE /api/themes`（list/read/save/delete/import/export）
  - `GET/POST/DELETE /api/fonts`（list/import/remove）
  - 仅 loopback；路径 traversal 校验；大小限制；原子写。
- CLI：
  - `assets themes list|import|export|delete|apply`
  - `assets fonts list|import|remove`
  - `assets sync` 只内置字体/图标；不碰用户库
  - `doctor` 报告主题/字体库路径与计数
- 静态站：内置主题/字体；用户库只读/不可写；提示本地 `open` 服务。

## 9. 迁移 / 无兼容

- 删除旧 `theme-panel.js`、`font-panel.js`、per-deck `state.fontLibrary`、per-font embed/subset chips、旧 `fonts/icons` CLI。
- deck.theme 官方 colors/textStyles/tableStyles 保持可解析；主题库附加元数据只在库 JSON，不写进 deck（当前主题检测即可）。
- 旧 deck.fonts 中 registry/url/file 条目仍可解析：registry 命中内置/用户库；file 若在用户库/项目内可解析，否则缺失提示；不自动迁移字节。
- 不做旧主题 preset 字符串兼容（theme: "tech" 仍非官方格式，不新增支持）。
- 主题/字体 UI 全部换新；不保留旧面板隐藏入口。

## 10. 测试 / 验收

- ThemeStore：list/read/save/import/export/delete；builtin 只读；非法 JSON/重复 id。
- applyTheme：替换 + 保留被引用 token/style；未引用丢弃；preserved 报告；undo。
- 自定义颜色：添加/编辑/删除；被引用阻止/警告；颜色选择器可见。
- FontLibrary：import local/URL/list/remove；deck refs；浏览器/CLI 字节一致；系统/缺失状态。
- 嵌入：全局开/关、subset/full；缺失警告；无 per-font chip。
- Design 面板 e2e：主题应用/保存/颜色新增；字体导入/选择；外观切换。
- 迁移：旧 deck fonts/theme 打开不崩溃；缺失字体提示；无旧 CLI。
- 性能：字体库/主题库扫描不阻塞首屏；懒加载 Design 面板。
