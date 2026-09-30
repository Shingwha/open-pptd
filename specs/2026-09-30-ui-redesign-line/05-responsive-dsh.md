# Spec 05 · 窄屏整饰 + DSH 主题适配校验（波次 W5，收尾）
> 分支 `feat/ui-line-responsive-dsh`；前置：W2/W3/W4 全部合并；深读：`00-overview.md`、`ref/dsh-theme-requirements.md`、`editor/styles/responsive.css`、`editor/theme.js`
> 状态：✅ 2026-09-30 已合并 @ feat/ui-line-responsive-dsh → main（4 commits）

## 目标

窄屏（≤900px / ≤480px）体验整饰到位（浮条/FAB/缩放组/面板不打架）；把「颜色只活在 tokens.css」变成长期回归门禁；产出本仓侧 DSH 令牌映射文档；核对契约 3 未被前面波次破坏。

## 工单（按序执行，每项一个 commit）

### T1 窄屏整饰（responsive.css）
- 浮条：底部横滚条与 FAB（右下）不重叠——现状 FAB `bottom:16px right:14px` 与浮条 `bottom:calc(64+12+46)` 间距核对，必要时浮条 max-width 让出右下区域或 FAB 上移；≤480 同样核对。
- 缩放组：在缩略条内的窄屏形态——控件 28px→24px 档（有 `--h-sm:24px` 可用），页数与缩放不挤（可隐藏 `⛶`）；缩略条窄屏高度 64px 内放得下。
- 顶栏：横滚保留；`brand-file`（文件名）在窄屏隐藏（现状如此则保持）。
- 属性面板 sheet：grabber、55vh、mask 与新的细线头部协调；「⋯」打开的 sheet 关闭钮可达。
- 对话框/添加菜单：保持既有 sheet 化，无回归即可。
- 画廊窄屏：卡片栅格 `minmax` 在 320px 以下不溢出（现状 minmax(320px,1fr) 在 <338px 视口会横向溢出——改为 `minmax(min(320px,100%),1fr)` 或同等手法）。

### T2 令牌字面量门禁（新增 tests/regression/ui-token-literals.mjs）
- 断言：`editor/styles/*.css` 中颜色字面量（`#hex3/4/6/8`、`rgb()/rgba()`、`hsl()`）只允许出现在 `tokens.css`；`present.css` 整文件白名单豁免（投影面）；注释行不计。
- 断言：每个样式文件（除 tokens.css）的 `box-shadow` 值只允许引用 `var(--shadow-*)`。
- 断言：tokens.css 中 `--topbar-h` 等尺寸令牌被 gallery/editor 共享（此项不做，人工文档即可）。
- 在 `tests/run-all.mjs` 的 suites 数组注册一行（注释英文）。

### T3 DSH 映射文档（新增 specs/ref/dsh-theme-mapping.md）
- 内容：本仓语义令牌（`--bg/--panel/--line/--line-strong/--ink/--sub/--faint/--hover/--active/--accent*/--paper/--mask/...` 分组清单）→ DSH `--dsw-alias-*` 语义类别对照表（背景/浮层/边框/主文本/次文本/品牌主色/成功警告危险…，按 `ref/dsh-theme-requirements.md` 的语义分组）；深浅两模式各一行映射示例；`applyThemeTokens(rootEl,{tokens,mode})` 调用约定与 `[data-pptd-theme]` 机制说明。
- 这是给适配仓作者的权威参考，只描述本仓事实，不出现 `@deepseek-ai` import 之类的实现。

### T4 契约核对与截图走查
- 静态核对：`editor/theme.js` 的 `TOKENS/defaultTokens/applyThemeTokens` 签名与 W1 前一致（`git diff main...HEAD -- editor/theme.js` 应为空——本组无人拥有它）；若被意外改动，**回退该文件**并记录。
- 跑 `node tests/tools/ui-shots.mjs`（固定 CDP 端口 9247，确保无其它 Chrome 实例占用；失败可重试一次，再失败记录为未决）产出编辑器/画廊/窄屏截图，与 `tests/ui-shots-out/` 旧图（若有）做尺寸与基本布局对比，报告差异点（这是 A/B 证据，不追求像素一致）。
- `node tests/run-all.mjs` 全绿收尾。

## 验收
1. `node tests/run-all.mjs` 全绿（独立 `echo $?`）
2. ui-token-literals.mjs 单独跑过且断言零豁免增长
3. dsh-theme-mapping.md 覆盖：语义令牌全清单、深浅两模式、applyThemeTokens 约定
4. theme.js 零 diff 证据（git diff 输出贴报告）

## 禁触清单
`editor/styles/{tokens,primitives,layout,canvas,inspector,panels}.css`（发现硬伤上报 lead，不越界修）、`editor/index.html`、根 `index.html`、`editor/app/**`、`editor/interaction/*`、`editor/types/*`、`packages/`。

## 最终报告格式
工单状态表 / commit 清单 / 自测真实结论（含 ui-shots 输出路径与 A/B 差异）/ 偏差与取舍 / 未决问题
