# ref · DSH 主题令牌映射（本仓侧权威参考）

> 日期：2026-09-30（细线 Line 重构后）
> 依据：`ref/dsh-theme-requirements.md`（适配面要求，最高权威）；`docs/archive/specs/ref/integration-plan.md` §5.5 / 附录 B（令牌对照的原始出处，已归档）。
> 范围：本文只写**本仓事实**——令牌名、取值来源、注入约定。DSH 侧 `--dsw-alias-*` 的权威清单在其自身 dist 内（约 110 个语义别名），本仓不复制、不依赖。
> 用途：open-pptd × DSH 适配仓的**主题桥**（读 DSH 令牌 → 映射 → 注入本仓）唯一的对照表。

## 1. 机制（契约 3，签名冻结）

### 1.1 三个导出（`editor/theme.js`）

| 导出 | 签名 | 语义 |
|---|---|---|
| `TOKENS` | `string[]` | 参与主题切换的令牌名（清单见 §2；尺寸/动效/层级/字体令牌**不在**其中，它们不随主题变） |
| `defaultTokens` | `(mode = "light") → Record<string,string>` | 内置浅/深两套取值：运行时用隐藏探针元素 + `getComputedStyle` 从 `tokens.css` 读出（本模块不持有任何颜色字面量）；无 DOM（Node/SSR）时返回空对象 |
| `applyThemeTokens` | `(rootEl, { tokens?, mode? }) → () => void` | `mode` → rootEl 的 `data-pptd-theme` 属性；`tokens` → rootEl 的**行内**自定义属性；返回**幂等**还原函数 |

### 1.2 取值来源与两层主题

- `editor/styles/tokens.css` 是唯一取值来源，三层结构：
  1. `:root, [data-pptd-theme]` —— 尺寸/动效/间距/层级 + **浅色**语义色（规范名，值的唯一出处）；
  2. `[data-pptd-theme="dark"]` —— **深色**语义色 + 深色四档阴影/遮罩/chip 取值；
  3. 旧别名块 `:root, [data-pptd-theme]` —— `--primary*` / `--n-*` / `--f-*` / `--r-*` / `--h*` / `--sh-*` / `--t-*` 只指向规范名，**不是覆盖面**。
- 选择器列表含 `[data-pptd-theme="light"]`，使**脱离文档的探针元素**也能读到任一板（`defaultTokens` 的实现基础）；`[data-pptd-theme]`（属性存在）让别名块对任意主题子树生效。
- **组件永远不知道浅/深**：只有 tokens.css 的 `[data-pptd-theme="dark"]` 块知道（ref §2）。因此"哪些令牌在深色下不一样"完全由该块决定，宿主不需要判断主题、只需要注入。
- 两层：自带默认板（独立 serve / Pages 自足）+ 宿主覆盖（`applyThemeTokens`）。宿主**未覆盖**的令牌回落内置板——这是"只映射子集"也安全的原因。

### 1.3 调用约定

1. **只注入规范名**（§2 清单）。`--primary*` 等旧名是别名，覆盖别名 ≠ 覆盖规范令牌；新集成一律用 `--bg / --panel / --line / --line-strong / --ink / --sub / --faint / --hover / --active / --accent / --accent-hover / --accent-soft / --on-accent / --danger / --success / --warning / --paper / --mask / --sel-bg / --sel-ring`。
2. **`mode` 与 `tokens` 一起给**：只给 `tokens` 不给 `mode`，深色下未覆盖的令牌会停在浅色板。只覆盖一个令牌也是合法调用（例：`{ tokens: { "--accent": "#7c3aed" } }`）。
3. 行内令牌**优先于样式表**（行内自定义属性），所以宿主映射生效；`mode` 写在 rootEl 的属性上，深色板的其余取值随之接管。
4. 返回值是**幂等还原函数**：删属性 + 清行内覆盖；重复调用无副作用。适配仓在卸载 iframe / 销毁编辑器时必须调用（编辑器自身的 `createEditor` 亦以此清理）。
5. **作用域 = 传入元素**：编辑器/画廊在本仓都把主题挂 `document.documentElement`（画廊根 `index.html` 默认 `data-pptd-theme="light"`）；同一页里可以只给某个子树换肤（探针用法同理）。
6. **宿主注入 `mode` 时本仓内置三态不启动**（`editor/editor.js`：`interactive && !theme?.mode`），注入优先，避免两套逻辑互相覆盖。
7. **不要注入 `--dsw-*` 名**：本仓样式只读 §2 的规范名；`--dsw-*` 由适配仓在宿主侧读取后**换算**成规范名再注入，映射表见 §3。

