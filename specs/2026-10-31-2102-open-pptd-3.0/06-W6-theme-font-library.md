# W6 · 主题库 + 全局字体库（核心/API/CLI）

> 分支/前置：W2 已合并；可与 W4/W5 按文件所有权并行（theme/font vs type/table）；若共享 barrel/package exports 冲突则串行。写入范围 `packages/model/theme*`、`packages/model/font*`、`packages/paths.js`、`packages/server/{api,themes,fonts}.js`、`packages/cli/assets.js`、`tests/regression/{theme-library,font-library}.mjs`（barrel/package 由 lead）。
> 本波只做库核心/存储/API/CLI；Design 面板 UI 在 W7。

## 目标

- ThemeStore：内置 10 套完整主题（默认 styles + palette colors）+ 用户主题 `~/.open-pptd/themes/*.json`；list/read/save/import/export/delete。
- applyTheme：替换 colors/textStyles/tableStyles；扫描 deck 引用，保留被引用但主题缺少的 token/style；未引用丢弃；报告 preserved；可撤销。
- 自定义颜色 token：任意 key；添加/编辑/删除；usage 统计/删除警告；颜色选择器读取全部 token。
- FontLibrary：内置 registry + 用户字体 home；import local/URL 复制字节+元数据；list/remove/resolve；deck.fonts 只引用 family。
- Server `/api/themes` + `/api/fonts`；CLI `assets themes/fonts`；doctor 计数；静态站内置只读。
- 删除 per-deck fontLibrary/per-font embed/subset chips 的**数据层**（UI 在 W7）；字体嵌入全局设置。

## 范围

- model/theme 结构、内置主题生成、applyTheme/refs 扫描；theme store adapter。
- model/font-library/user index；ResourceProvider font 解析接入；deck.fonts 引用。
- paths themes/user fonts；server API（loopback/路径校验/原子写）；cli assets themes/fonts。
- 测试：主题应用/导入导出/自定义 token；字体导入/删除/跨端字节；缺失/系统状态；embedding 设置。

## 非目标

- 不做 Design 面板 UI（W7）。
- 不做主题 textStyles/tableStyles 可视化编辑器（后移）。
- 不做项目包携带字体。
- 不做 IndexedDB/静态站用户库。
- 不改 CLI 5 命令面（W10）。

## 验收

1. 全量回归 + dep-graph/contract 绿。
2. ThemeStore：内置只读；用户保存/导入/导出/删除；非法 JSON/重复 id 处理。
3. applyTheme：替换 + 保留被引用 token/style；未引用丢弃；preserved 报告；undo。
4. 自定义颜色：添加/编辑/删除；被引用阻止/警告；颜色选择器可见（数据层测试）。
5. FontLibrary：本地/URL 导入、list/remove、deck refs、浏览器/CLI 字节一致；系统/缺失；全局 embed/subset。
6. server/cli 新命令有 JSON/错误；旧 fonts/icons 仍暂由 W10 删除。
7. 写入范围外零 diff；无新增依赖。

## 前置上下文

待 W2 合并后补：runtime/provider API、paths、W2 handoff、现有 font/theme 结构、稳定区、已知坑。
