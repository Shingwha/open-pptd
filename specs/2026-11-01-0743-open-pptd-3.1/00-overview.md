# open-pptd 3.1 优化总纲

> 启动：2026-11-01 07:43（UTC+8）
> 组名：`2026-11-01-0743-open-pptd-3.1`（定死，跨天不改名）
> 基线：3.0 已合并，`main` 17b4e46；`run-all` 39/39；golden 156/156 字节一致。

## 0. 阅读顺序

1. 本文件
2. `ref/repo-map.md`（3.0 后的现状、入口、命令、陷阱）
3. `ref/interfaces.md`（本组新增的编辑器操作 API、UI DOM 契约、设计令牌）
4. 当前波次工单：`01-W1-editor-ops.md`；W2/W3 在上一波合并后 JIT 补全
5. `ref/design-direction.md`（W2 视觉方向）

真相优先级：代码与测试 > handoff > spec。

## 1. 目标（按用户三波）

1. **编辑器必要操作回归**：3.0 的最小编辑器删得过多。恢复元素级复制/剪切/粘贴/重复、可见的选中操作条，保留现有多选/框选/拖动/缩放/旋转/参考线/删除/undo/redo/微调；不恢复属性面板、组合、对齐分布、层级、页面批量等重功能。
2. **前端整体重构**：不沿用旧排版/布局/视觉，做一套克制、现代、清晰的设计；覆盖编辑器（顶栏/画布/缩略条/添加/Design 抽屉/选中操作）与画廊（Home）；保留浅色/深色；不花哨（无渐变、玻璃拟态、重阴影、装饰性动效）。
3. **代码整理**：删除死代码/未使用导出与 import；合并可安全复用的重复逻辑；把“文件 banner + 历史 wave + spec 编号复述”的冗余注释压缩为按功能组织的简洁文档；**公式解析相关文件与 vendor 第三方不动**。公共 API 的 JSDoc、复杂算法说明、真实约束保留。

## 2. 波次表

| 波 | 名称 | 目标 | 依赖 | 主要产出 | 波末门禁 |
|---|---|---|---|---|---|
| W1 | 编辑器必要操作 | 复制/剪切/粘贴/重复 + 选中操作条 + 快捷键/撤销/跨页 | — | editor state/api/keyboard/canvas/skeleton/styles；`tests/e2e/editor-ops.mjs` | 全量 39/39；editor-minimal/page-ops/preview-shell 全过；新 e2e 全过 |
| W2 | UI 整体重构 | 新设计令牌/布局/组件；编辑器 + 画廊；深浅色/响应式 | W1 | tokens/skeleton/styles/design-panel/gallery/file-menu；截图 | 全量 39/39；全部 e2e 全过；golden 零漂移（渲染管线不变） |
| W3a | 代码去重/删死代码 | 安全合并 + 零引用删除 + 未用 import | W2 | packages/editor/tests 的定向文件 | 全量 39/39；e2e；contract/dep-graph |
| W3b | 注释/文档整理 | 压缩 banner、去历史/spec 编号复述、保留公共 JSDoc/算法 | W3a | 全仓非公式、非 vendor 的 .js/.mjs | 全量 39/39；diff 仅注释；contract/dep-graph |
| W4 | 试用反馈修复 | 画廊静态 / 越界提示 / Logo / 缩略图选中 | 3.1 | editor preview/view/skeleton/thumbnails/styles；feedback-fixes e2e | 全量 39/39；全部 e2e；golden 156/156 |
| W5 | 恢复添加元素 | 形状/线条/图片 + 6 项添加菜单 | W4 | editor types/add-menu/api/toolbar/styles；add-elements e2e | 全量 39/39；全部 e2e；golden 156/156；图片落盘 |
| W6 | 性能优化 | 纯度量 + 缩略图增量 + viewport 缓存 + perf 工具 | W5 | editor view/thumbnails/viewport/api；tests/perf | 全量 39/39；全部 e2e；golden 156/156；六茶 p50 ≤20ms |
| W7 | 画廊优化 | 隐藏青山 / 去卡片子标题 / Logo 回顶 | W6 | gallery.js/css、server gallery hidden、manifest、截图 | 全量 39/39；全部 e2e；golden 156/156；docs 35/35 |
| W8 | EV 学术风重构 | EV 17 页蓝色学术风 + 海报删中文句 + golden rebaseline | W7 | examples/ev-range、poster、golden manifest | check/build 0 error；golden 156/156；全部 e2e |

> W3b 可按**文件不相交**并行 3–4 个 worker；合并顺序固定，lead 逐个门禁后合并。

## 3. 全局不变量