### 1.4 模式信号与三态（本仓自带，供对照）

- DSH 的暗色标记是 **`body[data-ds-dark-theme]`（属性，不是媒体查询）** → 适配仓唯一的模式信号是"该属性是否存在"，映射为 `mode: "dark" | "light"`。
- 本仓独立运行时自带三态：localStorage 键 **`pptd.themeMode`**，取值 `light | dark | auto`；`auto` 实时跟随 `prefers-color-scheme`；生效值写在 `document.documentElement` 的 `data-pptd-theme`。
- **画廊与编辑器共享同一套令牌与同一 `data-pptd-theme` 机制**（D7）：同一 localStorage 键、同一主题根，宿主对画廊注入一次即可（画廊 `editor/gallery.js` 用同一个 `bindThemeMode`）。

## 2. 本仓语义令牌清单（分组）

浅/深两列是 `tokens.css` 的实际取值（`var(...)` 表示别名，解析后与目标同值）。

### 2.1 背景 / 纸面

| 令牌 | 浅 | 深 | 说明 |
|---|---|---|---|
| `--bg` | `#f5f6f8` | `#1b1f26` | 页面底（编辑器画布区、画廊底） |
| `--panel` | `#ffffff` | `#16191f` | 面板/卡片底（顶栏、缩略条、属性面板、浮条、下拉、对话框、画廊卡片） |
| `--paper` | `#ffffff` | `#f7f8fa` | 幻灯片纸面/缩略图底：**深色下仍为浅色**（版面可读性优先），有意不跟随宿主 |

### 2.2 线 / 边框

| 令牌 | 浅 | 深 | 说明 |
|---|---|---|---|
| `--line` | `#e7eaef` | `#353c47` | 发丝分隔（1px，D1 的层级手段） |
| `--line-strong` | `#d3d8e0` | `#454d5a` | 控件/卡片边框 |
| `--chip-border` | `color-mix(in srgb, var(--ink) 12%, transparent)` | `rgba(255,255,255,0.14)` | chip 发丝边（由 ink 派生） |

### 2.3 文本

| 令牌 | 浅 | 深 | 说明 |
|---|---|---|---|
| `--ink` | `#1c2532` | `#eef1f5` | 主文本/图标 |
| `--sub` | `#5b6572` | `#b3bbc6` | 次文本 |
| `--faint` | `#98a2af` | `#6b7482` | 三级文本/占位/计数 |
| `--disabled` | `#98a2af` | `#6b7482` | 禁用态 |

### 2.4 交互态

| 令牌 | 浅 | 深 | 说明 |
|---|---|---|---|
| `--hover` | `#ebedf0` | `#2a303a` | 中性悬停洗色（无彩色填充） |
| `--active` | `#e7eaef` | `#353c47` | 按下/激活中性洗色 |

### 2.5 选中（本仓领域态）

| 令牌 | 浅 | 深 | 说明 |
|---|---|---|---|
| `--sel-bg` | `var(--accent-soft)` | 同左 | 多选/缩略图选中底 |
| `--sel-ring` | `var(--accent)` | 同左 | 选中环/焦点环（1px，选中叠加层零填充） |

### 2.6 品牌主色族

| 令牌 | 浅 | 深 | 说明 |
|---|---|---|---|
| `--accent` | `#2563eb` | `#4d8dff` | 品牌主色（激活 FAB、选中环、滑块指示） |
| `--accent-hover` | `#1d4ed8` | `#6ba0ff` | 主色悬停 |
| `--accent-soft` | `#eef4fd` | `#1c2a44` | 主色浅底（激活项/多选底） |
| `--on-accent` | `#ffffff` | `#ffffff` | 主色底上的前景 |

### 2.7 语义色（成功/警告/危险）

| 令牌 | 浅 | 深 | 说明 |
|---|---|---|---|
| `--danger` / `--danger-soft` | `#d64545` / `#fdf1f1` | `#ff6b6b` / `#3a1f22` | 危险/删除 |
| `--success` / `--success-soft` | `#2e9e5b` / `#ecf7f0` | `#3fbf74` / `#16301f` | 成功 |
| `--warning` / `--warning-soft` | `#9a6700` / `#fdf6e3` | `#e0a83a` / `#382c12` | 警告 |

### 2.8 遮罩 / 缩略图 chip

| 令牌 | 浅 | 深 | 说明 |
|---|---|---|---|
| `--mask` | `color-mix(in srgb, var(--ink) 45%, transparent)` | `rgba(0,0,0,0.6)` | 窄屏属性面板遮罩/对话框遮罩 |
| `--thumb-chip-bg` / `--thumb-chip-ink` | `color-mix(in srgb, var(--ink) 65%, transparent)` / `var(--panel)` | `rgba(0,0,0,0.7)` / `#eef1f5` | 缩略图删除钮 chip |
| `--thumb-num-bg` / `--thumb-num-ink` | `color-mix(in srgb, var(--panel) 85%, transparent)` / `color-mix(in srgb, var(--ink) 60%, transparent)` | `rgba(22,25,31,0.85)` / `rgba(238,241,245,0.7)` | 缩略图页码 chip |

### 2.9 阴影（D1：只允许出现在下拉/对话框）

| 令牌 | 浅 | 深 |
|---|---|---|
| `--shadow-sm` | `0 1px 2px rgba(28,37,50,0.06)` | `0 1px 2px rgba(0,0,0,0.35)` |
| `--shadow-md` | `0 4px 16px rgba(28,37,50,0.1)` | `0 4px 16px rgba(0,0,0,0.45)` |
| `--shadow-lg` | `0 12px 32px rgba(28,37,50,0.14)` | `0 12px 32px rgba(0,0,0,0.6)` |
| `--shadow-sheet` | `0 -8px 32px rgba(28,37,50,0.16)` | `0 -8px 32px rgba(0,0,0,0.55)` |

### 2.10 旧别名（兼容面，不是覆盖面）

`--primary / --primary-strong / --primary-soft / --primary-tint / --scrollbar`、`--n-*`、`--f-*`、`--r-*`、`--h / --h-lg / --h-sm`、`--sh-pop / --sh-modal`、`--t-*`、`--font-ui`：除少数在原始版本里没有对应者的字面量（`--h-sm: 24px`、`--t-slow: 200ms`、`--n-100/-600/-800` 的浅深取值）外，其余全部指向 §2.1–2.9 的规范名。宿主若按旧名覆盖不会影响规范令牌，请按规范名注入。

### 2.11 不参与主题切换（浅/深同值）

尺寸与排版：`--radius-sm/--radius/--radius-lg`（6/8/12，D6 冻结）、`--control-h(28)/--control-h-lg(32)`、`--topbar-h(44)`、`--space-1..6`、`--text-xs..2xl`、`--font/--mono`；
动效与层级：`--dur-fast/--dur-med/--ease`、`--z-sticky/--z-dropdown/--z-overlay/--z-modal/--z-toast`。
这些令牌由 `tokens.css` 一处定义、编辑器与画廊共用（缩略条/顶栏/面板尺度的共享面），**不需要**也不应该由宿主注入。

## 3. `--dsw-alias-*` 语义类别对照

方向：DSH 令牌 → 本仓规范令牌（读 DSH、注入本仓）。DSH 侧取值随其主题表切换，适配仓只需搬运。

### 3.1 直接对应（DSH alias 有同义项）