1. **行为不回归**：W1 只加操作；W2 只改视觉/布局；W3a 只删/并**等价**逻辑；W3b 只改注释。任何一波都不改变渲染/导出/保存语义。
2. **DOM 契约**：W2 可改布局与 class，但必须同步 e2e；`[data-element-id]`、`[data-handle]`、`[data-rotate-handle]`、`#canvas` 单实例、`#page-count` 文本、页面菜单文案等契约逐项核对（见 `ref/interfaces.md` §3）。
3. **浅色/深色**：`documentElement[data-pptd-theme]` 机制保留；两套 token 均通过对比度检查。
4. **无新增依赖/构建**；ESM；注释英文；commit 中文 conventional。
5. **公式解析不动**：`packages/model/mathml2omml.js`、formula 相关测试/fixtures 不参与 W3b；`vendor/` 第三方不整理。
6. **发布/推送**：不 push/tag/发版，等指令。

## 4. 共享文件所有权

- `editor/app/state.js`、`api.js`、`keyboard.js`：W1 唯一所有者；W2/W3 不得并行改。
- `editor/skeleton.js`、`editor/styles/**`、`editor/gallery.js`、`editor/interaction/design-panel.js`：W2 唯一所有者。
- 12 个包 barrel / `contract.json` / `package.json` / `tests/run-all.mjs`：lead；W3a 如需删除公共导出必须先报批。
- W3b 每个 worker 的文件组在工单中逐文件列出，互不相交；barrel 归 lead。

## 5. 门禁

- 每波：`node tests/run-all.mjs`（当前 39 项）、`dep-graph`、`contract`；e2e 按波次全跑（render/editor-minimal/page-ops/preview-shell/browser-export/incremental + 已有套件）；`golden-diff` 零漂移（W2 也不得改渲染）。
- **测试克制（2026-11-01 用户要求）**：非必要不新增测试；优先更新现有套件或手工抽验。只有行为无法由现有门禁覆盖、且回归成本明显时才新增最小测试；不为一次性内容/视觉改动新增套件。
- W2：桌面 1440×900 + 窄屏 480×840 截图；浅色/深色各一张；对比度抽验。
- W3a：删/并后 contract/dep-graph 绿；e2e 全过；无行为 diff（导出字节允许时间戳差异，按结构事实验收）。
- W3b：`git diff` 只含注释行；逐组跑全量。
- 写入范围外零 diff（handoff/工单回写例外）。

## 6. 设计方向（W2 拍板）

**Paper & Ink / 编辑工作室**：暖纸色底 + 墨色文字 + 单一朱砂强调色；细发丝线、极轻阴影、4–8px 圆角；系统无衬线正文 + 衬线展示标题（画廊/品牌字）；无渐变、无玻璃、无装饰图形。编辑器保持“画布是主角”，顶栏与缩略条退后；画廊用大标题 + 作品网格，像一本作品集而不是后台表格。详见 `ref/design-direction.md`。

## 7. 当前状态

- ✅ W1（2026-11-01 @ `feat/3.1-w1-editor-ops` → main `483e57e`）：复制/剪切/粘贴/重复 + 选中操作条；editor-ops 22/22；全量 39/39；golden 零漂移。
- ✅ W2（2026-11-01 @ `feat/3.1-w2-ui` → main `35a7e23`）：Paper & Ink 视觉系统；编辑器/画廊重做；浅深/响应式；deck 绘制面固定字体与墨色。全部 e2e 通过；run-all 39/39；golden 156/156。
- ✅ W3a（2026-11-01 @ `feat/3.1-w3a-{prod,tests}` → main）：生产去重 23 文件、测试工具去重 17 文件；run-all 39/39、全部 e2e、golden 156/156。
- ✅ W3b（2026-11-01 @ `feat/3.1-w3b-{a..e}` → main）：注释行 8,488 → 5,997（−29.3%）；公式/vendor 零 diff；全量门禁绿。
- ✅ W4（2026-11-01 @ `feat/3.1-w4-feedback` → main）：画廊封面静态、越界提示仅编辑器、字标 OPEN PPTD、缩略图不再选中内容；feedback-fixes 21/21。
- ✅ W5（2026-11-01 @ `feat/3.1-w5-add` → main）：添加菜单六类（文字/表格/图表/形状/线条/图片）；形状 187 preset 搜索、线条 3 变体、图片落 media；add-elements 12/12。
- ✅ 3.1 终验 + 试用反馈：run-all 39/39、全部 e2e、golden 156/156；详见 `handoff/W3.1-lead.md`。未 push/tag/发版。
- 另修 `open --detach` 子进程重复开浏览器（补 `--no-open`）。
- ✅ W6（2026-11-01 @ `feat/3.1-w6-perf` → main）：删除编辑器 DOM 度量、缩略图增量/分帧、viewport 缓存；六茶画布 p50 50→12ms，青山切页 176→14ms；perf 3 连跑全达标；全部 e2e、run-all 39/39、golden 156/156。
- ✅ W7（2026-11-01 @ `feat/3.1-w7-gallery` → main）：删除青山项目/展示图；卡片去描述子标题；Logo 回页首；perf/ui-shots 换远川复盘；golden 23/144。
- ✅ W8（2026-11-01 @ `feat/3.1-w8-ev` → main）：EV 17 页白色/海军蓝学术风（删 58 装饰）、思源宋体标题；海报删中文副标题；golden rebaseline 23/144；全部 e2e、run-all 39/39、docs 35/35。