| DSH `--dsw-alias-*` | 本仓令牌 | 备注 |
|---|---|---|
| `bg-base` | `--bg` | 页面底 |
| `bg-layer-1` | `--panel` | 面板/卡片底 |
| `bg-mask-1`（2/3 同理） | `--mask` | 本仓只有单一遮罩阶；取最接近的一档，或用内置值（深色 `rgba(0,0,0,0.6)`）；归档方案曾按"无直接对应、需派生"处理 |
| `border-l1` | `--line` | 发丝分隔 |
| `border-l2` | `--line-strong` | 控件/卡片边 |
| `label-primary` | `--ink` | 主文本/图标 |
| `label-secondary` | `--sub` | 次文本 |
| `label-tertiary` | `--faint` | 三级文本/占位 |
| `label-dimmed` | `--disabled` | 禁用态 |
| `label-inverted` / `brand-text` | `--on-accent` | 强调底上的前景 |
| `brand-primary` | `--accent` | 品牌主色 |
| `button-primary-fill` | `--accent` | 主按钮底（本仓的实底只出现在激活态） |
| `button-primary-hover` | `--accent-hover` | 主按钮悬停 |
| `button-ghost-active-fill` | `--accent-soft` | 幽灵按钮激活底（本仓"激活=浅底"的唯一彩色填充） |
| `interactive-bg-hover` | `--hover` | 中性悬停 |
| `interactive-bg-active` | `--active` | 中性按下 |
| `state-error-primary` | `--danger` | 危险 |
| `state-success-primary` | `--success` | 成功 |
| `state-warn-primary` | `--warning` | 警告 |
| `state-idle-primary` | `--faint` | 空闲/中性（原方案即把 `--faint` 对到这里） |
| `scrollbar-bg-l1` | `--scrollbar`（旧别名 → `--line-strong`） | 缩略条横向滚动条轨道 |
| `scrollbar-hover-l1` | `--accent`（本仓用 `--primary`，同值） | 滚动条滑块悬停 |
| `link` | `--accent` | 本仓无独立 link 令牌，链接沿用主色 |

与归档方案（`docs/archive/specs/ref/integration-plan.md` §5.5）的差异，三点：
① 主色列用**规范名** `--accent`（方案写的 `--primary` 现已降级为别名，覆盖它不生效）；
② 方案把 `--primary-strong/-soft/-tint`、三个 `*-soft`、`--mask` 列为"无直接对应、需派生"——本表在 DSH 别名族里找到同义项时直接对应（`button-primary-hover` → `--accent-hover`、`button-ghost-active-fill` → `--accent-soft`、`bg-mask-*` → `--mask`），找不到的落入 §3.2；`--primary-tint` 属旧别名，随 `--accent` 自动跟随；
③ 本表补齐了方案未列的 `--hover` / `--active` / `--sel-*` / `--paper` / `--chip-border` / `--thumb-*`。

### 3.2 本仓有、DSH alias 无直接对应（派生或保留内置值）

| 本仓令牌 | 处理 | 说明 |
|---|---|---|
| `--accent-soft` / `--danger-soft` / `--success-soft` / `--warning-soft` | 派生或保留 | DSH 语义别名里没有浅底档；可用 `color-mix(in srgb, <映射后的主色> 12%, <映射后的 --panel/--bg>)` 派生，或直接保留本仓内置值（`defaultTokens(mode)` 已齐全） |
| `--chip-border` | 派生或保留 | 发丝 chip 边，内置值由 ink 用 `color-mix` 派生 |
| `--thumb-chip-bg` / `--thumb-chip-ink` / `--thumb-num-bg` / `--thumb-num-ink` | 保留 | 缩略图 chip，仅编辑器内部 |
| `--sel-bg` / `--sel-ring` | 保留（推荐） | 选中态为本仓领域语义；`--sel-ring` 与 `--accent` 同值，映射主色即自动跟随 |
| `--shadow-sm/md/lg/sheet` | 保留（推荐） | 可选映射到 `--dsw-elevation-soft/panel/prominent` 族；但 D1 限定投影只出现在下拉/对话框，保留内置四档即可 |
| `--paper` | **必须保留内置值** | 幻灯片纸面/缩略图底，深色下仍为浅色是有意设计；映射成 `bg-base` 会让纸面在深色下变黑、版面不可读 |
| `bg-layer-2 / bg-layer-3`、`border-l3/l4`、`state-business-primary` | 忽略 | 本仓没有对应的第三阶底色/边框档与业务色，DSH 有值也不注入 |

### 3.3 明确不做映射（DSH 有、本仓有意不接）

| DSH 令牌族 | 原因 |
|---|---|
| `--dsw-font-*` | 本仓自带字体栈（`--font`/`--mono`），排版比例不走主题（D6：圆角/排版冻结） |
| `--dsw-corner-shape` / 圆角族 | 本仓圆角固定 6/8/12（D6） |
| `--dsw-focus-ring-*` | 本仓焦点环 = 1px `--sel-ring`（映射 `--accent` 即跟随品牌色） |
| `--dsw-menu-surface-fill` | 本仓菜单是自有浮层（`--panel` + `--shadow-md`），不接共享菜单契约 |
| `--dsh-*`（框架力学变量，如 `frame-top-clearance`、`scrollbar-*`） | 非设计令牌，不进主题桥 |

## 4. 深浅两模式映射示例（各一行）

宿主侧取值为 `dsw(name) = getComputedStyle(dshRoot).getPropertyValue(name).trim()`（由适配仓提供；本仓不读 `--dsw-*`）。下表即 §3.1 的可执行子集：

```js
// 浅色：注入子集，未覆盖的令牌回落内置浅色板
applyThemeTokens(rootEl, { mode: "light", tokens: {
  "--bg": dsw("--dsw-alias-bg-base"), "--panel": dsw("--dsw-alias-bg-layer-1"),
  "--line": dsw("--dsw-alias-border-l1"), "--line-strong": dsw("--dsw-alias-border-l2"),
  "--ink": dsw("--dsw-alias-label-primary"), "--sub": dsw("--dsw-alias-label-secondary"),
  "--faint": dsw("--dsw-alias-label-tertiary"), "--disabled": dsw("--dsw-alias-label-dimmed"),
  "--hover": dsw("--dsw-alias-interactive-bg-hover"), "--active": dsw("--dsw-alias-interactive-bg-active"),
  "--accent": dsw("--dsw-alias-brand-primary"), "--accent-hover": dsw("--dsw-alias-button-primary-hover"),
  "--accent-soft": dsw("--dsw-alias-button-ghost-active-fill"), "--on-accent": dsw("--dsw-alias-label-inverted"),
  "--danger": dsw("--dsw-alias-state-error-primary"), "--success": dsw("--dsw-alias-state-success-primary"),
  "--warning": dsw("--dsw-alias-state-warn-primary"), "--mask": dsw("--dsw-alias-bg-mask-1"),
} });

// 深色：同一张表 + mode: "dark"（未覆盖项由内置深色板接管：阴影、--paper、chip、--sel-* 等）
applyThemeTokens(rootEl, { mode: "dark", tokens: { /* …与上一行完全相同的映射表… */ } });
```

深色不需要另备一套映射表：**DSH 侧**的 alias 值本身已随其主题切换，本仓侧只靠 `mode` 切换内置板补齐剩余项。禁止只注入浅色（深色下未覆盖的令牌会停在浅色板）。

## 5. 适配仓自查清单

1. 注入的每个名字都在 §2 清单内（写错名字会静默无效，没有报错）。
2. `mode` 与 `tokens` 同时给；卸载时调用还原函数。
3. 深色下逐屏核对：顶栏 / 缩略条 / 浮条 / 属性面板 / 下拉 / 对话框 / 画廊卡片不露浅底破绽；`--paper` 保持浅色是预期。
4. 不覆盖 §2.11 的尺寸/动效令牌；不改 `tokens.css`、`theme.js`（契约 3 冻结：`TOKENS / defaultTokens / applyThemeTokens` 签名与语义不变）。
5. 需要新增语义令牌时按本仓评审流程加在 `tokens.css` 的规范块（浅/深各一处），旧别名块不新增值。
